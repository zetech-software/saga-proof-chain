import { supabase } from "@/integrations/supabase/client";

import { sanitizeFileName } from "@/lib/uploads";

/**
 * Baixa um arquivo de um bucket privado via signed URL de curta duração.
 * O parâmetro `download` faz o Storage responder com Content-Disposition: attachment,
 * evitando que conteúdo ativo seja aberto/renderizado em uma nova aba.
 */
export async function downloadFromBucket(
  bucket: string,
  path: string,
  fileName?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const safeName = sanitizeFileName(fileName || "arquivo") || "arquivo";

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60, { download: safeName });

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      message: "Não foi possível gerar o link do arquivo. Tente novamente em alguns instantes.",
    };
  }

  const anchor = document.createElement("a");
  anchor.href = data.signedUrl;
  anchor.download = safeName;
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return { ok: true };
}
