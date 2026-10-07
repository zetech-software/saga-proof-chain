import { AUDIT_FAILURE_MESSAGE } from "./action-errors";

/** Surface a failed audit write without falsely reporting an unrecorded action as successful. */
export async function writeAuditEvent(
  write: () => PromiseLike<{ error: unknown }>,
): Promise<void> {
  let failed = false;
  try {
    const result = await write();
    failed = !!result.error;
  } catch {
    failed = true;
  }
  if (failed) {
    throw Object.assign(
      new Error(AUDIT_FAILURE_MESSAGE),
      { code: "audit_write_failed" },
    );
  }
}
