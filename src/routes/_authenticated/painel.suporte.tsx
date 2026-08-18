import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, LifeBuoy, MessageSquare } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { SUPPORT_STATUS_LABEL, formatDateTime } from "@/lib/portal";
import { useSupportNotifications } from "@/hooks/useSupportNotifications";
import { usePortalSession } from "@/hooks/usePortalSession";
import { EmptyState } from "@/components/EmptyState";

import { RouteErrorState } from "@/components/RouteErrorState";

export const Route = createFileRoute("/_authenticated/painel/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte — Torre de Registros | Saga Mitologia Cósmica" },
      {
        name: "description",
        content: "Envie dúvidas e solicitações à equipe Zé Registra e acompanhe as respostas.",
      },
      { property: "og:title", content: "Suporte — Saga Mitologia Cósmica" },
      {
        property: "og:description",
        content: "Canal direto com a equipe Zé Registra para dúvidas sobre seus registros.",
      },
    ],
  }),
  errorComponent: RouteErrorState,
  component: SuportePage,
});

function SuportePage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: session, isLoading: sessionLoading } = usePortalSession();
  const isAdmin = session?.isAdmin ?? false;
  const { clientCount, unreadIdFor, markRead, markAllRead } = useSupportNotifications();

  useEffect(() => {
    if (isAdmin) navigate({ to: "/painel/admin", replace: true });
  }, [isAdmin, navigate]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const { data: requests, isLoading } = useQuery({
    queryKey: ["support-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("support-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_requests" }, () =>
        queryClient.invalidateQueries({ queryKey: ["support-requests"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const send = useMutation({
    mutationFn: async () => {
      if (subject.trim().length < 2) throw new Error("Informe o assunto");
      if (message.trim().length < 5) throw new Error("Descreva sua solicitação");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const { error } = await supabase.from("support_requests").insert({
        subject: subject.trim(),
        message: message.trim(),
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação enviada à equipe Zé Registra.");
      setSubject("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["support-requests"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao enviar solicitação"),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-gold">Suporte</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Fale direto com a equipe Zé Registra e acompanhe as respostas por aqui.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Nova solicitação</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="subject">Assunto *</Label>
                <Input
                  id="subject"
                  value={subject}
                  maxLength={160}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ex.: Dúvida sobre prazo do certificado"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">Mensagem *</Label>
                <Textarea
                  id="message"
                  value={message}
                  maxLength={2000}
                  className="min-h-35"
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva sua dúvida ou solicitação com o máximo de detalhes possível."
                />
                <p className="text-xs text-muted-foreground">
                  {message.length}/2000 caracteres
                </p>
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={send.isPending}
                aria-busy={send.isPending}
              >
                <LifeBuoy className="h-4 w-4" />
                {send.isPending ? "Enviando..." : "Enviar solicitação"}
              </Button>
              {send.isPending && (
                <p className="text-xs text-muted-foreground" role="status">
                  Enviando sua solicitação...
                </p>
              )}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {clientCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-sm">
                Você tem {clientCount}{" "}
                {clientCount === 1 ? "resposta não lida" : "respostas não lidas"}.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllRead.mutate("support_response")}
                disabled={markAllRead.isPending}
                aria-busy={markAllRead.isPending}
              >
                <CheckCheck className="h-4 w-4" />
                {markAllRead.isPending ? "Marcando..." : "Marcar todas como lidas"}
              </Button>
            </div>
          )}
          {(requests ?? []).map((r) => {
            const unreadId = unreadIdFor("support_response", r.id);
            return (
              <Card
                key={r.id}
                className={`bg-card/70 ${unreadId ? "border-primary/50 ring-1 ring-primary/30" : ""}`}
              >
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words font-serif text-xl leading-snug">{r.subject}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Enviada em {formatDateTime(r.created_at)}
                      </p>
                    </div>
                    <StatusBadge
                      status={r.status}
                      label={SUPPORT_STATUS_LABEL[r.status] ?? r.status}
                    />
                  </div>

                  <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      Sua mensagem
                    </p>
                    <p className="mt-1.5 whitespace-pre-line break-words text-sm text-muted-foreground">
                      {r.message}
                    </p>
                  </div>

                  {r.admin_reply && (
                    <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-primary">
                        Resposta da Zé Registra
                      </p>
                      <p className="mt-1.5 whitespace-pre-line break-words text-sm text-foreground">
                        {r.admin_reply}
                      </p>
                    </div>
                  )}
                  {unreadId && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs text-primary">
                        Resposta não lida
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markRead.mutate(unreadId)}
                        disabled={markRead.isPending}
                        aria-label={`Marcar resposta do chamado ${r.subject} como lida`}
                      >
                        Marcar como lida
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {isLoading && <ListSkeleton />}
          {!isLoading && !requests?.length && (
            <EmptyState
              icon={MessageSquare}
              title="Nenhuma solicitação enviada ainda"
              description="Abra um chamado no formulário ao lado. As respostas da equipe Zé Registra aparecem aqui."
            />
          )}
        </div>
      </div>
    </div>
  );
}
