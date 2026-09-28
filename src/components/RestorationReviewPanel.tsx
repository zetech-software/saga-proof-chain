import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import {
  ignoreCandidate,
  listRestorationCandidates,
  restoreCandidate,
} from "@/lib/resource-lifecycle.functions";
import { formatDateTime } from "@/lib/portal";

const yesNo = (v: boolean | null) => (v === null ? "—" : v ? "sim" : "não");

export function RestorationReviewPanel({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const [depsOpen, setDepsOpen] = useState<string | null>(null);
  const [ignoreNote, setIgnoreNote] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["restoration-candidates"],
    enabled,
    queryFn: () => listRestorationCandidates(),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["restoration-candidates"] });
    qc.invalidateQueries({ queryKey: ["admin-data"] });
  };
  const restore = useMutation({
    mutationFn: (id: string) => restoreCandidate({ data: { id } }),
    onSuccess: () => {
      toast.success("Item restaurado");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível restaurar."),
  });
  const ignore = useMutation({
    mutationFn: (v: { id: string; note: string }) => ignoreCandidate({ data: v }),
    onSuccess: () => {
      toast.success("Item marcado como ignorado");
      refresh();
    },
    onError: () => toast.error("Informe um motivo (mín. 3 caracteres)."),
  });

  const items = q.data ?? [];
  const pending = items.filter((i) => i.decision === "pendente").length;

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-2">
        <CardTitle className="text-lg">Revisão de restauração</CardTitle>
        <p className="text-sm text-muted-foreground">
          Compara a cópia anterior à limpeza com o estado atual. Cada item exige aprovação
          individual; nada é sobrescrito. Não existe “Restaurar tudo”.
          {items.length > 0 && ` ${pending} pendente(s).`}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="Aguardando a cópia anterior"
            description="Quando o suporte entregar a cópia de antes da limpeza de 28/09, os itens a recuperar aparecerão aqui para revisão."
          />
        ) : (
          items.map((i) => (
            <div key={i.id} className="space-y-2 rounded-xl border border-border/60 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {i.type} · origem: {i.source}
                  </p>
                  <p className="break-words font-medium">{i.title ?? "(sem título)"}</p>
                  <p className="break-all text-xs text-muted-foreground">ID anterior: {i.previousId ?? "—"}</p>
                </div>
                <span className="rounded-full border border-border px-2 py-0.5 text-xs">{i.decision}</span>
              </div>
              <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <div>Proprietário: {i.owner ?? "—"}</div>
                <div>Organização: {i.organization ?? "—"}</div>
                <div>Data: {i.originalDate ? formatDateTime(i.originalDate) : "—"}</div>
                <div className="break-all">
                  Arquivo: {i.filePath ?? "—"}
                  {i.filePath && ` (no armazenamento: ${yesNo(i.fileExists)})`}
                </div>
                <div>Dependências: {i.dependencies.length}</div>
                <div>Existe atualmente? {yesNo(i.existsNow)}</div>
                <div>Conflito com registro atual? {yesNo(i.conflict)}</div>
                {i.note && <div>Nota: {i.note}</div>}
              </dl>
              {depsOpen === i.id && (
                <ul className="space-y-1 rounded-lg bg-muted/40 p-3 text-xs">
                  {i.dependencies.length === 0 && <li>Sem dependências.</li>}
                  {i.dependencies.map((d: { type: string; id: string; label?: string; exists: boolean }) => (
                    <li key={`${d.type}-${d.id}`} className="break-all">
                      {d.type} {d.label ?? ""} ({d.id}) — {d.exists ? "existe" : "ainda não existe"}
                    </li>
                  ))}
                </ul>
              )}
              {i.decision === "pendente" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={!i.restorable || i.conflict || restore.isPending}
                    onClick={() => restore.mutate(i.id)}
                  >
                    Restaurar este item
                  </Button>
                  <Input
                    className="h-8 w-48"
                    placeholder="Motivo para ignorar"
                    value={ignoreNote[i.id] ?? ""}
                    onChange={(e) => setIgnoreNote({ ...ignoreNote, [i.id]: e.target.value })}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ignore.isPending}
                    onClick={() => ignore.mutate({ id: i.id, note: ignoreNote[i.id] ?? "" })}
                  >
                    Ignorar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDepsOpen(depsOpen === i.id ? null : i.id)}
                  >
                    Revisar dependências
                  </Button>
                  {!i.restorable && (
                    <p className="w-full text-xs text-muted-foreground">
                      Contas e arquivos precisam de restauração assistida pelo suporte.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
