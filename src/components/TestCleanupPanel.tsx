import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TEST_CLEANUP_CONFIRM,
  dryRunTestCleanup,
  executeTestCleanup,
  listTestMarkers,
  markAsTest,
  unmarkTest,
  type DryRunItem,
} from "@/lib/resource-lifecycle.functions";

const TYPES = [
  { v: "document", l: "Documento" },
  { v: "trademark", l: "Marca" },
  { v: "certificate", l: "Certificado" },
  { v: "organization", l: "Organização" },
  { v: "user", l: "Usuário" },
] as const;

export function TestCleanupPanel({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const [type, setType] = useState<(typeof TYPES)[number]["v"]>("document");
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  const [plan, setPlan] = useState<DryRunItem[] | null>(null);
  const [approved, setApproved] = useState<string[]>([]);
  const [confirm, setConfirm] = useState("");

  const markers = useQuery({ queryKey: ["test-markers"], enabled, queryFn: () => listTestMarkers() });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["test-markers"] });
    setPlan(null);
    setApproved([]);
  };
  const mark = useMutation({
    mutationFn: () => markAsTest({ data: { type, id: id.trim(), note: note.trim() } }),
    onSuccess: (r) => {
      toast.success(`Marcado como teste: ${r.label}`);
      setId("");
      setNote("");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível marcar."),
  });
  const unmark = useMutation({
    mutationFn: (markerId: string) => unmarkTest({ data: { markerId } }),
    onSuccess: refresh,
  });
  const dry = useMutation({
    mutationFn: () => dryRunTestCleanup(),
    onSuccess: (r) => {
      setPlan(r);
      setApproved([]);
    },
    onError: () => toast.error("Não foi possível gerar a simulação."),
  });
  const exec = useMutation({
    mutationFn: () => executeTestCleanup({ data: { markerIds: approved, confirm: TEST_CLEANUP_CONFIRM } }),
    onSuccess: (r) => {
      toast.success(
        `${r.done.length} item(ns) movido(s) para Excluídos${r.skipped.length ? `; ${r.skipped.length} ignorado(s)` : ""}.`,
      );
      setConfirm("");
      qc.invalidateQueries({ queryKey: ["deleted-resources"] });
      qc.invalidateQueries({ queryKey: ["admin-data"] });
      refresh();
    },
    onError: () => toast.error("Não foi possível executar."),
  });

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-2">
        <CardTitle className="text-lg">Dados de teste</CardTitle>
        <p className="text-sm text-muted-foreground">
          Só entra em limpeza o que for marcado aqui, um a um, com motivo. Nada é marcado
          automaticamente por nome, e-mail, data ou organização.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid gap-2 sm:grid-cols-[10rem_1fr]"
          onSubmit={(e) => {
            e.preventDefault();
            mark.mutate();
          }}
        >
          <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
            <SelectTrigger aria-label="Tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.v} value={t.v}>
                  {t.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input placeholder="ID do item" value={id} onChange={(e) => setId(e.target.value)} aria-label="ID do item" />
          <Input
            className="sm:col-span-2"
            placeholder="Motivo (ex.: enviado por mim para teste em 28/09)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-label="Motivo"
          />
          <Button type="submit" className="sm:col-span-2 sm:w-fit" disabled={mark.isPending || !id || note.trim().length < 3}>
            Marcar como teste
          </Button>
        </form>

        <div className="space-y-2">
          <p className="text-sm font-medium">Marcados ({markers.data?.length ?? 0})</p>
          {(markers.data ?? []).map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 p-2 text-xs">
              <span className="min-w-0 break-words">
                {m.type} · {m.label} — {m.note}
              </span>
              <Button size="sm" variant="ghost" onClick={() => unmark.mutate(m.id)}>
                Desmarcar
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Button variant="outline" onClick={() => dry.mutate()} disabled={dry.isPending}>
            Simular limpeza (dry-run)
          </Button>
          {plan && plan.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum item marcado como teste.</p>
          )}
          {plan?.map((p) => (
            <div key={p.markerId} className="space-y-1 rounded-lg border border-border/60 p-3 text-xs">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  disabled={!p.executable}
                  checked={approved.includes(p.markerId)}
                  onChange={(e) =>
                    setApproved(e.target.checked ? [...approved, p.markerId] : approved.filter((x) => x !== p.markerId))
                  }
                />
                <span className="min-w-0 break-words">
                  <strong>{p.classification.toUpperCase()}</strong> · {p.type} · {p.label}
                  <span className="block break-all text-muted-foreground">ID: {p.resourceId}</span>
                </span>
              </label>
              {p.reasons.length > 0 && <p className="text-muted-foreground">Motivos: {p.reasons.join("; ")}</p>}
              {p.dependencies.length > 0 && (
                <p className="text-muted-foreground">
                  Vínculos: {p.dependencies.map((d) => `${d.kind} “${d.label}”${d.markedTest ? " (teste)" : ""}`).join(", ")}
                </p>
              )}
              {p.cascades.length > 0 && (
                <p className="text-muted-foreground">
                  Apagaria junto: {p.cascades.map((c) => `${c.table}: ${c.count}`).join(", ")}
                </p>
              )}
              {p.files.length > 0 && (
                <p className="break-all text-muted-foreground">
                  Arquivos: {p.files.map((f) => `${f.bucket}/${f.path}`).join(", ")}
                </p>
              )}
            </div>
          ))}
          {plan && plan.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="h-9 w-44"
                placeholder={TEST_CLEANUP_CONFIRM}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-label={`Digite ${TEST_CLEANUP_CONFIRM}`}
              />
              <Button
                variant="destructive"
                disabled={approved.length === 0 || confirm !== TEST_CLEANUP_CONFIRM || exec.isPending}
                onClick={() => exec.mutate()}
              >
                Mover aprovados para Excluídos ({approved.length})
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                Itens incertos, contas e organizações nunca são executados. Os aprovados vão para
                Excluídos (recuperáveis), não são apagados.
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
