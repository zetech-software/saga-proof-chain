// Browser helper: stage a file in the caller's private pending area.
import { supabase } from "@/integrations/supabase/client";

export async function stagePendingUpload(
  bucket: "documentos" | "certificados",
  file: File,
  storageName: string,
  contentType: string,
): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Sessão expirada");
  const path = `${uid}/pending/${storageName}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: false });
  if (error) throw error;
  return path;
}
