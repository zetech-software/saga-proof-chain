import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAuditEvent } from "./audit-events";

/**
 * Ciclo de vida de marcas, documentos e certificados (somente Admin, decidido no servidor):
 * - Excluir  -> vai para "Excluídos" (nada é apagado, arquivo fica no Storage).
 * - Restaurar -> volta a aparecer, com os mesmos vínculos.
 * - Excluir definitivamente -> só a partir de "Excluídos", com confirmação forte,
 *   bloqueios de dependência e remoção do arquivo por caminho exato.
 * Também: marcação explícita de teste, dry-run de limpeza e revisão de restauração.
 * Nenhuma rotina automática apaga nada.
 */

export const RETENTION_DAYS = 30;
export const PURGE_CONFIRM = "EXCLUIR DEFINITIVAMENTE";
export const TEST_CLEANUP_CONFIRM = "CONFIRMAR";

const typeSchema = z.enum(["trademark", "document", "certificate"]);
type ResType = z.infer<typeof typeSchema>;
const idSchema = z.string().uuid();

const TABLE: Record<ResType, "trademarks" | "documents" | "certificates"> = {
  trademark: "trademarks",
  document: "documents",
  certificate: "certificates",
};
const BUCKET: Record<ResType, "documentos" | "certificados" | null> = {
  trademark: null,
  document: "documentos",
  certificate: "certificados",
};

type Ctx = { supabase: unknown; userId: string };
// Cliente de serviço carregado dentro dos handlers; tipado de forma solta para consultas dinâmicas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SA = any;

async function requireAdmin(ctx: Ctx): Promise<SA> {
  const supabase = ctx.supabase as {
    rpc: (fn: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
  };
  const { data } = await supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (data !== true) throw new Error("Sem permissão.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as SA;
}

async function logLifecycle(
  sa: SA,
  type: string,
  id: string,
  actor: string,
  action: string,
  details: Record<string, unknown> = {},
) {
  await writeAuditEvent(() => sa.from("resource_lifecycle_events").insert({
    resource_type: type,
    resource_id: id,
    action,
    actor_id: actor,
    details,
  }));
}

async function loadRow(sa: SA, type: ResType, id: string) {
  const cols =
    type === "trademark"
      ? "id,name,created_by,organization_id,deleted_at,deleted_by"
      : type === "document"
        ? "id,title,created_by,organization_id,deleted_at,deleted_by,storage_path,status,file_name"
        : "id,title,document_id,trademark_id,deleted_at,deleted_by,storage_path,file_name";
  const { data } = await sa.from(TABLE[type]).select(cols).eq("id", id).maybeSingle();
  if (!data) throw new Error("Item não encontrado.");
  return data as Row;
}

type Row = {
  id: string;
  name?: string | null;
  title?: string | null;
  created_by?: string | null;
  organization_id?: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  storage_path?: string | null;
  status?: string | null;
  file_name?: string | null;
};

const label = (type: ResType, row: Row) =>
  (type === "trademark" ? row.name : row.title) ?? "(sem título)";

/**
 * Remove UM objeto do Storage por caminho exato. Nunca por prefixo.
 * Confere: caminho sem curingas, objeto existe, nenhum outro registro aponta para ele.
 */
async function removeExactObject(sa: SA, bucket: "documentos" | "certificados", path: string, selfId?: string) {
  if (!/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,160}$/i.test(path) || path.includes("/pending/")) {
    return { removed: false, reason: "caminho fora do padrão" };
  }
  const [dir, name] = path.split("/");
  const { data: listed, error: listError } = await sa.storage.from(bucket).list(dir, { search: name, limit: 100 });
  if (listError) return { removed: false, reason: "falha ao verificar arquivo" };
  if (!(listed ?? []).some((o: { name: string }) => o.name === name)) {
    return { removed: false, reason: "arquivo não encontrado" };
  }
  let docsQuery = sa.from("documents").select("id").eq("storage_path", path);
  let certsQuery = sa.from("certificates").select("id").eq("storage_path", path);
  if (selfId) {
    docsQuery = docsQuery.neq("id", selfId);
    certsQuery = certsQuery.neq("id", selfId);
  }
  const [docs, certs] = await Promise.all([docsQuery, certsQuery]);
  if (docs.error || certs.error) {
    return { removed: false, reason: "falha ao verificar referências do arquivo" };
  }
  if ((docs.data ?? []).length + (certs.data ?? []).length > 0) {
    return { removed: false, reason: "arquivo usado por outro registro" };
  }
  const { error } = await sa.storage.from(bucket).remove([path]);
  return { removed: !error, reason: error ? "falha ao remover" : null };
}

/** Excluir (recuperável): só marca deleted_at. Arquivo e vínculos ficam intactos. */
async function softDelete(sa: SA, type: ResType, id: string, actor: string, reason?: string | null) {
  const row = await loadRow(sa, type, id);
  if (row.deleted_at) return { ok: true, already: true };
  const { error } = await sa
    .from(TABLE[type])
    .update({ deleted_at: new Date().toISOString(), deleted_by: actor })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw new Error("Não foi possível excluir.");
  await logLifecycle(sa, type, id, actor, "excluido", { titulo: label(type, row), motivo: reason ?? null });
  return { ok: true, already: false };
}

export const softDeleteResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ type: typeSchema, id: idSchema, reason: z.string().trim().max(300).nullable().optional() })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sa = await requireAdmin(context);
    return softDelete(sa, data.type, data.id, context.userId, data.reason);
  });

export const restoreResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ type: typeSchema, id: idSchema }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const sa = await requireAdmin(context);
    const row = await loadRow(sa, data.type, data.id);
    if (!row.deleted_at) return { ok: true };
    const { error } = await sa
      .from(TABLE[data.type])
      .update({ deleted_at: null, deleted_by: null })
      .eq("id", data.id);
    if (error) throw new Error("Não foi possível restaurar.");
    await logLifecycle(sa, data.type, data.id, context.userId, "restaurado", {
      titulo: label(data.type, row),
      excluido_em: row.deleted_at,
    });
    return { ok: true };
  });

async function purgeBlockers(sa: SA, type: ResType, row: Row) {
  const reasons: string[] = [];
  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const result = await q;
    if (result.error) throw new Error("Não foi possível verificar os vínculos. Nada foi excluído.");
    return result.count ?? 0;
  };
  const head = { count: "exact", head: true };
  const shares = await count(
    sa.from("resource_shares").select("id", head).eq("resource_type", type).eq("resource_id", row.id),
  );
  if (shares > 0) reasons.push("compartilhamento ativo");
  if (type === "trademark") {
    if ((await count(sa.from("documents").select("id", head).eq("trademark_id", row.id))) > 0)
      reasons.push("documentos vinculados à marca");
    if ((await count(sa.from("certificates").select("id", head).eq("trademark_id", row.id))) > 0)
      reasons.push("certificados vinculados à marca");
  }
  if (type === "document") {
    if ((await count(sa.from("certificates").select("id", head).eq("document_id", row.id))) > 0)
      reasons.push("certificado vinculado");
    if ((await count(sa.from("documents").select("id", head).eq("related_document_id", row.id))) > 0)
      reasons.push("envio adicional relacionado");
    if (row.status === "concluido" || row.status === "certificado_emitido") reasons.push("processo concluído");
  }
  return reasons;
}

export const purgeResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ type: typeSchema, id: idSchema, confirm: z.literal(PURGE_CONFIRM) }).strict().parse(d),
  )
  .handler(async ({ data, context }) => purgeResourceForCaller(context, data.type, data.id));

/** One authoritative deletion path, including the legacy document endpoint. */
export async function purgeResourceForCaller(context: Ctx, type: ResType, id: string) {
  const sa = await requireAdmin(context);
  const row = await loadRow(sa, type, id);
  if (!row.deleted_at) {
    throw new Error("Primeiro exclua o item (ele vai para Excluídos). Só depois é possível excluir definitivamente.");
  }
  const reasons = await purgeBlockers(sa, type, row);
  if (reasons.length > 0) return { ok: false as const, blocked: true, reasons, file: null };

  // Delete only the deletion version reviewed above. A restore/re-delete wins
  // without letting this request touch notifications, history or Storage.
  const { data: deleted, error } = await sa.from(TABLE[type])
    .delete()
    .eq("id", id)
    .eq("deleted_at", row.deleted_at)
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Não foi possível excluir definitivamente.");
  if (!deleted) {
    throw new Error("O item mudou durante a operação. Atualize a lista e revise novamente; nenhum arquivo foi removido.");
  }

  if (type !== "trademark") {
    const col = type === "document" ? "document_id" : "certificate_id";
    await sa.from("support_notifications").delete().eq(col, id);
    await sa.from("resource_views").delete().eq("resource_type", type).eq("resource_id", id);
  }

  let file: { removed: boolean; reason: string | null } | null = null;
  const bucket = BUCKET[type];
  if (bucket && row.storage_path) file = await removeExactObject(sa, bucket, row.storage_path);
  await logLifecycle(sa, type, id, context.userId, "excluido_definitivamente", {
    titulo: label(type, row),
    arquivo: row.file_name ?? null,
    caminho: row.storage_path ?? null,
    arquivo_removido: file ? (file.removed ? "sim" : `nao (${file.reason})`) : "sem arquivo",
  });
  return { ok: true as const, blocked: false, reasons: [] as string[], file };

}

export type DeletedItem = {
  type: ResType;
  id: string;
  title: string;
  owner: string | null;
  organization: string | null;
  deletedAt: string;
  deletedBy: string | null;
  daysLeft: number;
};

async function labelMaps(sa: SA) {
  const [profiles, orgs] = await Promise.all([
    sa.from("profiles").select("id,full_name,email"),
    sa.from("organizations").select("id,name"),
  ]);
  const people = new Map<string, string>(
    (profiles.data ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
      p.id,
      p.full_name && p.email && p.full_name !== p.email ? `${p.full_name} (${p.email})` : (p.email ?? p.full_name ?? p.id),
    ]),
  );
  const orgMap = new Map<string, string>((orgs.data ?? []).map((o: { id: string; name: string }) => [o.id, o.name]));
  return { people, orgMap };
}

export const listDeletedResources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sa = await requireAdmin(context);
    const { people, orgMap } = await labelMaps(sa);
    const [tms, docs, certs] = await Promise.all([
      sa.from("trademarks").select("id,name,created_by,organization_id,deleted_at,deleted_by").not("deleted_at", "is", null),
      sa.from("documents").select("id,title,created_by,organization_id,deleted_at,deleted_by").not("deleted_at", "is", null),
      sa.from("certificates").select("id,title,trademark_id,document_id,deleted_at,deleted_by").not("deleted_at", "is", null),
    ]);
    const now = Date.now();
    const left = (at: string) =>
      Math.max(0, RETENTION_DAYS - Math.floor((now - new Date(at).getTime()) / 86_400_000));
    const items: DeletedItem[] = [];
    for (const t of tms.data ?? [])
      items.push({
        type: "trademark",
        id: t.id,
        title: t.name,
        owner: t.created_by ? (people.get(t.created_by) ?? null) : null,
        organization: t.organization_id ? (orgMap.get(t.organization_id) ?? null) : null,
        deletedAt: t.deleted_at,
        deletedBy: t.deleted_by ? (people.get(t.deleted_by) ?? null) : null,
        daysLeft: left(t.deleted_at),
      });
    for (const d of docs.data ?? [])
      items.push({
        type: "document",
        id: d.id,
        title: d.title,
        owner: d.created_by ? (people.get(d.created_by) ?? null) : null,
        organization: d.organization_id ? (orgMap.get(d.organization_id) ?? null) : null,
        deletedAt: d.deleted_at,
        deletedBy: d.deleted_by ? (people.get(d.deleted_by) ?? null) : null,
        daysLeft: left(d.deleted_at),
      });
    for (const c of certs.data ?? [])
      items.push({
        type: "certificate",
        id: c.id,
        title: c.title,
        owner: null,
        organization: null,
        deletedAt: c.deleted_at,
        deletedBy: c.deleted_by ? (people.get(c.deleted_by) ?? null) : null,
        daysLeft: left(c.deleted_at),
      });
    items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    return { items, retentionDays: RETENTION_DAYS };
  });

/** Anexa/substitui o arquivo de um certificado. O antigo só sai por caminho exato, depois do novo salvo. */
export const attachCertificateFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: idSchema,
        path: z.string().regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,160}$/i),
        fileName: z.string().trim().min(1).max(200),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sa = await requireAdmin(context);
    if (!data.path.startsWith(`${context.userId}/`)) throw new Error("Arquivo inválido.");
    const row = await loadRow(sa, "certificate", data.id);
    const { error } = await sa
      .from("certificates")
      .update({ storage_path: data.path, file_name: data.fileName })
      .eq("id", data.id);
    if (error) {
      await removeExactObject(sa, "certificados", data.path, data.id);
      throw new Error("Não foi possível salvar o arquivo do certificado.");
    }
    if (row.storage_path && row.storage_path !== data.path) {
      await removeExactObject(sa, "certificados", row.storage_path, data.id);
    }
    return { ok: true };
  });

// ───────────── Marcação explícita de teste ─────────────

const markerTypeSchema = z.enum(["user", "organization", "trademark", "document", "certificate"]);
type MarkerType = z.infer<typeof markerTypeSchema>;

async function describeResource(sa: SA, type: MarkerType, id: string) {
  if (type === "user") {
    const { data } = await sa.from("profiles").select("id,full_name,email").eq("id", id).maybeSingle();
    return data ? `${data.full_name ?? ""} ${data.email ? `(${data.email})` : ""}`.trim() : null;
  }
  if (type === "organization") {
    const { data } = await sa.from("organizations").select("name").eq("id", id).maybeSingle();
    return data?.name ?? null;
  }
  const { data } = await sa
    .from(TABLE[type])
    .select(type === "trademark" ? "name" : "title")
    .eq("id", id)
    .maybeSingle();
  return data ? (type === "trademark" ? data.name : data.title) : null;
}

export const listTestMarkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sa = await requireAdmin(context);
    const { data } = await sa.from("test_markers").select("*").order("created_at", { ascending: false });
    const { people } = await labelMaps(sa);
    const rows = await Promise.all(
      (data ?? []).map(async (m: { id: string; resource_type: MarkerType; resource_id: string; marked_by: string; note: string | null; created_at: string }) => ({
        id: m.id,
        type: m.resource_type,
        resourceId: m.resource_id,
        label: (await describeResource(sa, m.resource_type, m.resource_id)) ?? "(não encontrado)",
        markedBy: people.get(m.marked_by) ?? null,
        note: m.note,
        createdAt: m.created_at,
      })),
    );
    return rows;
  });

export const markAsTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ type: markerTypeSchema, id: idSchema, note: z.string().trim().min(3).max(300) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sa = await requireAdmin(context);
    const found = await describeResource(sa, data.type, data.id);
    if (!found) throw new Error("Item não encontrado.");
    const { error } = await sa
      .from("test_markers")
      .insert({ resource_type: data.type, resource_id: data.id, marked_by: context.userId, note: data.note });
    if (error) throw new Error("Não foi possível marcar (talvez já esteja marcado).");
    await logLifecycle(sa, data.type, data.id, context.userId, "marcado_teste", { nota: data.note, item: found });
    return { ok: true, label: found };
  });

export const unmarkTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ markerId: idSchema }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const sa = await requireAdmin(context);
    const { data: m } = await sa.from("test_markers").select("*").eq("id", data.markerId).maybeSingle();
    if (!m) return { ok: true };
    await sa.from("test_markers").delete().eq("id", data.markerId);
    await logLifecycle(sa, m.resource_type, m.resource_id, context.userId, "desmarcado_teste");
    return { ok: true };
  });

// ───────────── Dry-run de limpeza de testes ─────────────

export type DryRunItem = {
  markerId: string;
  type: MarkerType;
  resourceId: string;
  label: string;
  classification: "teste" | "incerto";
  reasons: string[];
  dependencies: { kind: string; id: string; label: string; markedTest: boolean }[];
  cascades: { table: string; count: number }[];
  files: { bucket: string; path: string }[];
  executable: boolean;
};

async function buildDryRun(sa: SA): Promise<DryRunItem[]> {
  const { data: markers } = await sa.from("test_markers").select("*");
  const marked = new Set<string>((markers ?? []).map((m: { resource_type: string; resource_id: string }) => `${m.resource_type}:${m.resource_id}`));
  const isMarked = (t: string, id: string | null) => !!id && marked.has(`${t}:${id}`);
  const out: DryRunItem[] = [];
  for (const m of markers ?? []) {
    const type = m.resource_type as MarkerType;
    const id = m.resource_id as string;
    const deps: DryRunItem["dependencies"] = [];
    const cascades: DryRunItem["cascades"] = [];
    const files: DryRunItem["files"] = [];
    const reasons: string[] = [];
    const lbl = await describeResource(sa, type, id);
    if (!lbl) reasons.push("item não encontrado");
    const cnt = async (table: string, col: string, extra?: [string, string]) => {
      let q = sa.from(table).select("id", { count: "exact", head: true }).eq(col, id);
      if (extra) q = q.eq(extra[0], extra[1]);
      return (await q).count ?? 0;
    };
    if (type === "trademark" || type === "document" || type === "certificate") {
      const row = lbl ? await loadRow(sa, type, id) : null;
      if (row?.organization_id && !isMarked("organization", row.organization_id)) {
        reasons.push("pertence a uma organização não marcada como teste");
      }
      if (row?.created_by && !isMarked("user", row.created_by)) {
        reasons.push("dono não marcado como teste");
      }
      if (type === "trademark") {
        const [d, c] = await Promise.all([
          sa.from("documents").select("id,title").eq("trademark_id", id),
          sa.from("certificates").select("id,title").eq("trademark_id", id),
        ]);
        for (const x of d.data ?? []) deps.push({ kind: "documento", id: x.id, label: x.title, markedTest: isMarked("document", x.id) });
        for (const x of c.data ?? []) deps.push({ kind: "certificado", id: x.id, label: x.title, markedTest: isMarked("certificate", x.id) });
      }
      if (type === "document") {
        const [c, ch] = await Promise.all([
          sa.from("certificates").select("id,title").eq("document_id", id),
          sa.from("documents").select("id,title").eq("related_document_id", id),
        ]);
        for (const x of c.data ?? []) deps.push({ kind: "certificado", id: x.id, label: x.title, markedTest: isMarked("certificate", x.id) });
        for (const x of ch.data ?? []) deps.push({ kind: "envio adicional", id: x.id, label: x.title, markedTest: isMarked("document", x.id) });
        cascades.push({ table: "avisos", count: await cnt("support_notifications", "document_id") });
      }
      if (type === "certificate") {
        cascades.push({ table: "avisos", count: await cnt("support_notifications", "certificate_id") });
      }
      const sh = await sa.from("resource_shares").select("id,user_id").eq("resource_type", type).eq("resource_id", id);
      for (const x of sh.data ?? []) deps.push({ kind: "compartilhamento", id: x.id, label: `com usuário ${x.user_id}`, markedTest: false });
      if (row?.storage_path && BUCKET[type]) files.push({ bucket: BUCKET[type]!, path: row.storage_path });
    } else if (type === "user") {
      reasons.push("contas não são excluídas por rotina; só relatório");
      for (const [table, col] of [
        ["profiles", "id"], ["user_roles", "user_id"], ["organization_members", "user_id"],
        ["support_notifications", "recipient_id"], ["page_visits", "user_id"], ["resource_views", "user_id"],
        ["resource_shares", "user_id"],
      ] as const) cascades.push({ table, count: await cnt(table, col) });
      for (const [kind, table, t, titleCol] of [
        ["marca", "trademarks", "trademark", "name"], ["documento", "documents", "document", "title"],
      ] as const) {
        const { data: owned } = await sa.from(table).select(`id,${titleCol}`).eq("created_by", id);
        for (const x of owned ?? []) deps.push({ kind, id: x.id, label: x[titleCol], markedTest: isMarked(t, x.id) });
      }
    } else if (type === "organization") {
      reasons.push("organizações não são excluídas por rotina; só relatório");
      cascades.push({ table: "organization_members", count: await cnt("organization_members", "organization_id") });
      for (const [kind, table, t, titleCol] of [
        ["marca", "trademarks", "trademark", "name"], ["documento", "documents", "document", "title"],
      ] as const) {
        const { data: owned } = await sa.from(table).select(`id,${titleCol}`).eq("organization_id", id);
        for (const x of owned ?? []) deps.push({ kind, id: x.id, label: x[titleCol], markedTest: isMarked(t, x.id) });
      }
    }
    if (deps.some((d) => !d.markedTest)) reasons.push("tem vínculos não marcados como teste");
    const executable = (type === "trademark" || type === "document" || type === "certificate") && reasons.length === 0;
    out.push({
      markerId: m.id,
      type,
      resourceId: id,
      label: lbl ?? "(não encontrado)",
      classification: reasons.length === 0 ? "teste" : "incerto",
      reasons,
      dependencies: deps,
      cascades,
      files,
      executable,
    });
  }
  return out;
}

export const dryRunTestCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sa = await requireAdmin(context);
    return buildDryRun(sa);
  });

/** Executa SÓ os itens aprovados, recalculando a classificação. Resultado: vão para "Excluídos". */
export const executeTestCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ markerIds: z.array(idSchema).min(1).max(50), confirm: z.literal(TEST_CLEANUP_CONFIRM) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sa = await requireAdmin(context);
    const plan = await buildDryRun(sa);
    const done: string[] = [];
    const skipped: { markerId: string; reason: string }[] = [];
    for (const markerId of data.markerIds) {
      const item = plan.find((p) => p.markerId === markerId);
      if (!item) { skipped.push({ markerId, reason: "não está na lista de teste" }); continue; }
      if (!item.executable) { skipped.push({ markerId, reason: item.reasons.join("; ") || "incerto" }); continue; }
      await softDelete(sa, item.type as ResType, item.resourceId, context.userId, "limpeza de teste aprovada");
      done.push(markerId);
    }
    return { done, skipped };
  });

// ───────────── Revisão de restauração ─────────────

const TABLE_BY_CANDIDATE: Record<string, string> = {
  organization: "organizations",
  organization_member: "organization_members",
  trademark: "trademarks",
  document: "documents",
  certificate: "certificates",
  resource_share: "resource_shares",
  profile: "profiles",
  user_role: "user_roles",
  support_notification: "support_notifications",
  page_visit: "page_visits",
  resource_view: "resource_views",
};
const RESTORABLE = new Set(["organization", "organization_member", "trademark", "document", "certificate", "resource_share"]);

async function existsIn(sa: SA, table: string, id: string) {
  const { count } = await sa.from(table).select("id", { count: "exact", head: true }).eq("id", id);
  return (count ?? 0) > 0;
}

async function fileExists(sa: SA, bucket: string, path: string) {
  const i = path.lastIndexOf("/");
  const { data } = await sa.storage.from(bucket).list(path.slice(0, i), { search: path.slice(i + 1), limit: 100 });
  return (data ?? []).some((o: { name: string }) => o.name === path.slice(i + 1));
}

export const listRestorationCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sa = await requireAdmin(context);
    const { data } = await sa.from("restoration_candidates").select("*").order("created_at");
    return Promise.all(
      (data ?? []).map(async (c: SA) => {
        const type = c.resource_type as string;
        const table = TABLE_BY_CANDIDATE[type];
        const prevId = c.previous_id as string | null;
        const existsNow = table && prevId ? await existsIn(sa, table, prevId) : false;
        const bucket = c.file_bucket as string | null;
        const path = c.file_path as string | null;
        const fileOk = bucket && path ? await fileExists(sa, bucket, path) : null;
        const pathConflict =
          path && (type === "document" || type === "certificate")
            ? ((await sa.from(TABLE_BY_CANDIDATE[type]).select("id").eq("storage_path", path)).data ?? []).some(
                (r: { id: string }) => r.id !== prevId,
              )
            : false;
        const deps: { type: string; id: string; label?: string }[] = c.dependencies ?? [];
        const depStatus = await Promise.all(
          deps.map(async (d) => {
            const t = TABLE_BY_CANDIDATE[d.type];
            return { ...d, exists: t ? await existsIn(sa, t, d.id) : false };
          }),
        );
        return {
          id: c.id as string,
          source: c.source_label as string,
          type,
          previousId: prevId,
          title: c.title as string | null,
          owner: c.owner_label as string | null,
          organization: c.organization_label as string | null,
          originalDate: c.original_date as string | null,
          fileBucket: bucket,
          filePath: path,
          fileExists: fileOk,
          dependencies: depStatus,
          existsNow,
          conflict: existsNow || pathConflict,
          decision: c.decision as string,
          decidedAt: c.decided_at as string | null,
          note: c.decision_note as string | null,
          restorable: RESTORABLE.has(type),
        };
      }),
    );
  });

export const restoreCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: idSchema }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const sa = await requireAdmin(context);
    const { data: c } = await sa.from("restoration_candidates").select("*").eq("id", data.id).maybeSingle();
    if (!c) throw new Error("Item não encontrado.");
    if (c.decision !== "pendente") throw new Error("Este item já foi decidido.");
    if (!RESTORABLE.has(c.resource_type)) {
      throw new Error("Este tipo precisa de restauração assistida pelo suporte (contas e arquivos).");
    }
    for (const d of (c.dependencies ?? []) as { type: string; id: string }[]) {
      const t = TABLE_BY_CANDIDATE[d.type];
      if (!t || !(await existsIn(sa, t, d.id))) {
        throw new Error("Há dependências ainda não restauradas. Revise as dependências primeiro.");
      }
    }
    if ((c.resource_type === "document" || c.resource_type === "certificate") && c.file_bucket && c.file_path) {
      if (!(await fileExists(sa, c.file_bucket, c.file_path))) {
        throw new Error("O arquivo original ainda não voltou ao armazenamento. Nada foi restaurado.");
      }
    }
    const { error } = await sa.rpc("restore_candidate", { _candidate: data.id, _actor: context.userId });
    if (error) throw new Error(`Não foi possível restaurar: ${error.message}`);
    return { ok: true };
  });

export const ignoreCandidate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: idSchema, note: z.string().trim().min(3).max(300) }).strict().parse(d),
  )
  .handler(async ({ data, context }) => {
    const sa = await requireAdmin(context);
    const { error } = await sa
      .from("restoration_candidates")
      .update({ decision: "ignorado", decided_by: context.userId, decided_at: new Date().toISOString(), decision_note: data.note })
      .eq("id", data.id)
      .eq("decision", "pendente");
    if (error) throw new Error("Não foi possível atualizar.");
    await logLifecycle(sa, "restoration", data.id, context.userId, "restauracao_ignorada", { nota: data.note });
    return { ok: true };
  });
