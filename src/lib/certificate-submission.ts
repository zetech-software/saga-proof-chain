export type CertificateInput = {
  title: string; document_id: string | null; network: string | null;
  tx_hash: string | null; verification_url: string | null; notes: string | null;
  conclude_document: boolean;
};
type PreparedFile = { storage_path: string | null; file_name: string | null };
export type CertificateRequest = CertificateInput & PreparedFile & { id: string };

/** Keep the same request ID and uploaded file when the same form is retried. */
export function createCertificateSubmission(publish: (request: CertificateRequest) => Promise<unknown>) {
  let current: { key: string; file: File | null; id: string; prepared?: PreparedFile } | undefined;
  let inFlight: Promise<unknown> | undefined;
  return {
    submit(input: CertificateInput, file: File | null, prepare: () => Promise<PreparedFile>) {
      if (inFlight) return inFlight;
      const key = JSON.stringify(input);
      if (!current || current.key !== key || current.file !== file) {
        current = { key, file, id: crypto.randomUUID() };
      }
      const request = current;
      inFlight = (async () => {
        request.prepared ??= await prepare();
        return publish({ ...input, ...request.prepared, id: request.id });
      })().finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}
