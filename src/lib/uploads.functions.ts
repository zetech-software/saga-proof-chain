import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const bucketSchema = z.enum(["documentos", "certificados"]);
const pendingSchema = z
  .string()
  .max(300)
  .regex(/^[0-9a-f-]{36}\/pending\/[A-Za-z0-9._-]{1,120}\.(pdf|jpg|jpeg|png|doc|docx)$/i);
const nameSchema = z.string().trim().min(1).max(200);

type Supa = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> };

/** Validates the pending object owned by the caller and moves it to its final path. */
async function validateAndPromote(
  userId: string,
  bucket: "documentos" | "certificados",
  pendingPath: string,
) {
  const { validateFileBytes, EXT_MIME } = await import("./uploads.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!pendingPath.startsWith(`${userId}/pending/`)) throw new Error("Arquivo inválido.");
  const ext = pendingPath.split(".").pop()!.toLowerCase() as keyof typeof EXT_MIME;
  const store = supabaseAdmin.storage.from(bucket);
  const { data: blob, error } = await store.download(pendingPath);
  if (error || !blob) throw new Error("Arquivo não encontrado. Envie novamente.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const result = await validateFileBytes(bytes, ext);
  if (!result.ok) {
    await store.remove([pendingPath]);
    throw new Error(
      "O conteúdo do arquivo não corresponde a um PDF, JPG, JPEG, PNG, DOC ou DOCX válido, ou ultrapassa 50 MB.",
    );
  }
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const finalPath = `${userId}/${rand}.${ext}`;
  const moved = await store.move(pendingPath, finalPath);
  if (moved.error) {
    await store.remove([pendingPath]);
    throw new Error("Não foi possível concluir o envio.");
  }
  return { path: finalPath, size: bytes.length, mime: EXT_MIME[ext] };
}

async function isAdmin(supabase: Supa, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

/** Admin-only: validates a staged file and returns the final storage path (for replace/cert flows). */
export const finalizeAdminUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ bucket: bucketSchema, pendingPath: pendingSchema }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.supabase as unknown as Supa, context.userId))) {
      throw new Error("Sem permissão.");
    }
    return validateAndPromote(context.userId, data.bucket, data.pendingPath);
  });

/** Client document submission: the only way a non-admin can create a document row. */
export const submitClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        pendingPath: pendingSchema,
        fileName: nameSchema,
        title: z.string().trim().min(1).max(160),
        description: z.string().trim().max(2000).nullable(),
        organizationId: z.string().uuid().nullable(),
        relatedDocumentId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const discard = () => supabaseAdmin.storage.from("documentos").remove([data.pendingPath]);
    if (!data.pendingPath.startsWith(`${userId}/pending/`)) throw new Error("Arquivo inválido.");

    // Ownership / organization checks run as the caller.
    if (data.organizationId) {
      const { data: member } = await supabase.rpc("is_org_member", {
        _user_id: userId,
        _org_id: data.organizationId,
      });
      if (member !== true && !(await isAdmin(supabase as unknown as Supa, userId))) {
        await discard();
        throw new Error("Organização inválida.");
      }
    }
    let trademarkId: string | null = null;
    if (data.relatedDocumentId) {
      const { data: rel } = await supabase
        .from("documents")
        .select("id,status,trademark_id")
        .eq("id", data.relatedDocumentId)
        .maybeSingle();
      if (!rel || rel.status !== "aguardando_documentacao") {
        await discard();
        throw new Error("Este processo não está aguardando documentação.");
      }
      trademarkId = rel.trademark_id;
    }

    const file = await validateAndPromote(userId, "documentos", data.pendingPath);
    const { data: row, error } = await supabaseAdmin
      .from("documents")
      .insert({
        title: data.title,
        description: data.description,
        storage_path: file.path,
        file_name: data.fileName,
        file_size: file.size,
        mime_type: file.mime,
        created_by: userId,
        organization_id: data.organizationId,
        related_document_id: data.relatedDocumentId,
        trademark_id: trademarkId,
      })
      .select("id")
      .single();
    if (error || !row) {
      await supabaseAdmin.storage.from("documentos").remove([file.path]);
      throw new Error("Não foi possível registrar o documento.");
    }
    return { id: row.id };
  });
