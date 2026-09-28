import { useState } from "react";
import { Eye } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProcessEstimate } from "@/components/ProcessEstimate";
import { StatusBadge } from "@/components/StatusBadge";
import { DOCUMENT_STATUS_LABEL } from "@/lib/portal";

const STATES = ["em_andamento", "aguardando_documentacao", "concluido"] as const;

/** Prévia somente visual — não grava nada; reutiliza o mesmo bloco do cliente. */
export function ProcessEstimatePreview() {
  const [start, setStart] = useState("2026-09-28");
  return (
    <Card className="bg-card/70" data-testid="estimate-preview">
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Eye className="h-4 w-4" aria-hidden />
          Prévia do prazo estimado (visão do cliente)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Somente visual: nada é salvo, nenhum documento, aviso ou status é criado.
        </p>
        <div className="max-w-xs space-y-1">
          <Label htmlFor="preview-start">Data de início simulada</Label>
          <Input
            id="preview-start"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-3">
        {STATES.map((s) => (
          <div
            key={s}
            className="min-w-0 rounded-xl border border-border/60 bg-background/40 p-4"
            data-testid={`preview-${s}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-serif text-base">Exemplo de processo</p>
              <StatusBadge status={s} label={DOCUMENT_STATUS_LABEL[s] ?? s} />
            </div>
            <ProcessEstimate status={s} startDate={start || null} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
