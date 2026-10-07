import { describe, expect, it, vi } from "vitest";
import { writeAuditEvent } from "./audit-events";

describe("audit writes", () => {
  it("accepts a persisted event", async () => {
    await expect(writeAuditEvent(() => Promise.resolve({ error: null }))).resolves.toBeUndefined();
  });
  it("reports failure without encouraging a duplicate mutation", async () => {
    const write = vi.fn(async () => ({ error: { message: "database unavailable" } }));
    await expect(writeAuditEvent(write)).rejects.toMatchObject({ code: "audit_write_failed" });
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("also reports network failures", async () => {
    await expect(writeAuditEvent(async () => { throw new Error("network"); }))
      .rejects.toMatchObject({ code: "audit_write_failed" });
  });
});
