import { afterEach, describe, expect, it, vi } from "vitest";

const { createSignedUrl, from } = vi.hoisted(() => {
  const createSignedUrl = vi.fn();
  return { createSignedUrl, from: vi.fn(() => ({ createSignedUrl })) };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from } } }));

import { downloadFromBucket } from "./downloads";

afterEach(() => vi.unstubAllGlobals());

describe("private file downloads", () => {
  it.each(["documentos", "certificados"])("uses a ten-second link for %s and starts the download immediately", async (bucket) => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://files.example.test/signed" }, error: null });
    const anchor = { href: "", download: "", rel: "", click: vi.fn(), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal("document", { createElement: vi.fn(() => anchor), body: { appendChild } });

    expect(await downloadFromBucket(bucket, "owner/file.pdf", "obra.pdf")).toEqual({ ok: true });
    expect(from).toHaveBeenCalledWith(bucket);
    expect(createSignedUrl).toHaveBeenCalledWith("owner/file.pdf", 10, { download: "obra.pdf" });
    expect(anchor.href).toBe("https://files.example.test/signed");
    expect(anchor.download).toBe("obra.pdf");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(anchor.remove).toHaveBeenCalledOnce();
  });

  it("does not start a download when permission to sign the file is denied", async () => {
    createSignedUrl.mockResolvedValue({ data: null, error: { message: "denied" } });
    const createElement = vi.fn();
    vi.stubGlobal("document", { createElement });
    expect((await downloadFromBucket("documentos", "other/file.pdf")).ok).toBe(false);
    expect(createElement).not.toHaveBeenCalled();
  });
});