import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArchiveRestore, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/EmptyState";
import {
  PURGE_CONFIRM,
  listDeletedResources,
  purgeResource,
  restoreResource,
  type DeletedItem,
} from "@/lib/resource-lifecycle.functions";
import { formatDateTime } from "@/lib/portal";

const TYPE_LABEL: Record<DeletedItem["type"], string> = {
  trademark: "Marca",
  document: "Documento",
  certificate: "Certificado",
};
const FILTERS = [
  { v: "todos", l: "Todos" },
  { v: "document", l: "Documentos" },
  { v: "trademark", l: "Marcas" },
  { v: "certificate", l: "Certificados" },
] as const;

export function DeletedItemsPanel({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["v"]>("todos");
  const [confirm, setConfirm] = useState("");
  const q = useQuery({
    queryKey: ["deleted-resources"],
    enabled,
    queryFn: () => listDeletedResources(),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["deleted-resources"] });
    qc.invalidateQueries({ queryKey: ["admin-data"] });
  };
  const restore = useMutation({
    mutationFn: (i: DeletedItem) => restoreResource({ data: { type: i.type, id: i.id } }),
    onSuccess: () => {
      toast.success("Item restaurado");
      refresh();
    },
    onError: () => toast.error("Não foi possível restaurar."),
  });
  const purge = useMutation({
    mutationFn: (i: DeletedItem) =>
      purgeResource({ data: { type: i.type, id: i.id, confirm: PURGE_CONFIRM } }),
    onSuccess: (r) => {
      if (r.blocked) {
        toast.error(`Exclusão definitiva bloqueada: ${r.reasons.join(", ")}.`);
        return;
      }
      toast.success(
        r.file && !r.file.removed
          ? `Registro excluído; arquivo não removido (${r.file.reason}).`
          : "Excluído definitivamente",
      );
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível excluir."),
    onSettled: () => setConfirm(""),
  });

  const items = useMemo(
    () => (q.data?.items ?? []).filter((i) => filter === "todos" || i.type === filter),
    [q.data, filter],
  );

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-3">
        <CardTitle className="text-lg">Excluídos</CardTitle>
        <p className="text-sm text-muted-foreground">
          Itens excluídos ficam aqui por {q.data?.retentionDays ?? 30} dias, com arquivo preservado.
          Nada é apagado automaticamente ao fim do prazo.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar tipo">
          {FILTERS.map((f) => (
            <Button
              key={f.v}
              size="sm"
              variant={filter === f.v ? "default" : "outline"}
              onClick={() => setFilter(f.v)}
            >
              {f.l}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <EmptyState title="Nenhum item excluído" description="Quando algo for excluído, aparece aqui." />
        ) : (
          items.map((i) => (
            <div key={`${i.type}-${i.id}`} className="rounded-xl border border-border/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {TYPE_LABEL[i.type]}
                  </p>
                  <p className="break-words font-medium">{i.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Proprietário: {i.owner ?? "—"} · Organização: {i.organization ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Excluído em {formatDateTime(i.deletedAt)} por {i.deletedBy ?? "—"} ·{" "}
                    {i.daysLeft > 0
                      ? `${i.daysLeft} dia(s) restantes para recuperação`
                      : "prazo de retenção encerrado (continua recuperável até exclusão manual)"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(i)}
                  >
                    <ArchiveRestore className="h-4 w-4" aria-hidden />
                    Restaurar
                  </Button>
                  <AlertDialog onOpenChange={(o) => !o && setConfirm("")}>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Excluir definitivamente
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir “{i.title}” definitivamente?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O registro e o arquivo correspondente serão apagados para sempre. Fica
                          bloqueado se houver vínculos. Digite {PURGE_CONFIRM} para confirmar.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <Input
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder={PURGE_CONFIRM}
                        aria-label={`Digite ${PURGE_CONFIRM} para confirmar`}
                        autoComplete="off"
                      />
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          disabled={confirm !== PURGE_CONFIRM || purge.isPending}
                          onClick={() => purge.mutate(i)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Excluir definitivamente
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
