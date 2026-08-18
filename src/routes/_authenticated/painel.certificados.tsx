import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, ShieldCheck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OFFICIAL_LINKS, formatDateTime } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/painel/certificados")({
  head: () => ({
    meta: [
      { title: "Certificados blockchain — Torre de Registros | Saga Mitologia Cósmica" },
      {
        name: "description",
        content:
          "Certificados de registro em blockchain emitidos, com hash de transação e verificação pública.",
      },
      { property: "og:title", content: "Certificados blockchain — Saga Mitologia Cósmica" },
      {
        property: "og:description",
        content: "Consulte certificados emitidos e verifique cada registro em fontes oficiais.",
      },
    ],
  }),
  component: CertificadosPage,
});

function CertificadosPage() {
  const queryClient = useQueryClient();

  const { data: certs } = useQuery({
    queryKey: ["certificates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("*")
        .order("issued_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("certificates-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "certificates" }, () =>
        queryClient.invalidateQueries({ queryKey: ["certificates"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from("certificados").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Não foi possível gerar o link do certificado");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-gold">Certificados em blockchain</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Atualizados em tempo real conforme os registros são concluídos na esteira de produção.
        </p>
      </div>

      <div className="grid gap-4">
        {(certs ?? []).map((c) => (
          <Card key={c.id} className="border-primary/25 bg-card/70">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-3">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-serif text-xl">{c.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      Emitido em {formatDateTime(c.issued_at)}
                      {c.network ? ` · Rede ${c.network}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              {c.tx_hash && (
                <p className="mt-4 break-all rounded-lg border border-border/60 bg-background/60 p-3 font-mono text-xs">
                  {c.tx_hash}
                </p>
              )}
              {c.notes && <p className="mt-3 text-sm text-muted-foreground">{c.notes}</p>}

              <div className="mt-4 flex flex-wrap gap-3">
                {c.storage_path && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => download(c.storage_path!, c.file_name ?? "certificado.pdf")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar certificado
                  </Button>
                )}
                {c.verification_url && (
                  <Button variant="ghost" size="sm" asChild>
                    <a href={c.verification_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Verificar publicamente
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {!certs?.length && (
          <Card className="bg-card/70">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Nenhum certificado emitido ainda. Assim que o registro for concluído, ele aparece aqui
              automaticamente.
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle className="text-lg">Fontes oficiais de consulta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {OFFICIAL_LINKS.map((l) => (
            <a
              key={l.url}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border/60 p-3 transition-colors hover:border-primary/50"
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
  );
}
