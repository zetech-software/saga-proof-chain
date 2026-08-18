import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Stamp, FileText, ShieldCheck, Clock, ExternalLink } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import guardiaoVideo from "@/assets/guardiao.mp4.asset.json";
import guardiaoPoster from "@/assets/guardiao-poster.jpg";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DOCUMENT_STATUS_LABEL,
  OFFICIAL_LINKS,
  PRAZO_TEXTO,
  TRADEMARK_STATUS_LABEL,
  formatDateTime,
} from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/painel/")({
  head: () => ({
    meta: [
      { title: "Visão geral — Torre de Registros | Saga Mitologia Cósmica" },
      {
        name: "description",
        content: "Resumo de marcas, documentos na esteira e certificados em blockchain.",
      },
      { property: "og:title", content: "Visão geral — Torre de Registros | Saga Mitologia Cósmica" },
      { property: "og:description", content: "Acompanhe seus registros em tempo real." },
    ],
  }),
  component: Overview,
});

function Overview() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["overview"],
    queryFn: async () => {
      const [marcas, docs, certs] = await Promise.all([
        supabase.from("trademarks").select("*").order("submitted_at", { ascending: false }),
        supabase.from("documents").select("*").order("submitted_at", { ascending: false }),
        supabase.from("certificates").select("*").order("issued_at", { ascending: false }),
      ]);
      return {
        marcas: marcas.data ?? [],
        docs: docs.data ?? [],
        certs: certs.data ?? [],
      };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("overview-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () =>
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "certificates" }, () =>
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "trademarks" }, () =>
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const naEsteira = (data?.docs ?? []).filter(
    (d) => d.status !== "certificado_emitido" && d.status !== "registrado",
  ).length;

  const cards = [
    {
      label: "Marcas submetidas",
      value: data?.marcas.length ?? 0,
      icon: Stamp,
      to: "/painel/marcas" as const,
    },
    {
      label: "Documentos na esteira",
      value: naEsteira,
      icon: FileText,
      to: "/painel/documentos" as const,
    },
    {
      label: "Certificados emitidos",
      value: data?.certs.length ?? 0,
      icon: ShieldCheck,
      to: "/painel/certificados" as const,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-2xl border border-border/60">
        <video
          className="aspect-video w-full object-contain mix-blend-screen"
          src={guardiaoVideo.url}
          poster={guardiaoPoster}
          preload="metadata"
          autoPlay
          loop
          muted
          playsInline
          disablePictureInPicture
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-background to-transparent" />
      </div>


      <div>
        <h1 className="font-display text-3xl text-gold">Visão geral</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acompanhamento em tempo real dos registros da Saga Mitologia Cósmica.
        </p>
      </div>


      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to}>
            <Card className="h-full border-border/70 bg-card/70 transition-colors hover:border-primary/50">
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="rounded-xl bg-primary/10 p-3">
                  <c.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-3xl font-semibold">{c.value}</p>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {c.label}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
          <Clock className="h-4 w-4 text-primary" />
          <span>
            Prazo médio de registro em blockchain: <strong>{PRAZO_TEXTO}</strong> por documento
            submetido, por razão de prazo documental e disponibilidade da plataforma.
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Últimas atualizações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data?.docs ?? []).slice(0, 5).map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    Atualizado em {formatDateTime(d.updated_at)}
                  </p>
                </div>
                <StatusBadge
                  status={d.status}
                  label={DOCUMENT_STATUS_LABEL[d.status] ?? d.status}
                />
              </div>
            ))}
            {(data?.marcas ?? []).slice(0, 3).map((m) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">Marca: {m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Atualizado em {formatDateTime(m.updated_at)}
                  </p>
                </div>
                <StatusBadge
                  status={m.status}
                  label={TRADEMARK_STATUS_LABEL[m.status] ?? m.status}
                />
              </div>
            ))}
            {!data?.docs.length && !data?.marcas.length && (
              <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Consulta em fontes oficiais</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {OFFICIAL_LINKS.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-border/60 p-3 transition-colors hover:border-primary/50"
              >
                <p className="flex items-center gap-2 text-sm font-medium">
                  {l.name} <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </p>
                <p className="text-xs text-muted-foreground">{l.description}</p>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
