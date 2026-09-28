import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Gerenciamento de documentos (editar, substituir, arquivar, restaurar, excluir).
 * O navegador envia só o id do documento e os campos permitidos; quem pode fazer
 * o quê é decidido aqui, com o id da sessão. Nunca altera dono, organização,
 * status, compartilhamentos nem certificado.
 */

const idSchema = z.string().uuid();
const pendingSchema = z
  .string()
  .max(300)
  .regex(/^[0-9a-f-]{36}\/pending\/[A-Za-z0-9._-]{1,120}\.(pdf|jpg|jpeg|png|doc|docx)$/i);

// Status em que o cliente ainda pode mexer no próprio envio.
const CLIENT_EDITABLE = new Set(["recebido", "aguardando_documentacao"]);
const FINAL_STATUS = new Set(["concluido", "certificado_emitido"]);

type Ctx = { supabase: unknown; userId: string };

async function loadCaller(ctx: Ctx, documentId: string) {
  const supabase = ctx.supabase as {
    rpc: (fn: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
  };
  const { data: admin } = await supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: doc } = await supabaseAdmin
    .from("documents")
    .select("id,created_by,status,storage_path,file_name,archived_at,title")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) throw new Error("Documento não encontrado.");
  const isAdmin = admin === true;
  const isOwner = doc.created_by === ctx.userId;
  if (!isAdmin && !isOwner) throw new Error("Sem permissão.");
  return { supabaseAdmin, doc, isAdmin };
}

async function countCerts(sa: Awaited<ReturnType<typeof loadCaller>>["supabaseAdmin"], id: string) {
  const { count } = await sa
    .from("certificates")
    .select("id", { count: "exact", head: true })
    .eq("document_id", id);
  return count ?? 0;
}

async function logEvent(
  sa: Awaited<ReturnType<typeof loadCaller>>["supabaseAdmin"],
  documentId: string,
  actorId: string,
  action: "editado" | "arquivo_substituido" | "arquivado" | "restaurado" | "excluido",
  details: Record<string, string | null> = {},
) {
  await sa.from("document_events").insert({ document_id: documentId, actor_id: actorId, action, details });
}

export const editDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: idSchema,
        title: z.string().trim().min(2).max(160),
        description: z.string().trim().max(1000).nullable(),
        adminNotes: z.string().trim().max(1000).nullable().optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, doc, isAdmin } = await loadCaller(context, data.id);
    if (!isAdmin) {
      if (doc.archived_at || !CLIENT_EDITABLE.has(doc.status)) {
        throw new Error("Este documento não pode mais ser editado.");
      }
    }
    const patch: { title: string; description: string | null; admin_notes?: string | null } = {
      title: data.title,
      description: data.description || null,
    };
    if (isAdmin && data.adminNotes !== undefined) patch.admin_notes = data.adminNotes || null;
    const { error } = await supabaseAdmin.from("documents").update(patch).eq("id", data.id);
    if (error) throw new Error("Não foi possível salvar.");
    await logEvent(supabaseAdmin, data.id, context.userId, "editado");
    return { ok: true };
  });

export const replaceDocumentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: idSchema,
        pendingPath: pendingSchema,
        fileName: z.string().trim().min(1).max(200),
        reason: z.string().trim().max(300).nullable().optional(),
      })
      .strict()
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let loaded: Awaited<ReturnType<typeof loadCaller>>;
    try {
      loaded = await loadCaller(context, data.id);
    } catch (e) {
      // Sem permissão: descarta o arquivo em espera do próprio usuário.
      if (data.pendingPath.startsWith(`${context.userId}/pending/`)) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("documentos").remove([data.pendingPath]);
      }
      throw e;
    }
    const { supabaseAdmin, doc, isAdmin } = loaded;
    const store = supabaseAdmin.storage.from("documentos");
    const discard = () => store.remove([data.pendingPath]);
    if (!data.pendingPath.startsWith(`${context.userId}/pending/`)) {
      throw new Error("Arquivo inválido.");
    }
    if (!isAdmin) {
      if (doc.archived_at || !CLIENT_EDITABLE.has(doc.status) || (await countCerts(supabaseAdmin, doc.id)) > 0) {
        await discard();
        throw new Error("O arquivo deste documento não pode mais ser substituído.");
      }
    }
    // Mesmo fluxo seguro do envio: baixa, confere a assinatura real e move.
    const { validateFileBytes, EXT_MIME } = await import("./uploads.server");
    const ext = data.pendingPath.split(".").pop()!.toLowerCase() as keyof typeof EXT_MIME;
    const { data: blob, error: dlErr } = await store.download(data.pendingPath);
    if (dlErr || !blob) throw new Error("Arquivo não encontrado. Envie novamente.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const check = await validateFileBytes(bytes, ext);
    if (!check.ok) {
      await discard();
      throw new Error(
        "O conteúdo do arquivo não corresponde a um PDF, JPG, JPEG, PNG, DOC ou DOCX válido, ou ultrapassa 50 MB.",
      );
    }
    const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const finalPath = `${context.userId}/${rand}.${ext}`;
    const moved = await store.move(data.pendingPath, finalPath);
    if (moved.error) {
      await discard();
      throw new Error("Não foi possível concluir o envio.");
    }
    // Só troca o registro depois do arquivo novo validado; o antigo fica intacto até aqui.
    const { error } = await supabaseAdmin
      .from("documents")
      .update({
        storage_path: finalPath,
        file_name: data.fileName,
        file_size: bytes.length,
        mime_type: EXT_MIME[ext],
      })
      .eq("id", doc.id)
      .eq("storage_path", doc.storage_path);
    if (error) {
      await store.remove([finalPath]);
      throw new Error("Não foi possível substituir o arquivo. O arquivo anterior foi mantido.");
    }
    await store.remove([doc.storage_path]);
    await logEvent(supabaseAdmin, doc.id, context.userId, "arquivo_substituido", {
      previous_file_name: doc.file_name,
      new_file_name: data.fileName,
      reason: data.reason || null,
    });
    return { ok: true };
  });

export const setDocumentArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: idSchema, archived: z.boolean() }).strict().parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, doc, isAdmin } = await loadCaller(context, data.id);
    if (!isAdmin && data.archived) {
      // Cliente só arquiva envio próprio que ainda não entrou em andamento.
      if (doc.status !== "recebido" || (await countCerts(supabaseAdmin, doc.id)) > 0) {
        throw new Error("Este documento faz parte de um processo ativo e não pode ser arquivado.");
      }
    }
    if (!!doc.archived_at === data.archived) return { ok: true };
    const { error } = await supabaseAdmin
      .from("documents")
      .update(
        data.archived
          ? { archived_at: new Date().toISOString(), archived_by: context.userId }
          : { archived_at: null, archived_by: null },
      )
      .eq("id", doc.id);
    if (error) throw new Error("Não foi possível atualizar o documento.");
    await logEvent(supabaseAdmin, doc.id, context.userId, data.archived ? "arquivado" : "restaurado");
    return { ok: true };
  });

export const BLOCKED_DELETE_MESSAGE =
  "Este documento não pode ser excluído definitivamente porque possui vínculos ativos.";

export const purgeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: idSchema, confirm: z.literal("EXCLUIR") }).strict().parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin, doc, isAdmin } = await loadCaller(context, data.id);
    if (!isAdmin) throw new Error("Sem permissão.");
    const [certs, children, shares] = await Promise.all([
      countCerts(supabaseAdmin, doc.id),
      supabaseAdmin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("related_document_id", doc.id),
      supabaseAdmin
        .from("resource_shares")
        .select("id", { count: "exact", head: true })
        .eq("resource_type", "document")
        .eq("resource_id", doc.id),
    ]);
    const reasons: string[] = [];
    if (certs > 0) reasons.push("certificado vinculado");
    if ((children.count ?? 0) > 0) reasons.push("envio adicional relacionado");
    if ((shares.count ?? 0) > 0) reasons.push("compartilhamento ativo");
    if (FINAL_STATUS.has(doc.status)) reasons.push("processo concluído");
    if (reasons.length > 0) return { ok: false as const, blocked: true, reasons };

    await supabaseAdmin.from("support_notifications").delete().eq("document_id", doc.id);
    await supabaseAdmin
      .from("resource_views")
      .delete()
      .eq("resource_type", "document")
      .eq("resource_id", doc.id);
    const { error } = await supabaseAdmin.from("documents").delete().eq("id", doc.id);
    if (error) throw new Error("Não foi possível excluir o documento.");
    // Registro já removido: agora o arquivo, para não sobrar nada órfão.
    let fileRemoved = !(await supabaseAdmin.storage.from("documentos").remove([doc.storage_path])).error;
    if (!fileRemoved) {
      fileRemoved = !(await supabaseAdmin.storage.from("documentos").remove([doc.storage_path])).error;
    }
    await logEvent(supabaseAdmin, doc.id, context.userId, "excluido", {
      previous_file_name: doc.file_name,
      file_removed: fileRemoved ? "sim" : "nao",
    });
    return { ok: true as const, blocked: false, reasons: [] as string[] };
  });
