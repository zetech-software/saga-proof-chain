import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { SUPPORT_STATUS_LABEL, formatDateTime } from "@/lib/portal";

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
  component: SuportePage,
});

function SuportePage() {
  const queryClient = useQueryClient();
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
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Descreva sua dúvida ou solicitação"
                />
              </div>
              <Button type="submit" className="w-full" disabled={send.isPending}>
                <LifeBuoy className="mr-2 h-4 w-4" />
                {send.isPending ? "Enviando..." : "Enviar solicitação"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {(requests ?? []).map((r) => (
            <Card key={r.id} className="bg-card/70">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl">{r.subject}</h3>
                    <p className="text-xs text-muted-foreground">
                      Enviada em {formatDateTime(r.created_at)}
                    </p>
                  </div>
                  <StatusBadge
                    status={r.status}
                    label={SUPPORT_STATUS_LABEL[r.status] ?? r.status}
                  />
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                  {r.message}
                </p>
                {r.admin_reply && (
                  <p className="mt-3 whitespace-pre-line rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="text-primary">Zé Registra: </span>
                    {r.admin_reply}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
          {isLoading && <ListSkeleton />}
          {!isLoading && !requests?.length && (
            <Card className="bg-card/70">
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Nenhuma solicitação enviada ainda.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
