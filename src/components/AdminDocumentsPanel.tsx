import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";

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
  DOCUMENT_STATUSES,
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

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    queryClient.invalidateQueries({ queryKey: ["documents"] });
  }

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: EditState }) => {
      const { error } = await supabase
        .from("documents")
        .update({
          title: input.patch.title.trim(),
          description: input.patch.description.trim() || null,
          admin_notes: input.patch.admin_notes.trim() || null,
          status: input.patch.status,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Documento atualizado");
      refresh();
      setOpenId(null);
      setForm(null);
      setReplaceFile(null);
    },
    onError: () => toast.error("Não foi possível salvar as alterações do documento"),
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
      const path = `${adminUserId}/${validation.storageName}`;
      const uploaded = await supabase.storage
        .from("documentos")
        .upload(path, validation.file, { contentType: validation.contentType, upsert: false });
      if (uploaded.error) throw uploaded.error;

      const { error } = await supabase
        .from("documents")
        .update({
          storage_path: path,
          file_name: validation.displayName,
          file_size: validation.file.size,
          mime_type: validation.contentType,
        })
        .eq("id", doc.id);
      if (error) {
        await supabase.storage.from("documentos").remove([path]);
        throw error;
      }
      await supabase.storage.from("documentos").remove([doc.storage_path]);
      toast.success("Arquivo substituído");
      setReplaceFile(null);
      refresh();
    } catch {
      toast.error("Não foi possível substituir o arquivo.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(doc: AdminDocument) {
    setBusyId(doc.id);
    try {
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
      await supabase.storage.from("documentos").remove([doc.storage_path]);
      toast.success("Documento excluído");
      if (openId === doc.id) {
        setOpenId(null);
        setForm(null);
      }
      refresh();
    } catch {
      toast.error("Não foi possível excluir o documento.");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    return docs.filter((d) => {
      if (status !== "todos" && d.status !== status) return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.file_name.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [docs, term, status]);

  return (
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
              placeholder="Buscar por título, arquivo ou descrição"
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
              {DOCUMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {DOCUMENT_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                    <p className="break-words font-medium">{d.title}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {d.file_name}
                      {d.file_size ? ` · ${formatBytes(d.file_size)}` : ""}
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
                        setReplaceFile(null);
                      }}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                      {isOpen ? "Fechar" : "Gerenciar"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          aria-label={`Excluir ${d.title}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir “{d.title}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O registro e o arquivo serão removidos definitivamente e o cliente
                            deixará de visualizá-los. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(d)}>
                            Excluir documento
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                {isOpen && form && (
                  <div className="mt-4 space-y-4">
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
                      <div className="space-y-2">
                        <Label htmlFor={`dstatus-${d.id}`}>Status</Label>
                        <Select
                          value={form.status}
                          onValueChange={(v) => setForm({ ...form, status: v })}
                        >
                          <SelectTrigger id={`dstatus-${d.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DOCUMENT_STATUSES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {DOCUMENT_STATUS_LABEL[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                          {update.isPending ? "Salvando..." : "Salvar alterações"}
                        </Button>
                      </div>
                    </form>

                    <div className="space-y-3 rounded-lg border border-border/60 p-4">
                      <p className="text-sm font-medium">Substituir arquivo</p>
                      <FileDropzone
                        id={`replace-${d.id}`}
                        file={replaceFile}
                        onSelect={setReplaceFile}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!replaceFile || busy || !adminUserId}
                        aria-busy={busy}
                        onClick={() => handleReplace(d)}
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        {busy ? "Substituindo..." : "Substituir arquivo"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        O arquivo anterior é removido do armazenamento após a substituição.
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
  );
}
