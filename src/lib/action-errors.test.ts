import { describe, expect, it } from "vitest";
import { AUDIT_FAILURE_MESSAGE, describeActionError, isCompletedActionError } from "./action-errors";
describe("completed action warnings", () => {
  it.each([Object.assign(new Error(AUDIT_FAILURE_MESSAGE), { code: "audit_write_failed" }), new Error(AUDIT_FAILURE_MESSAGE), { message: AUDIT_FAILURE_MESSAGE }])("preserves the warning after error serialization", (error) => {
    expect(isCompletedActionError(error)).toBe(true);
    expect(describeActionError(error, "Old file preserved")).toBe(AUDIT_FAILURE_MESSAGE);
  });
  it("does not claim preservation when the response is unknown", () => {
    const fallback = "Atualize a lista antes de repetir.";
    expect(describeActionError(new Error("Failed to fetch"), fallback)).toBe(fallback);
    expect(isCompletedActionError(new Error("Failed to fetch"))).toBe(false);
  });
});
