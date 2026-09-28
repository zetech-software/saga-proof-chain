import { finalizeAdminUpload } from "@/lib/uploads.functions";
import {
  BLOCKED_DELETE_MESSAGE,
  editDocument,
  purgeDocument,
  replaceDocumentFile,
  setDocumentArchived,
} from "@/lib/document-management.functions";
import { DocumentHistory } from "@/components/DocumentHistory";
import { stagePendingUpload } from "@/lib/secure-upload";
import { useMemo, useState } from "react";
import { ProcessStartDateEditor } from "@/components/ProcessStartDateEditor";
import { ProcessEstimatePreview } from "@/components/ProcessEstimatePreview";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Award, Download, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { FileDropzone } from "@/components/FileDropzone";
import { useOwnership } from "@/hooks/useOwnership";
import { useUserActivity } from "@/hooks/useUserActivity";
import { downloadFromBucket } from "@/lib/downloads";
import { validateUploadFileDeep } from "@/lib/uploads";
import {
  DOCUMENT_STATUS_GROUPS,
  DOCUMENT_STATUS_LABEL,
  formatBytes,
  formatDateTime,
} from "@/lib/portal";

export type AdminDocument = {
  id: string;
  title: string;
  description: string | null;
  admin_notes: string | null;
  status: string;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  organization_id: string | null;
  created_by: string | null;
  submitted_at: string;
  updated_at: string;
  is_additional?: boolean;
  related_document_id?: string | null;
  process_started_at?: string | null;
  archived_at?: string | null;
};

type EditState = {
  title: string;
  description: string;
  admin_notes: string;
  status: string;
};

/**
 * Painel administrativo de documentos: busca, filtro, download seguro,
 * substituição de arquivo e exclusão. Titularidade permanece intocada.
 */
const SP_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function spDayKey(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : SP_DAY.format(d);
}

export function AdminDocumentsPanel({
  docs,
  enabled,
  adminUserId,
}: {
  docs: AdminDocument[];
  enabled: boolean;
  adminUserId: string | null;
}) {
  const queryClient = useQueryClient();
  const ownership = useOwnership(enabled);
  const users = useUserActivity(enabled);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("todos");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [certForId, setCertForId] = useState<string | null>(null);
  const [certTitle, setCertTitle] = useState("");
  const [certHash, setCertHash] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certConclude, setCertConclude] = useState(true);
  const [view, setView] = useState<"ativos" | "arquivados" | "todos">("ativos");
  const [confirmText, setConfirmText] = useState("");
  const [replaceReason, setReplaceReason] = useState("");
  const [newStatus, setNewStatus] = useState("");

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
  // Busca também pelo e-mail do cliente, além do nome exibido.
  const userSearch = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users.data ?? []) map.set(u.user_id, `${u.full_name ?? ""} ${u.email ?? ""}`);
    return map;
  }, [users.data]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: EditState }) => {
      await editDocument({
        data: {
          id: input.id,
          title: input.patch.title.trim(),
          description: input.patch.description.trim() || null,
          adminNotes: input.patch.admin_notes.trim() || null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Documento atualizado");
      refresh();
    },
    onError: () => toast.error("Não foi possível salvar as alterações do documento"),
  });

  // Status é uma ação separada da edição, para nunca mudar sem querer.
  const changeStatus = useMutation({
    mutationFn: async (input: { id: string; status: string }) => {
      const { error } = await supabase.from("documents").update({ status: input.status }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status atualizado");
      refresh();
    },
    onError: () => toast.error("Não foi possível alterar o status"),
  });

  const archive = useMutation({
    mutationFn: async (input: { id: string; archived: boolean }) => {
      await setDocumentArchived({ data: input });
      return input.archived;
    },
    onSuccess: (archived) => {
      toast.success(archived ? "Documento arquivado" : "Documento restaurado");
      setOpenId(null);
      setForm(null);
      refresh();
    },
    onError: () => toast.error("Não foi possível atualizar o documento"),
  });

  async function handleDownload(doc: AdminDocument) {
    setBusyId(doc.id);
    const result = await downloadFromBucket("documentos", doc.storage_path, doc.file_name);
    setBusyId(null);
    if (!result.ok) toast.error(result.message);
  }

  async function handleReplace(doc: AdminDocument) {
    if (!replaceFile || !adminUserId) return;
    const validation = await validateUploadFileDeep(replaceFile);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    setBusyId(doc.id);
    try {
      const pending = await stagePendingUpload(
        "documentos",
        validation.file,
        validation.storageName,
        validation.contentType,
      );
      await replaceDocumentFile({
        data: {
          id: doc.id,
          pendingPath: pending,
          fileName: validation.displayName,
          reason: replaceReason.trim() || null,
        },
      });
      toast.success("Arquivo substituído");
      setReplaceFile(null);
      setReplaceReason("");
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg.startsWith("O ") || msg.startsWith("Não") ? msg : "Não foi possível substituir o arquivo. O arquivo anterior foi mantido.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(doc: AdminDocument) {
    setBusyId(doc.id);
    try {
      const r = await purgeDocument({ data: { id: doc.id, confirm: "EXCLUIR" } });
      if (r.blocked) {
        toast.error(`${BLOCKED_DELETE_MESSAGE} (${r.reasons.join(", ")}). Você pode arquivá-lo.`);
        return;
      }
      toast.success("Documento excluído definitivamente");
      setOpenId(null);
      setForm(null);
      refresh();
    } catch {
      toast.error("Não foi possível excluir o documento.");
    } finally {
      setBusyId(null);
      setConfirmText("");
    }
  }

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return docs.filter((d) => {
      if (view === "ativos" && d.archived_at) return false;
      if (view === "arquivados" && !d.archived_at) return false;
      if (status !== "todos" && d.status !== status) return false;
      // Dia do envio no fuso de São Paulo (evita trocar de dia após 21h).
      const day = spDayKey(d.submitted_at);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      if (!q) return true;
      const owner = d.created_by ? (userSearch.get(d.created_by) ?? "") : "";
      const org = d.organization_id ? (orgName.get(d.organization_id) ?? "") : "";
      return [d.title, d.file_name, d.description ?? "", owner, org]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [docs, term, status, fromDate, toDate, userSearch, orgName, view]);

  async function handleSendCertificate(doc: AdminDocument) {
    if (!adminUserId) return;
    if (certTitle.trim().length < 2) {
      toast.error("Informe o título do certificado");
      return;
    }
    const checked = await validateUploadFileDeep(certFile);
    if (!checked.ok) {
      toast.error(checked.message);
      return;
    }
    setBusyId(doc.id);
    try {
      const pending = await stagePendingUpload(
        "certificados",
        checked.file,
        checked.storageName,
        checked.contentType,
      );
      const { path } = await finalizeAdminUpload({
        data: { bucket: "certificados", pendingPath: pending },
      });
      const { error } = await supabase.from("certificates").insert({
        title: certTitle.trim(),
        document_id: doc.id,
        storage_path: path,
        file_name: checked.displayName,
        tx_hash: certHash.trim() || null,
        network: "Ethereum (ETH) via Authora — Homologação Zé Registra",
      });
      if (error) {
        await supabase.storage.from("certificados").remove([path]);
        throw error;
      }
      if (certConclude && doc.status !== "concluido") {
        const { error: stErr } = await supabase
          .from("documents")
          .update({ status: "concluido" })
          .eq("id", doc.id);
        if (stErr) throw stErr;
      }
      toast.success("Certificado enviado ao cliente");
      setCertForId(null);
      setCertTitle("");
      setCertHash("");
      setCertFile(null);
      refresh();
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    } catch {
      toast.error("Não foi possível enviar o certificado. Tente novamente.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ProcessEstimatePreview />
      <Card className="bg-card/70">
        <CardHeader className="gap-3">
          <CardTitle className="text-lg">Documentos na esteira</CardTitle>
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar por título, arquivo, cliente ou organização"
                aria-label="Buscar documento"
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Filtrar documentos por status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {DOCUMENT_STATUS_GROUPS.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.statuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {DOCUMENT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="docs-from" className="text-xs">
                Enviados a partir de
              </Label>
              <Input
                id="docs-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="docs-to" className="text-xs">
                Enviados até
              </Label>
              <Input
                id="docs-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar documentos">
            {(["ativos", "arquivados", "todos"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={view === v ? "default" : "outline"}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === "ativos" ? "Ativos" : v === "arquivados" ? "Arquivados" : "Todos"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filtered.length === 0 ? (
            <EmptyState
              title="Nenhum documento encontrado"
              description="Ajuste a busca ou o filtro de status para ver outros documentos."
            />
          ) : (
            filtered.map((d) => {
              const shares = (ownership.data?.shares ?? []).filter(
                (s) => s.resource_type === "document" && s.resource_id === d.id,
              );
              const isOpen = openId === d.id;
              const busy = busyId === d.id;
              return (
                <div key={d.id} className="rounded-xl border border-border/60 bg-background/30 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {d.title}
                        {d.archived_at && (
                          <span className="mr-2 inline-flex rounded-full border border-border px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            Arquivado
                          </span>
                        )}
                        {d.is_additional && (
                          <span className="ml-2 inline-flex rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wider text-gold-light">
                            Envio adicional
                          </span>
                        )}
                      </p>
                      {d.related_document_id && (
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          Referente a:{" "}
                          {docs.find((x) => x.id === d.related_document_id)?.title ??
                            "processo relacionado"}
                        </p>
                      )}
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {d.file_name}
                        {d.file_size ? (
                          <span className="whitespace-nowrap break-normal">{` · ${formatBytes(d.file_size)}`}</span>
                        ) : (
                          ""
                        )}
                        {" · enviado em "}
                        {formatDateTime(d.submitted_at)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {d.created_by
                          ? `Titular: ${userName.get(d.created_by) ?? d.created_by}`
                          : "Sem titular"}
                        {" · "}
                        {d.organization_id
                          ? (orgName.get(d.organization_id) ?? "Organização removida")
                          : "Sem organização"}
                      </p>
                      {shares.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Compartilhado com:{" "}
                          {shares.map((s) => userName.get(s.user_id) ?? s.user_id).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        status={d.status}
                        label={DOCUMENT_STATUS_LABEL[d.status] ?? d.status}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(d)}
                        disabled={busy}
                        aria-busy={busy}
                        aria-label={`Baixar ${d.file_name}`}
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        Baixar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-expanded={certForId === d.id}
                        onClick={() => {
                          setCertForId(certForId === d.id ? null : d.id);
                          setCertTitle(`Certificado — ${d.title}`.slice(0, 160));
                          setCertFile(null);
                          setCertHash("");
                          setCertConclude(true);
                        }}
                      >
                        <Award className="h-4 w-4" aria-hidden />
                        Enviar certificado
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-expanded={isOpen}
                        onClick={() => {
                          if (isOpen) {
                            setOpenId(null);
                            setForm(null);
                            setReplaceFile(null);
                            return;
                          }
                          setOpenId(d.id);
                          setForm({
                            title: d.title,
                            description: d.description ?? "",
                            admin_notes: d.admin_notes ?? "",
                            status: d.status,
                          });
                          setNewStatus(d.status);
                          setReplaceFile(null);
                          setReplaceReason("");
                          setConfirmText("");
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                        {isOpen ? "Fechar" : "Gerenciar"}
                      </Button>
                    </div>
                  </div>

                  {certForId === d.id && (
                    <div className="mt-4 space-y-3 rounded-xl border border-brand-hover/30 bg-brand-hover/5 p-4">
                      <p className="text-sm font-medium">Enviar certificado para este documento</p>
                      <div className="space-y-2">
                        <Label htmlFor={`ctitle-${d.id}`}>Título</Label>
                        <Input
                          id={`ctitle-${d.id}`}
                          value={certTitle}
                          maxLength={160}
                          onChange={(e) => setCertTitle(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`chash-${d.id}`}>Hash (opcional)</Label>
                        <Input
                          id={`chash-${d.id}`}
                          value={certHash}
                          maxLength={200}
                          onChange={(e) => setCertHash(e.target.value)}
                        />
                      </div>
                      <FileDropzone
                        id={`cfile-${d.id}`}
                        describedById={`chelp-${d.id}`}
                        file={certFile}
                        onSelect={setCertFile}
                        disabled={busy}
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={certConclude}
                          onChange={(e) => setCertConclude(e.target.checked)}
                        />
                        Marcar processo como “Concluído”
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSendCertificate(d)}
                          disabled={busy || !certFile}
                          aria-busy={busy}
                        >
                          {busy ? "Enviando certificado…" : "Publicar certificado"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setCertForId(null)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                  {isOpen && form && (
                    <div className="mt-4 space-y-4">
                      <p className="text-sm font-medium">Editar</p>
                      <form
                        className="grid gap-3 sm:grid-cols-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (form.title.trim().length < 2) {
                            toast.error("Informe o título do documento.");
                            return;
                          }
                          update.mutate({ id: d.id, patch: form });
                        }}
                      >
                        <div className="space-y-2">
                          <Label htmlFor={`dtitle-${d.id}`}>Título *</Label>
                          <Input
                            id={`dtitle-${d.id}`}
                            value={form.title}
                            maxLength={160}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor={`ddesc-${d.id}`}>Descrição</Label>
                          <Textarea
                            id={`ddesc-${d.id}`}
                            value={form.description}
                            maxLength={1000}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor={`dnotes-${d.id}`}>Nota para o cliente</Label>
                          <Textarea
                            id={`dnotes-${d.id}`}
                            value={form.admin_notes}
                            maxLength={1000}
                            onChange={(e) => setForm({ ...form, admin_notes: e.target.value })}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Button
                            type="submit"
                            disabled={update.isPending}
                            aria-busy={update.isPending}
                          >
                            {update.isPending ? "Salvando…" : "Salvar alterações"}
                          </Button>
                        </div>
                      </form>

                      <div className="space-y-2 rounded-lg border border-border/60 p-4">
                        <Label htmlFor={`dstatus-${d.id}`} className="text-sm font-medium">Alterar status</Label>
                        <div className="flex flex-wrap gap-2">
                          <Select value={newStatus} onValueChange={setNewStatus}>
                            <SelectTrigger id={`dstatus-${d.id}`} className="sm:w-64">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOCUMENT_STATUS_GROUPS.map((g) => (
                                <SelectGroup key={g.label}>
                                  <SelectLabel>{g.label}</SelectLabel>
                                  {g.statuses.map((st) => (
                                    <SelectItem key={st} value={st}>
                                      {DOCUMENT_STATUS_LABEL[st]}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={changeStatus.isPending || newStatus === d.status}
                            onClick={() => changeStatus.mutate({ id: d.id, status: newStatus })}
                          >
                            {changeStatus.isPending ? "Salvando…" : "Aplicar status"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">O cliente é avisado quando o status muda.</p>
                      </div>

                      <ProcessStartDateEditor
                        documentId={d.id}
                        current={d.process_started_at ?? null}
                      />
                      <div className="space-y-3 rounded-lg border border-border/60 p-4">
                        <p className="text-sm font-medium">Substituir arquivo</p>
                        <FileDropzone
                          id={`replace-${d.id}`}
                          file={replaceFile}
                          onSelect={setReplaceFile}
                          disabled={busy}
                        />
                        <Input
                          value={replaceReason}
                          maxLength={300}
                          onChange={(e) => setReplaceReason(e.target.value)}
                          placeholder="Motivo (opcional)"
                          aria-label="Motivo da substituição (opcional)"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!replaceFile || busy || !adminUserId}
                          aria-busy={busy}
                          onClick={() => handleReplace(d)}
                        >
                          <RefreshCw className="h-4 w-4" aria-hidden />
                          {busy ? "Substituindo…" : "Substituir arquivo"}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          O documento, o dono, a organização, o status e os vínculos continuam os mesmos.
                          O arquivo anterior só é removido depois que o novo for validado.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 p-4">
                        {d.archived_at ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={archive.isPending}
                            onClick={() => archive.mutate({ id: d.id, archived: false })}
                          >
                            <ArchiveRestore className="h-4 w-4" aria-hidden />
                            {archive.isPending ? "Restaurando…" : "Restaurar"}
                          </Button>
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" variant="outline" disabled={archive.isPending}>
                                <Archive className="h-4 w-4" aria-hidden />
                                Arquivar
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Arquivar “{d.title}”?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  O documento sai da lista principal, mas nada é apagado: arquivo,
                                  vínculos e histórico continuam. Você pode restaurar depois.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => archive.mutate({ id: d.id, archived: true })}>
                                  Arquivar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Arquivar não apaga nada e pode ser desfeito.
                        </p>
                      </div>

                      <DocumentHistory documentId={d.id} />

                      <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
                        <p className="text-sm font-medium text-destructive">Zona de perigo</p>
                        <AlertDialog onOpenChange={(o) => !o && setConfirmText("")}>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              className="border-destructive/60 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                              Excluir definitivamente
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir “{d.title}” definitivamente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação apagará permanentemente o documento e o arquivo. Não será
                                possível recuperar. Digite EXCLUIR para confirmar.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <Input
                              value={confirmText}
                              onChange={(e) => setConfirmText(e.target.value)}
                              placeholder="EXCLUIR"
                              aria-label="Digite EXCLUIR para confirmar"
                              autoComplete="off"
                            />
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                disabled={confirmText !== "EXCLUIR"}
                                onClick={() => handleDelete(d)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Excluir definitivamente
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <p className="text-xs text-muted-foreground">
                          Bloqueada quando há certificado, envio adicional, compartilhamento ou
                          processo concluído. Nesses casos, use Arquivar.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </>
  );
}
