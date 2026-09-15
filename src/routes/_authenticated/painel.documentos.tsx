import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Clock, Download, FileText, UploadCloud } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMyOrganization } from "@/hooks/useMyOrganization";
import { usePortalSession } from "@/hooks/usePortalSession";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import { DOCUMENT_STATUS_LABEL, PRAZO_TEXTO, formatDateTime, formatBytes } from "@/lib/portal";
import { UPLOAD_HELP_TEXT, describeUploadError, validateUploadFile } from "@/lib/uploads";
import { FileDropzone } from "@/components/FileDropzone";
import { EmptyState } from "@/components/EmptyState";
import { downloadFromBucket } from "@/lib/downloads";

import { RouteErrorState } from "@/components/RouteErrorState";

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
  errorComponent: RouteErrorState,
  component: DocumentosPage,
});

function DocumentosPage() {
  const queryClient = useQueryClient();
  const { data: session } = usePortalSession();
  const isAdmin = session?.isAdmin ?? false;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function handleFileChange(selected: File | null) {
    if (!selected) {
      setFile(null);
      return;
    }
    const result = validateUploadFile(selected);
    if (!result.ok) {
      toast.error(result.message);
      setFile(null);
      return;
    }
    setFile(selected);
  }

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

  const { data: myOrgId } = useMyOrganization();

  const upload = useMutation({
    mutationFn: async () => {
      if (title.trim().length < 2) throw new Error("Informe um título para o documento");
      // Revalidação imediatamente antes do envio.
      const checked = validateUploadFile(file);
      if (!checked.ok) throw new Error(checked.message);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      const path = `${userId}/${checked.storageName}`;
      const { error: upErr } = await supabase.storage
        .from("documentos")
        .upload(path, checked.file, { contentType: checked.contentType, upsert: false });
      if (upErr) throw upErr;

      const { error } = await supabase.from("documents").insert({
        title: title.trim(),
        description: description.trim() || null,
        storage_path: path,
        file_name: checked.displayName,
        file_size: checked.file.size,
        mime_type: checked.contentType,
        created_by: userId,
        organization_id: myOrgId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento enviado! Ele entrou na esteira de registro.");
      setTitle("");
      setDescription("");
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
    onError: (e: unknown) => toast.error(describeUploadError(e)),
  });

  async function download(path: string, name: string) {
    const result = await downloadFromBucket("documentos", path, name);
    if (!result.ok) toast.error(result.message);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-gold">Documentos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Envie os documentos que devem ser registrados em blockchain e acompanhe cada etapa.
        </p>
      </div>

      <Card className="border-brand-hover/30 bg-brand-hover/5">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
          <Clock className="h-4 w-4 text-brand-hover" />
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
                <Label htmlFor="file">Arquivo *</Label>
                <FileDropzone
                  id="file"
                  file={file}
                  disabled={upload.isPending}
                  onSelect={handleFileChange}
                />
                <p id="file-help" className="text-xs leading-relaxed text-muted-foreground">
                  {UPLOAD_HELP_TEXT}
                </p>
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={upload.isPending || !file}
                aria-busy={upload.isPending}
              >
                <UploadCloud className="h-4 w-4" />
                {upload.isPending ? "Enviando arquivo..." : "Enviar para registro"}
              </Button>
              {upload.isPending && (
                <p className="text-xs text-muted-foreground" role="status">
                  Envio em andamento — não feche esta página.
                </p>
              )}

            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {(docs ?? []).map((d) => (
            <Card key={d.id} className="bg-card/70">
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-serif text-xl leading-snug">{d.title}</h3>
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {d.file_name} · {formatBytes(d.file_size)}
                      {isAdmin ? ` · enviado em ${formatDateTime(d.submitted_at)}` : ""}
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
                  <p className="mt-3 rounded-lg border border-brand-hover/30 bg-brand-hover/5 p-3 text-sm">
                    <span className="text-brand-hover">Zé Registra: </span>
                    {d.admin_notes}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => download(d.storage_path, d.file_name)}
                  >
                    <Download className="h-4 w-4" />
                    Baixar arquivo
                  </Button>
                  {isAdmin && (
                    <span className="text-xs text-muted-foreground">
                      Última atualização: {formatDateTime(d.updated_at)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {isLoading && <ListSkeleton />}
          {!isLoading && !docs?.length && (
            <EmptyState
              icon={FileText}
              title="Nenhum documento enviado ainda"
              description="Envie o primeiro arquivo pelo formulário ao lado para iniciar a esteira de registro em blockchain."
            />
          )}
        </div>
      </div>
    </div>
  );
}
