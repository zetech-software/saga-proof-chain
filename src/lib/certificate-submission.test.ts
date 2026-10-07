import { describe, expect, it, vi } from "vitest";
import { createCertificateSubmission, type CertificateRequest } from "./certificate-submission";
const input = { title: "Certificate", document_id: null, network: null, tx_hash: null, verification_url: null, notes: null, conclude_document: false };
describe("certificate retries", () => {
  it("reuses request ID and file after an uncertain response", async () => {
    const publish = vi.fn().mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce("ok");
    const prepare = vi.fn(async () => ({ storage_path: "validated.pdf", file_name: "file.pdf" }));
    const submit = createCertificateSubmission(publish);
    await expect(submit.submit(input, null, prepare)).rejects.toThrow("response lost");
    await expect(submit.submit(input, null, prepare)).resolves.toBe("ok");
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0]).toEqual(publish.mock.calls[1]?.[0]);
  });
  it("shares an in-flight submission instead of uploading twice", async () => {
    let resolve!: (value: unknown) => void;
    const publish = vi.fn(() => new Promise(r => { resolve = r; }));
    const prepare = vi.fn(async () => ({ storage_path: null, file_name: null }));
    const submit = createCertificateSubmission(publish);
    const first = submit.submit(input, null, prepare);
    const second = submit.submit(input, null, prepare);
    expect(first).toBe(second);
    await Promise.resolve();
    resolve("ok");
    await first;
    expect(publish).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("uses a new request ID when the form changes", async () => {
    const publish = vi.fn(async (_request: CertificateRequest) => "ok");
    const prepare = vi.fn(async () => ({ storage_path: null, file_name: null }));
    const submit = createCertificateSubmission(publish);
    await submit.submit(input, null, prepare);
    await submit.submit({ ...input, title: "Different certificate" }, null, prepare);
    expect(publish.mock.calls[0]?.[0]?.id).not.toBe(publish.mock.calls[1]?.[0]?.id);
  });
});
