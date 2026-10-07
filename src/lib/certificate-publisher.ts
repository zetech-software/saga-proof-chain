import { supabase } from "@/integrations/supabase/client";
import type { CertificateRequest } from "./certificate-submission";

export async function publishCertificate(request: CertificateRequest) {
  const client = supabase as unknown as {
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  const { data, error } = await client.rpc("publish_certificate_atomic", {
    _id: request.id, _document: request.document_id, _title: request.title,
    _path: request.storage_path, _file_name: request.file_name,
    _network: request.network, _tx_hash: request.tx_hash,
    _verification_url: request.verification_url, _notes: request.notes,
    _conclude: request.conclude_document,
  });
  if (error || data !== request.id) {
    throw new Error("Não foi possível confirmar o certificado. Atualize a lista antes de repetir. O mesmo formulário reutiliza o envio anterior.");
  }
  return data;
}
