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
      new Error("A operação foi concluída, mas houve falha ao registrar o histórico. Não repita a operação; peça à equipe para verificar o registro."),
      { code: "audit_write_failed" },
    );
  }
}
