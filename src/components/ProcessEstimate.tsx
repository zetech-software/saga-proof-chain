import { AlertCircle, CalendarClock, CheckCircle2 } from "lucide-react";

import { PRAZO_MAX_DIAS_UTEIS, PRAZO_MIN_DIAS_UTEIS, estimateBusinessWindow } from "@/lib/portal";

const PROCESS_STATUSES = ["recebido", "em_analise", "em_andamento", "aguardando_documentacao"];
const DONE_STATUSES = ["concluido", "certificado_emitido"];

/**
 * Bloco de prazo estimado exibido ao cliente. Usado também na prévia do admin
 * para garantir que ambos vejam exatamente o mesmo resultado.
 * `startDate` deve ser uma data confiável (ou null — nesse caso nada de estimativa).
 */
export function ProcessEstimate({
  status,
  startDate,
}: {
  status: string;
  startDate: string | null;
}) {
  if (DONE_STATUSES.includes(status)) {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-success/35 bg-success/10 p-3 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        <span>Processo concluído.</span>
      </div>
    );
  }
  if (!PROCESS_STATUSES.includes(status)) return null;
  const est = estimateBusinessWindow(startDate);
  if (!est) return null;
  return (
    <div
      className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm"
      role="note"
      aria-label="Prazo estimado, não é garantia de conclusão"
    >
      <p className="flex flex-wrap items-center gap-2 font-medium">
        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        Prazo estimado
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Estimativa
        </span>
      </p>
      <p className="mt-1 text-muted-foreground">
        Entre <span className="whitespace-nowrap">{est.min}</span> e{" "}
        <span className="whitespace-nowrap">{est.max}</span>, considerando de {PRAZO_MIN_DIAS_UTEIS}{" "}
        a {PRAZO_MAX_DIAS_UTEIS} dias úteis.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Referência aproximada, não é data garantida de conclusão.
      </p>
      {status === "aguardando_documentacao" && (
        <p className="mt-2 flex items-start gap-2 text-xs text-gold-light">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Há documentação pendente. A estimativa pode ser impactada até o envio do arquivo faltante.
        </p>
      )}
    </div>
  );
}
