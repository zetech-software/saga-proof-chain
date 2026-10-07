export const AUDIT_FAILURE_MESSAGE = "A operação foi concluída, mas houve falha ao registrar o histórico. Não repita a operação; peça à equipe para verificar o registro.";

export function isCompletedActionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return value.code === "audit_write_failed" || value.message === AUDIT_FAILURE_MESSAGE;
}

export function describeActionError(error: unknown, fallback: string): string {
  if (isCompletedActionError(error)) return AUDIT_FAILURE_MESSAGE;
  const message = error instanceof Error ? error.message : "";
  return message && message.length < 200 && !/unauthor|jwt|fetch|network|postgres|sqlstate/i.test(message)
    ? message : fallback;
}
