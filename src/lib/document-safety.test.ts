import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  from: vi.fn(),
  bucket: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: state.from, rpc: state.rpc, storage: { from: state.bucket } },
}));

import { replaceDocumentFile, purgeDocument, setDocumentArchived } from "./document-management.functions";
import { purgeResource, restoreResource } from "./resource-lifecycle.functions";

const owner = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const pendingPath = `${owner}/pending/upload.pdf`;
const oldPath = `${owner}/old.pdf`;

function query(result: Record<string, unknown>) {
  const chain: Record<string, any> = {};
  for (const method of ["select", "eq", "neq", "is", "not", "update", "delete", "insert"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain["maybeSingle"] = vi.fn(async () => result);
  chain["then"] = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

function context(admin = false, userId = owner) {
  return { userId, supabase: { rpc: vi.fn(async () => ({ data: admin })) } };
}
function invoke(fn: unknown, data: unknown, ctx: ReturnType<typeof context>) {
  return (fn as (args: { data: unknown; context: unknown }) => Promise<any>)({ data, context: ctx });
}
function storage(bytes = "%PDF-1.7") {
  const store = {
    download: vi.fn(async () => ({ data: new Blob([bytes]), error: null })),
    move: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    list: vi.fn(async () => ({ data: [{ name: "old.pdf" }], error: null })),
  };
  state.bucket.mockReturnValue(store);
  return store;
}
function setupReplacement(updated: boolean, docOwner = owner) {
  const store = storage();
  state.rpc.mockResolvedValue({ data: updated, error: null });
  const doc = { id: documentId, created_by: docOwner, status: "recebido", storage_path: oldPath, file_name: "old.pdf", archived_at: null, deleted_at: null };
  let documents = 0;
  state.from.mockImplementation((table: string) => {
    if (table === "documents") {
      return query({ data: documents++ === 0 ? doc : updated ? { id: documentId } : null, error: null });
    }
    return query({ count: 0, error: null });
  });
  return store;
}
const replacement = { id: documentId, pendingPath, fileName: "new.pdf" };

beforeEach(() => { state.from.mockReset(); state.bucket.mockReset(); state.rpc.mockReset(); });

describe("document replacement", () => {
  it("does not delete the previous file when a concurrent update wins", async () => {
    const store = setupReplacement(false);
    await expect(invoke(replaceDocumentFile, replacement, context())).rejects.toThrow("anterior foi mantido");
    expect(store.remove).toHaveBeenCalledTimes(1);
    const removed = (store.remove.mock.calls as unknown as string[][][])[0]?.[0] ?? [];
    expect(removed[0]).not.toBe(oldPath);
    expect(removed[0]).not.toBe(pendingPath);
  });
  it("deletes the previous file only after the replacement is linked", async () => {
    const store = setupReplacement(true);
    await expect(invoke(replaceDocumentFile, replacement, context())).resolves.toEqual({ ok: true });
    expect(store.remove).toHaveBeenCalledWith([oldPath]);
  });
  it("passes only the session actor and expected file to final database authorization", async () => {
    setupReplacement(true);
    await invoke(replaceDocumentFile, replacement, context());
    expect(state.rpc).toHaveBeenCalledWith("replace_document_file_atomic", expect.objectContaining({
      _document: documentId, _actor: owner, _expected_path: oldPath, _file_name: "new.pdf",
    }));
    expect(state.rpc.mock.calls[0][1]._new_path).toMatch(new RegExp("^" + owner + "/"));
  });
  it("keeps the previous file if the final database authorization fails", async () => {
    const store = setupReplacement(true);
    state.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    await expect(invoke(replaceDocumentFile, replacement, context())).rejects.toThrow("anterior foi mantido");
    expect(store.remove).not.toHaveBeenCalledWith([oldPath]);
    expect(state.from.mock.calls.map(([table]) => table)).not.toContain("document_events");
  });
  it.each([{ count: null, error: { message: "query failed" } }, { count: null, error: null }])("blocks replacement when certificate count is unavailable: %j", async (failure) => {
    const store = setupReplacement(true);
    const from = state.from.getMockImplementation()!;
    state.from.mockImplementation((table: string) => table === "certificates" ? query(failure) : from(table));
    await expect(invoke(replaceDocumentFile, replacement, context())).rejects.toThrow("verificar os certificados");
    expect(store.download).not.toHaveBeenCalled();
    expect(store.move).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalledWith([oldPath]);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("blocks archiving when the certificate query fails", async () => {
    setupReplacement(true);
    const from = state.from.getMockImplementation()!;
    state.from.mockImplementation((table: string) => table === "certificates" ? query({ count: null, error: { message: "failed" } }) : from(table));
    await expect(invoke(setDocumentArchived, { id: documentId, archived: true }, context())).rejects.toThrow("verificar os certificados");
    expect(state.from.mock.calls.filter(([table]) => table === "documents")).toHaveLength(1);
    expect(state.from.mock.calls.map(([table]) => table)).not.toContain("document_events");
  });
  it("rejects another client's document before reading the upload", async () => {
    const store = setupReplacement(true, "another-client");
    await expect(invoke(replaceDocumentFile, replacement, context())).rejects.toThrow("Sem permissão");
    expect(store.download).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith([pendingPath]);
  });
  it("rejects pending files belonging to another user", async () => {
    const store = setupReplacement(true);
    await expect(invoke(replaceDocumentFile, { ...replacement, pendingPath: "other/pending/upload.pdf" }, context())).rejects.toThrow("Arquivo inválido");
    expect(store.download).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("discards invalid bytes while keeping the previous file", async () => {
    setupReplacement(true);
    const store = storage("this is not a PDF");
    await expect(invoke(replaceDocumentFile, replacement, context())).rejects.toThrow("conteúdo");
    expect(store.move).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith([pendingPath]);
    expect(store.remove).not.toHaveBeenCalledWith([oldPath]);
  });
});

function setupPurge(options: { deleted?: boolean; sharedFile?: boolean; certificates?: number; deletedRowMissing?: boolean; deletionError?: boolean; restoredFile?: boolean } = {}) {
  const store = storage();
  let documents = 0;
  let certificates = 0;
  state.from.mockImplementation((table: string) => {
    if (table === "documents") {
      const step = documents++;
      if (step === 0) return query({ data: { id: documentId, title: "Document", deleted_at: options.deleted === false ? null : "2026-10-01", storage_path: oldPath, status: "recebido" }, error: null });
      if (step === 1) return query({ count: 0, error: null });
      if (step === 2) return query({ data: options.deletedRowMissing ? null : { id: documentId }, error: options.deletionError ? { message: "database failure" } : null });
      return query({ data: options.sharedFile ? [{ id: "other-document" }] : options.restoredFile ? [{ id: documentId }] : [], error: null });
    }
    if (table === "certificates") {
      return certificates++ === 0
        ? query({ count: options.certificates ?? 0, error: null })
        : query({ data: [], error: null });
    }
    return query({ count: 0, data: [], error: null });
  });
  return store;
}

describe("shared authoritative purge", () => {
  it.each([["legacy", purgeDocument], ["resource", purgeResource]])("%s keeps a file used by another record", async (_name, fn) => {
    const store = setupPurge({ sharedFile: true });
    const data = fn === purgeDocument
      ? { id: documentId, confirm: "EXCLUIR" }
      : { type: "document", id: documentId, confirm: "EXCLUIR DEFINITIVAMENTE" };
    const result = await invoke(fn, data, context(true));
    expect(result.ok).toBe(true);
    expect(store.remove).not.toHaveBeenCalled();
  });
  it.each([["legacy", purgeDocument], ["resource", purgeResource]])("%s stops when a restore wins before deletion", async (_name, fn) => {
    const store = setupPurge({ deletedRowMissing: true });
    const data = fn === purgeDocument
      ? { id: documentId, confirm: "EXCLUIR" }
      : { type: "document", id: documentId, confirm: "EXCLUIR DEFINITIVAMENTE" };
    await expect(invoke(fn, data, context(true))).rejects.toThrow("item mudou");
    expect(store.list).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
    expect(state.from.mock.calls.map(([table]) => table)).not.toContain("support_notifications");
    expect(state.from.mock.calls.map(([table]) => table)).not.toContain("resource_views");
    expect(state.from.mock.calls.map(([table]) => table)).not.toContain("resource_lifecycle_events");
    const deletion = state.from.mock.results.filter((_, i) => state.from.mock.calls[i]?.[0] === "documents")[2]?.value;
    expect(deletion.eq).toHaveBeenCalledWith("deleted_at", "2026-10-01");
  });
  it("keeps the file if the same ID was restored before the reference check", async () => {
    const store = setupPurge({ restoredFile: true });
    const result = await invoke(purgeResource, { type: "document", id: documentId, confirm: "EXCLUIR DEFINITIVAMENTE" }, context(true));
    expect(result.file).toMatchObject({ removed: false, reason: "arquivo usado por outro registro" });
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("does not touch Storage when the database deletion fails", async () => {
    const store = setupPurge({ deletionError: true });
    await expect(invoke(purgeDocument, { id: documentId, confirm: "EXCLUIR" }, context(true))).rejects.toThrow("Não foi possível excluir");
    expect(store.remove).not.toHaveBeenCalled();
    expect(state.from.mock.calls.map(([table]) => table)).not.toContain("support_notifications");
  });
  it("removes an unreferenced file after the deletion is confirmed", async () => {
    const store = setupPurge();
    await invoke(purgeDocument, { id: documentId, confirm: "EXCLUIR" }, context(true));
    expect(store.remove).toHaveBeenCalledWith([oldPath]);
  });
  it("blocks clients before any privileged query", async () => {
    await expect(invoke(purgeDocument, { id: documentId, confirm: "EXCLUIR" }, context())).rejects.toThrow("Sem permissão");
    expect(state.from).not.toHaveBeenCalled();
  });
  it("requires recoverable deletion first", async () => {
    const store = setupPurge({ deleted: false });
    await expect(invoke(purgeDocument, { id: documentId, confirm: "EXCLUIR" }, context(true))).rejects.toThrow("Primeiro exclua");
    expect(store.remove).not.toHaveBeenCalled();
  });
  it("blocks records with linked certificates", async () => {
    const store = setupPurge({ certificates: 1 });
    const result = await invoke(purgeDocument, { id: documentId, confirm: "EXCLUIR" }, context(true));
    expect(result).toMatchObject({ ok: false, blocked: true, reasons: ["certificado vinculado"] });
    expect(store.remove).not.toHaveBeenCalled();
  });
});

describe("restoration permissions", () => {
  it("rejects clients before loading deleted records", async () => {
    await expect(invoke(restoreResource, { type: "document", id: documentId }, context())).rejects.toThrow("Sem permissão");
    expect(state.from).not.toHaveBeenCalled();
  });
  it("restores only deletion metadata, keeping document links intact", async () => {
    const update = query({ error: null });
    state.from.mockReturnValueOnce(query({ data: { id: documentId, deleted_at: "2026-10-01", title: "Document" }, error: null }))
      .mockReturnValueOnce(update)
      .mockReturnValueOnce(query({ error: null }));
    await expect(invoke(restoreResource, { type: "document", id: documentId }, context(true))).resolves.toEqual({ ok: true });
    expect(update["update"]).toHaveBeenCalledWith({ deleted_at: null, deleted_by: null });
  });
});
