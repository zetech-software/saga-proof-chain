import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDateOnly } from "@/lib/portal";

/** Admin confirma manualmente a data real de início do processo (base da estimativa). */
export function ProcessStartDateEditor({
  documentId,
  current,
}: {
  documentId: string;
  current: string | null;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!current);
  const [value, setValue] = useState(current ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const save = useMutation({
    mutationFn: async (date: string) => {
      const { error } = await supabase
        .from("documents")
        .update({ process_started_at: date })
        .eq("id", documentId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Data de início confirmada");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-data"] });
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: () => toast.error("Não foi possível confirmar a data"),
  });

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(value);

  return (
    <div className="space-y-3 rounded-lg border border-border/60 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <CalendarCheck className="h-4 w-4" aria-hidden />
        Data real de início do processo
      </p>
      {current && !editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm">Data de início confirmada: {formatDateOnly(current)}</p>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Alterar data
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor={`pstart-${documentId}`} className="sr-only">
              Data real de início
            </Label>
            <Input
              id={`pstart-${documentId}`}
              type="date"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-44"
            />
          </div>
          <Button
            size="sm"
            disabled={!valid || save.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            Confirmar data
          </Button>
          {current && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(current);
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Essa data será usada para calcular a estimativa de prazo mostrada ao cliente. Informe apenas
        a data real conhecida.
      </p>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {current ? "Alterar a data de início?" : "Confirmar a data de início?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {valid ? formatDateOnly(value) : ""} será usada para calcular a estimativa de 7 a 25
              dias úteis exibida ao cliente.
              {current
                ? ` A data confirmada anterior (${formatDateOnly(current)}) será substituída.`
                : ""}{" "}
              O status do processo não muda.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => save.mutate(value)}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
