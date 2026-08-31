import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { useOwnership } from "@/hooks/useOwnership";
import { useUserActivity } from "@/hooks/useUserActivity";
import {
  TRADEMARK_STATUSES,
  TRADEMARK_STATUS_LABEL,
  formatDateTime,
} from "@/lib/portal";

export type AdminTrademark = {
  id: string;
  name: string;
  holder: string | null;
  nice_class: string | null;
  segment: string | null;
  notes: string | null;
  admin_notes: string | null;
  protocol_number: string | null;
  status: string;
  organization_id: string | null;
  submitted_at: string;
  updated_at: string;
};

type EditState = {
  name: string;
  holder: string;
  nice_class: string;
  segment: string;
  protocol_number: string;
  status: string;
  notes: string;
  admin_notes: string;
};

function toEditState(m: AdminTrademark): EditState {
  return {
    name: m.name,
    holder: m.holder ?? "",
    nice_class: m.nice_class ?? "",
    segment: m.segment ?? "",
    protocol_number: m.protocol_number ?? "",
    status: m.status,
    notes: m.notes ?? "",
    admin_notes: m.admin_notes ?? "",
  };
}

/**
 * Painel administrativo de marcas: busca, filtro e edição dos dados da marca.
 * A edição NUNCA envia organization_id nem created_by — titularidade e
 * compartilhamento continuam sendo alterados apenas na seção própria.
 */
export function AdminTrademarksPanel({
  marcas,
  enabled,
}: {
  marcas: AdminTrademark[];
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const ownership = useOwnership(enabled);
  const users = useUserActivity(enabled);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("todos");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState | null>(null);

  const orgName = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of ownership.data?.organizations ?? []) map.set(o.id, o.name);
    return map;
  }, [ownership.data]);

  const userName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users.data ?? []) map.set(u.user_id, u.full_name || u.email || u.user_id);
    return map;
  }, [users.data]);

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<EditState> }) => {
      const { error } = await supabase
        .from("trademarks")
        .update({
          name: input.patch.name?.trim(),
          holder: input.patch.holder?.trim() || null,
          nice_class: input.patch.nice_class?.trim() || null,
          segment: input.patch.segment?.trim() || null,
          protocol_number: input.patch.protocol_number?.trim() || null,
          status: input.patch.status,
          notes: input.patch.notes?.trim() || null,
          admin_notes: input.patch.admin_notes?.trim() || null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marca atualizada");
      queryClient.invalidateQueries({ queryKey: ["admin-data"] });
      queryClient.invalidateQueries({ queryKey: ["trademarks"] });
      setOpenId(null);
      setForm(null);
    },
    onError: () => toast.error("Não foi possível salvar as alterações da marca"),
  });

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return marcas.filter((m) => {
      if (status !== "todos" && m.status !== status) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.holder ?? "").toLowerCase().includes(q) ||
        (m.protocol_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [marcas, term, status]);

  function openEditor(m: AdminTrademark) {
    if (openId === m.id) {
      setOpenId(null);
      setForm(null);
      return;
    }
    setOpenId(m.id);
    setForm(toEditState(m));
  }

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-3">
        <CardTitle className="text-lg">Marcas submetidas</CardTitle>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por marca, titular ou protocolo"
              aria-label="Buscar marca"
              className="pl-9"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Filtrar por status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {TRADEMARK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {TRADEMARK_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhuma marca encontrada"
            description="Ajuste a busca ou o filtro de status para ver outras marcas."
          />
        ) : (
          filtered.map((m) => {
            const shares = (ownership.data?.shares ?? []).filter(
              (s) => s.resource_type === "trademark" && s.resource_id === m.id,
            );
            const isOpen = openId === m.id;
            return (
              <div key={m.id} className="rounded-xl border border-border/60 bg-background/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{m.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.holder ? `${m.holder} · ` : ""}
                      {m.organization_id
                        ? (orgName.get(m.organization_id) ?? "Organização removida")
                        : "Sem organização"}
                      {" · atualizada em "}
                      {formatDateTime(m.updated_at)}
                    </p>
                    {shares.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Compartilhada com:{" "}
                        {shares.map((s) => userName.get(s.user_id) ?? s.user_id).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      status={m.status}
                      label={TRADEMARK_STATUS_LABEL[m.status] ?? m.status}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditor(m)}
                      aria-expanded={isOpen}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                      {isOpen ? "Fechar" : "Editar"}
                    </Button>
                  </div>
                </div>

                {isOpen && form && (
                  <form
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (form.name.trim().length < 2) {
                        toast.error("Informe o nome da marca (mínimo 2 caracteres).");
                        return;
                      }
                      update.mutate({ id: m.id, patch: form });
                    }}
                  >
                    <div className="space-y-2">
                      <Label htmlFor={`name-${m.id}`}>Nome da marca *</Label>
                      <Input
                        id={`name-${m.id}`}
                        value={form.name}
                        maxLength={160}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`holder-${m.id}`}>Titular</Label>
                      <Input
                        id={`holder-${m.id}`}
                        value={form.holder}
                        maxLength={160}
                        onChange={(e) => setForm({ ...form, holder: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`class-${m.id}`}>Classe de Nice</Label>
                      <Input
                        id={`class-${m.id}`}
                        value={form.nice_class}
                        maxLength={80}
                        onChange={(e) => setForm({ ...form, nice_class: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`segment-${m.id}`}>Segmento</Label>
                      <Input
                        id={`segment-${m.id}`}
                        value={form.segment}
                        maxLength={120}
                        onChange={(e) => setForm({ ...form, segment: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`protocol-${m.id}`}>Nº de protocolo</Label>
                      <Input
                        id={`protocol-${m.id}`}
                        value={form.protocol_number}
                        maxLength={80}
                        onChange={(e) => setForm({ ...form, protocol_number: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`status-${m.id}`}>Status</Label>
                      <Select
                        value={form.status}
                        onValueChange={(v) => setForm({ ...form, status: v })}
                      >
                        <SelectTrigger id={`status-${m.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRADEMARK_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {TRADEMARK_STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={`notes-${m.id}`}>Observações da marca</Label>
                      <Textarea
                        id={`notes-${m.id}`}
                        value={form.notes}
                        maxLength={1000}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor={`anotes-${m.id}`}>Nota para o cliente</Label>
                      <Textarea
                        id={`anotes-${m.id}`}
                        value={form.admin_notes}
                        maxLength={1000}
                        onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <Button type="submit" disabled={update.isPending} aria-busy={update.isPending}>
                        {update.isPending ? "Salvando..." : "Salvar alterações"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setOpenId(null);
                          setForm(null);
                        }}
                      >
                        Cancelar
                      </Button>
                      <p className="w-full text-xs text-muted-foreground">
                        A titularidade e os compartilhamentos não mudam nesta edição — use a seção
                        “Titularidade e compartilhamento”.
                      </p>
                    </div>
                  </form>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
