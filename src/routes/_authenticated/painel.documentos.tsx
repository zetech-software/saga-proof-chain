import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Award, Clock, Download, FileText, UploadCloud, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useMyOrganization } from "@/hooks/useMyOrganization";
import { usePortalSession } from "@/hooks/usePortalSession";
import { logResourceView } from "@/hooks/useResourceViews";
import { useSupportNotifications } from "@/hooks/useSupportNotifications";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ListSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DOCUMENT_STATUS_LABEL,
  PRAZO_TEXTO,
  reliableProcessStart,
  formatDateTime,
  formatBytes,
} from "@/lib/portal";
import { useScrollToHash } from "@/hooks/useScrollToHash";
import { ProcessEstimate } from "@/components/ProcessEstimate";
import { UPLOAD_HELP_TEXT, describeUploadError, validateUploadFileDeep } from "@/lib/uploads";
import { submitClientDocument } from "@/lib/uploads.functions";
import { stagePendingUpload } from "@/lib/secure-upload";
import { FileDropzone } from "@/components/FileDropzone";
import { EmptyState } from "@/components/EmptyState";
import { downloadFromBucket } from "@/lib/downloads";

import { RouteErrorState } from "@/components/RouteErrorState";

type FileStage =
  | { kind: "preparando" | "enviando" | "validando" | "concluido" }
  | { kind: "falhou"; message: string };

const STAGE_LABEL: Record<FileStage["kind"], string> = {
  preparando: "Preparando arquivo…",
  enviando: "Enviando…",
  validando: "Validando arquivo…",
  concluido: "Concluído",
  falhou: "Falhou",
};

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

type RelatedDoc = { id: string; title: string };

function fileExtension(name: string) {
  return name.includes(".") ? (name.split(".").pop() ?? "").toUpperCase() : "—";
}

function DocumentosPage() {
  const queryClient = useQueryClient();
  const { data: session } = usePortalSession();
  const isAdmin = session?.isAdmin ?? false;
  const myUserId = session?.user?.id ?? null;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [related, setRelated] = useState<RelatedDoc | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [fileStages, setFileStages] = useState<Record<number, FileStage>>({});
  const formRef = useRef<HTMLDivElement>(null);

  async function handleFileChange(selected: File | null) {
    if (!selected) return;
    const result = await validateUploadFileDeep(selected);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setFiles((prev) =>
      prev.some((f) => f.name === selected.name && f.size === selected.size)
        ? prev
        : [...prev, selected].slice(0, 10),
    );
  }

  const {
    data: docs,
    isLoading,
    isError,
  } = useQuery({
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

  useScrollToHash(!isLoading && !!docs);

  const docIds = (docs ?? []).map((d) => d.id);
  const { data: certs } = useQuery({
    queryKey: ["certificates", "by-document", docIds.join(",")],
    enabled: docIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("certificates")
        .select("id, title, storage_path, file_name, document_id")
        .in("document_id", docIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("documents-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "documents" }, () =>
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "certificates" }, () =>
        queryClient.invalidateQueries({ queryKey: ["certificates"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: myOrgId } = useMyOrganization();
  const notifications = useSupportNotifications();
  const docTypes = isAdmin
    ? (["new_document", "additional_document"] as const)
    : (["document_status", "documents_requested"] as const);
  const unreadDocCount = docTypes.reduce((n, t) => n + notifications.unreadOfType(t).length, 0);
  const markAllMutate = notifications.markAllRead.mutate;
  useEffect(() => {
    if (!docs || unreadDocCount === 0) return;
    for (const t of docTypes) markAllMutate(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, unreadDocCount, isAdmin]);

  const upload = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error("Selecione pelo menos um arquivo");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Sessão expirada");

      // Cada arquivo segue sozinho: uma falha não interrompe nem reenvia os demais.
      const sentIdx: number[] = [];
      const failed: string[] = [];
      setFileStages({});
      for (const [index, f] of files.entries()) {
        const stage = (s: FileStage) => setFileStages((prev) => ({ ...prev, [index]: s }));
        setProgress(`Arquivo ${index + 1} de ${files.length}…`);
        try {
          stage({ kind: "preparando" });
          // Revalidação (nome, MIME e conteúdo real) imediatamente antes do envio.
          const checked = await validateUploadFileDeep(f);
          if (!checked.ok) throw new Error(checked.message);
          stage({ kind: "enviando" });
          const pendingPath = await stagePendingUpload(
            "documentos",
            checked.file,
            checked.storageName,
            checked.contentType,
          );
          stage({ kind: "validando" });
          const baseTitle = title.trim() || checked.displayName;
          await submitClientDocument({
            data: {
              pendingPath,
              fileName: checked.displayName,
              title: (files.length > 1 && title.trim()
                ? `${baseTitle} (${index + 1})`
                : baseTitle
              ).slice(0, 160),
              description: description.trim() || null,
              organizationId: myOrgId ?? null,
              relatedDocumentId: related?.id ?? null,
            },
          });
          stage({ kind: "concluido" });
          sentIdx.push(index);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "";
          const friendly = msg.includes("aguardando documenta")
            ? "Este processo não está mais aguardando documentação."
            : describeUploadError(e);
          stage({ kind: "falhou", message: friendly });
          failed.push(`${f.name}: ${friendly}`);
        }
      }
      return { sentIdx, failed };
    },
    onSuccess: ({ sentIdx, failed }) => {
      const sent = sentIdx.length;
      if (sent > 0) {
        toast.success(
          sent === 1
            ? "Documento enviado! Nossa equipe já foi avisada."
            : `${sent} documentos enviados! Nossa equipe já foi avisada.`,
        );
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? `Não foi possível enviar ${failed[0]}`
            : `${failed.length} arquivos não foram enviados. Veja a lista.`,
        );
        // Mantém só os que falharam, para nunca reenviar os que já foram.
        setFiles((prev) => prev.filter((_, i) => !sentIdx.includes(i)));
        setFileStages((prev) => {
          const next: Record<number, FileStage> = {};
          let j = 0;
          files.forEach((_, i) => {
            if (!sentIdx.includes(i)) {
              if (prev[i]) next[j] = prev[i];
              j += 1;
            }
          });
          return next;
        });
        return;
      }
      setTitle("");
      setDescription("");
      setFiles([]);
      setFileStages({});
      setRelated(null);
    },
    onError: (e: unknown) => {
      toast.error(describeUploadError(e));
    },
    onSettled: () => {
      setProgress(null);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  // Registra o acesso do cliente aos documentos visíveis (histórico para o admin).
  useEffect(() => {
    if (isAdmin) return;
    for (const d of docs ?? []) void logResourceView("document", d.id);
  }, [docs, isAdmin]);

  async function download(id: string, path: string, name: string) {
    if (!isAdmin) void logResourceView("document", id, "download");
    const result = await downloadFromBucket("documentos", path, name);
    if (!result.ok) toast.error(result.message);
  }

  async function downloadCert(id: string, path: string | null, name: string | null) {
    if (!path) {
      toast.error("O certificado ainda não está disponível para download.");
      return;
    }
    if (!isAdmin) void logResourceView("certificate", id, "download");
    const result = await downloadFromBucket("certificados", path, name);
    if (!result.ok) toast.error(result.message);
  }

  function startAdditional(d: RelatedDoc) {
    setRelated(d);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const pending = (docs ?? []).filter((d) => d.status === "aguardando_documentacao");
  const current = (docs ?? []).find((d) => !d.is_additional);
  const certByDoc = new Map<string, NonNullable<typeof certs>>();
  for (const c of certs ?? []) {
    if (!c.document_id) continue;
    certByDoc.set(c.document_id, [...(certByDoc.get(c.document_id) ?? []), c]);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-gold">Documentos</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Envie os documentos necessários para iniciarmos o registro. Acompanhe o andamento e receba
          seu certificado por aqui.
        </p>
      </div>

      <Card className="border-brand-hover/30 bg-brand-hover/5">
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
          <Clock className="h-4 w-4 text-brand-hover" />
          <span>
            Prazo médio de registro: <strong>{PRAZO_TEXTO}</strong> por documento.
          </span>
          {current && (
            <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <span className="text-muted-foreground">Status atual:</span>
              <StatusBadge
                status={current.status}
                label={DOCUMENT_STATUS_LABEL[current.status] ?? current.status}
              />
            </span>
          )}
        </CardContent>
      </Card>

      {!isAdmin &&
        pending.map((d) => (
          <Card key={d.id} className="border-destructive/35 bg-destructive/5">
            <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 break-words">
                <strong>Aguardando documentação</strong> em “{d.title}” — envie o arquivo faltante.
              </span>
              <Button size="sm" onClick={() => startAdditional({ id: d.id, title: d.title })}>
                Enviar arquivo faltante
              </Button>
            </CardContent>
          </Card>
        ))}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <Card className="bg-card/70" ref={formRef}>
          <CardHeader>
            <CardTitle className="text-lg">
              {related ? "Enviar arquivo faltante" : "Enviar documentos"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                upload.mutate();
              }}
            >
              {related && (
                <div className="flex items-start gap-2 rounded-lg border border-gold/40 bg-gold/10 p-3 text-xs">
                  <span className="min-w-0 flex-1 break-words">
                    Envio adicional referente a <strong>{related.title}</strong>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 underline"
                    onClick={() => setRelated(null)}
                  >
                    Cancelar
                  </button>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="title">Título (opcional)</Label>
                <Input
                  id="title"
                  value={title}
                  maxLength={160}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Se vazio, usamos o nome do arquivo"
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
                <Label htmlFor="file">Arquivos *</Label>
                <FileDropzone
                  id="file"
                  file={null}
                  disabled={upload.isPending || files.length >= 10}
                  onSelect={(f) => void handleFileChange(f)}
                />
                {files.length > 0 && (
                  <ul className="space-y-2" aria-label="Arquivos selecionados">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 p-2 text-xs"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-brand-hover" />
                        <span className="min-w-0 flex-1 truncate" title={f.name}>
                          {f.name}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-muted-foreground">
                          {formatBytes(f.size)}
                        </span>
                        {fileStages[i] && (
                          <span
                            role="status"
                            title={fileStages[i].kind === "falhou" ? (fileStages[i] as { message: string }).message : undefined}
                            className={`shrink-0 whitespace-nowrap ${
                              fileStages[i].kind === "falhou"
                                ? "text-destructive"
                                : fileStages[i].kind === "concluido"
                                  ? "text-brand-hover"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {STAGE_LABEL[fileStages[i].kind]}
                          </span>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          aria-label={`Remover ${f.name}`}
                          disabled={upload.isPending}
                          onClick={() => {
                            setFiles((prev) => prev.filter((_, j) => j !== i));
                            setFileStages({});
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <p id="file-help" className="text-xs leading-relaxed text-muted-foreground">
                  {UPLOAD_HELP_TEXT} Até 10 arquivos por envio.
                </p>
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={upload.isPending || files.length === 0}
                aria-busy={upload.isPending}
              >
                <UploadCloud className="h-4 w-4" />
                {upload.isPending
                  ? (progress ?? "Enviando...")
                  : files.length > 1
                    ? `Enviar ${files.length} documentos`
                    : "Enviar documentos"}
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
          {isError && (
            <EmptyState
              icon={AlertCircle}
              title="Não foi possível carregar seus documentos"
              description="Verifique sua conexão e recarregue a página em alguns instantes."
            />
          )}
          {(docs ?? []).map((d) => {
            const showDate = isAdmin || (myUserId !== null && d.created_by === myUserId);
            const docCerts = certByDoc.get(d.id) ?? [];
            const startDate = reliableProcessStart({
              process_started_at: d.process_started_at,
              submitted_at: d.submitted_at,
              sentByClient: !isAdmin && myUserId !== null && d.created_by === myUserId,
            });
            return (
              <Card key={d.id} id={`doc-${d.id}`} className="scroll-mt-24 bg-card/70 target:ring-2 target:ring-brand-hover/60">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words font-serif text-xl leading-snug">{d.title}</h3>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {d.file_name} · {fileExtension(d.file_name)} ·{" "}
                        <span className="whitespace-nowrap break-normal">{formatBytes(d.file_size)}</span>
                        {showDate && (
                          <span className="whitespace-nowrap">
                            {` · enviado em ${formatDateTime(d.submitted_at)}`}
                          </span>
                        )}
                      </p>
                      {d.is_additional && (
                        <span className="mt-2 inline-flex rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold-light">
                          Envio adicional
                        </span>
                      )}
                    </div>
                    <StatusBadge
                      status={d.status}
                      label={DOCUMENT_STATUS_LABEL[d.status] ?? d.status}
                    />
                  </div>
                  {d.description && (
                    <p className="mt-3 break-words text-sm text-muted-foreground">
                      {d.description}
                    </p>
                  )}
                  <ProcessEstimate status={d.status} startDate={startDate} />
                  {d.admin_notes && (
                    <p className="mt-3 break-words rounded-lg border border-brand-hover/30 bg-brand-hover/5 p-3 text-sm">
                      <span className="text-brand-hover">Zé Registra: </span>
                      {d.admin_notes}
                    </p>
                  )}
                  {docCerts.map((c) => (
                    <div
                      key={c.id}
                      className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-success/35 bg-success/10 p-3 text-sm"
                    >
                      <Award className="h-4 w-4 shrink-0 text-success" />
                      <span className="min-w-0 flex-1 break-words">
                        Seu certificado está disponível.
                      </span>
                      <Button
                        size="sm"
                        onClick={() => downloadCert(c.id, c.storage_path, c.file_name)}
                      >
                        <Download className="h-4 w-4" />
                        Baixar certificado
                      </Button>
                    </div>
                  ))}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => download(d.id, d.storage_path, d.file_name)}
                    >
                      <Download className="h-4 w-4" />
                      Baixar arquivo
                    </Button>
                    {!isAdmin && d.status === "aguardando_documentacao" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startAdditional({ id: d.id, title: d.title })}
                      >
                        <UploadCloud className="h-4 w-4" />
                        Enviar arquivo faltante
                      </Button>
                    )}
                    {isAdmin && (
                      <span className="text-xs text-muted-foreground">
                        Última atualização: {formatDateTime(d.updated_at)}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {isLoading && <ListSkeleton />}
          {!isLoading && !isError && !docs?.length && (
            <EmptyState
              icon={FileText}
              title="Nenhum documento enviado ainda"
              description="Envie os primeiros arquivos pelo formulário de envio para iniciarmos o registro."
            />
          )}
        </div>
      </div>
    </div>
  );
}
