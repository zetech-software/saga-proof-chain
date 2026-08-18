import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Clock, Download, UploadCloud } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { DOCUMENT_STATUS_LABEL, PRAZO_TEXTO, formatDateTime, formatBytes } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/painel/documentos")({
  head: () => ({
    meta: [
      { title: "Documentos — Torre de Registros | Saga Mitologia Cósmica" },
      {
        name: "description",
        content:
          "Envie documentos para registro em blockchain e acompanhe a esteira de produção em tempo real.",
      },
      { property: "og:title", content: "Documentos — Saga Mitologia Cósmica" },
      {
        property: "og:description",
        content: "Upload e acompanhamento dos documentos em registro blockchain.",
      },
    ],
  }),
  component: DocumentosPage,
});

function DocumentosPage() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .order("submitted_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("documents-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () =>
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Selecione um arquivo");
      if (title.trim().length < 2) throw new Error("Informe um título para o documento");
      if (file.size > 50 * 1024 * 1024) throw new Error("Arquivo maior que 50 MB");

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      const path = `${userId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage.from("documentos").upload(path, file);
      if (upErr) throw upErr;

      const { error } = await supabase.from("documents").insert({
        title: title.trim(),
        description: description.trim() || null,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        created_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento enviado! Ele entrou na esteira de registro.");
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erro ao enviar documento"),
  });

  async function download(path: string, name: string) {
    const { data, error } = await supabase.storage.from("documentos").createSignedUrl(path, 60);
    if (error || !data) {
      toast.error("Não foi possível gerar o link do arquivo");
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
        <h1 className="font-display text-3xl text-gold">Documentos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Envie os documentos que devem ser registrados em blockchain e acompanhe cada etapa.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
          <Clock className="h-4 w-4 text-primary" />
          <span>
            O registro em blockchain leva em média <strong>{PRAZO_TEXTO}</strong> por documento, em
            razão do prazo documental e da disponibilidade da plataforma.
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="bg-card/70">
          <CardHeader>
            <CardTitle className="text-lg">Enviar documento</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                upload.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={title}
                  maxLength={160}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Roteiro - Capítulo I"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Descrição</Label>
                <Textarea
                  id="desc"
                  value={description}
                  maxLength={1000}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Contexto do documento"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file">Arquivo * (até 50 MB)</Label>
                <Input
                  id="file"
                  type="file"
                  ref={fileRef}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={upload.isPending}>
                <UploadCloud className="mr-2 h-4 w-4" />
                {upload.isPending ? "Enviando..." : "Enviar para registro"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {(docs ?? []).map((d) => (
            <Card key={d.id} className="bg-card/70">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-serif text-xl">{d.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {d.file_name} · {formatBytes(d.file_size)} · enviado em{" "}
                      {formatDateTime(d.submitted_at)}
                    </p>
                  </div>
                  <StatusBadge
                    status={d.status}
                    label={DOCUMENT_STATUS_LABEL[d.status] ?? d.status}
                  />
                </div>
                {d.description && (
                  <p className="mt-3 text-sm text-muted-foreground">{d.description}</p>
                )}
                {d.admin_notes && (
                  <p className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                    <span className="text-primary">Zé Registra: </span>
                    {d.admin_notes}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => download(d.storage_path, d.file_name)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar arquivo
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Última atualização: {formatDateTime(d.updated_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          {isLoading && <ListSkeleton />}
          {!isLoading && !docs?.length && (
            <Card className="bg-card/70">
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Nenhum documento enviado ainda.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
