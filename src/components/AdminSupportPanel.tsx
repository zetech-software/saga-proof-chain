import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquare, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { SUPPORT_STATUS_LABEL, formatDateTime } from "@/lib/portal";
import { useSupportNotifications } from "@/hooks/useSupportNotifications";

export type AdminSupportRow = {
  id: string;
  created_by: string | null;
  subject: string;
  message: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
};

type Profile = { id: string; full_name: string | null; email: string | null };

const FILTERS = [
  { key: "pendentes", label: "Aguardando resposta" },
  { key: "respondida", label: "Respondidas" },
  { key: "fechada", label: "Fechadas" },
  { key: "todas", label: "Todas" },
] as const;

/** Fila de atendimento do Admin — usa a mesma tabela e notificações do Suporte do cliente. */
export function AdminSupportPanel({
  requests,
  profiles,
}: {
  requests: AdminSupportRow[];
  profiles: Profile[];
}) {
  const qc = useQueryClient();
  const { adminCount, unreadIdFor, markRead, markAllRead } = useSupportNotifications();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("pendentes");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const counts = useMemo(
    () => ({
      pendentes: requests.filter((r) => r.status === "aberta").length,
      respondida: requests.filter((r) => r.status === "respondida").length,
      fechada: requests.filter((r) => r.status === "fechada").length,
      todas: requests.length,
    }),
    [requests],
  );
  const rows = requests.filter((r) =>
    filter === "todas" ? true : filter === "pendentes" ? r.status === "aberta" : r.status === filter,
  );

  const update = useMutation({
    mutationFn: async (input: { id: string; status?: string; admin_reply?: string }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from("support_requests").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.admin_reply !== undefined ? "Resposta enviada ao cliente" : "Chamado atualizado");
      if (v.admin_reply !== undefined) setDrafts((d) => ({ ...d, [v.id]: "" }));
      qc.invalidateQueries({ queryKey: ["admin-data"] });
      qc.invalidateQueries({ queryKey: ["support-requests"] });
    },
    onError: () => toast.error("Não foi possível atualizar o chamado"),
  });

  return (
    <Card className="bg-card/70">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-lg">Chamados de suporte</CardTitle>
        {adminCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate("new_support_request")}
            disabled={markAllRead.isPending}
          >
            Marcar {adminCount} {adminCount === 1 ? "novo" : "novos"} como visualizados
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label} ({counts[f.key]})
            </Button>
          ))}
        </div>

        {rows.length === 0 && (
          <EmptyState icon={MessageSquare} title="Nenhum chamado neste filtro" description="Troque o filtro para ver outros chamados." />
        )}

        {rows.map((s) => {
          const unreadId = unreadIdFor("new_support_request", s.id);
          const who = s.created_by ? byId.get(s.created_by) : undefined;
          const draft = drafts[s.id] ?? "";
          return (
            <div
              key={s.id}
              className={`min-w-0 rounded-lg border p-4 ${unreadId ? "border-brand-hover/50 bg-brand-hover/5" : "border-border/60"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">{s.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {who?.full_name || who?.email || "Cliente removido"}
                    {who?.email && who.full_name ? ` · ${who.email}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">Enviado em {formatDateTime(s.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {unreadId && (
                    <span className="rounded-full border border-brand-hover/40 bg-brand-hover/10 px-2.5 py-0.5 text-xs text-brand-hover">
                      Novo
                    </span>
                  )}
                  <StatusBadge status={s.status} label={SUPPORT_STATUS_LABEL[s.status] ?? s.status} />
                </div>
              </div>

              <div className="mt-3 rounded-md border border-border/60 bg-background/40 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Mensagem do cliente</p>
                <p className="mt-1 whitespace-pre-line break-words text-sm">{s.message}</p>
              </div>

              {s.admin_reply && (
                <div className="mt-2 rounded-md border border-brand-hover/25 bg-brand-hover/5 p-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-brand-hover">Resposta enviada</p>
                  <p className="mt-1 whitespace-pre-line break-words text-sm">{s.admin_reply}</p>
                </div>
              )}

              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (draft.trim().length < 2) { toast.error("Escreva a resposta"); return; }
                  update.mutate({ id: s.id, admin_reply: draft.trim(), status: "respondida" });
                }}
              >
                <Textarea
                  value={draft}
                  maxLength={2000}
                  rows={3}
                  placeholder={s.admin_reply ? "Substituir a resposta enviada" : "Escreva a resposta ao cliente"}
                  aria-label={`Resposta ao chamado ${s.subject}`}
                  onFocus={() => unreadId && markRead.mutate(unreadId)}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={update.isPending || draft.trim().length < 2}>
                    <Send className="h-4 w-4" /> {update.isPending ? "Enviando resposta…" : "Enviar resposta"}
                  </Button>
                  {s.status !== "fechada" ? (
                    <Button type="button" size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: s.id, status: "fechada" })}>
                      Fechar chamado
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: s.id, status: "aberta" })}>
                      Reabrir
                    </Button>
                  )}
                </div>
              </form>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
