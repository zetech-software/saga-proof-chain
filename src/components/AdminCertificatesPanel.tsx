import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, ExternalLink, Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";

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
import { EmptyState } from "@/components/EmptyState";
import { FileDropzone } from "@/components/FileDropzone";
import { useOwnership, useOwnershipMutations } from "@/hooks/useOwnership";
import { useUserActivity } from "@/hooks/useUserActivity";
import { downloadFromBucket } from "@/lib/downloads";
import { validateUploadFileDeep } from "@/lib/uploads";
import { formatDateTime } from "@/lib/portal";

export type AdminCertificate = {
  id: string;
  title: string;
  network: string | null;
  tx_hash: string | null;
  verification_url: string | null;
  notes: string | null;
  storage_path: string | null;
  file_name: string | null;
  document_id: string | null;
  trademark_id: string | null;
  issued_at: string;
  updated_at: string;
};

type LinkOption = { id: string; label: string };

type EditState = {
  title: string;
  network: string;
  tx_hash: string;
  verification_url: string;
  notes: string;
  document_id: string;
  trademark_id: string;
};

const NONE = "__sem_vinculo__";

/**
 * Painel administrativo de certificados: busca, edição de metadados e vínculo,
 * upload/substituição do arquivo, download seguro, exclusão e compartilhamento.
 * O acesso do cliente continua herdado do documento/marca vinculado; o
 * compartilhamento individual é apenas uma liberação pontual extra.
 */
export function AdminCertificatesPanel({
  certs,
  docs,
  marcas,
  enabled,
  adminUserId,
}: {
  certs: AdminCertificate[];
  docs: LinkOption[];
  marcas: LinkOption[];
  enabled: boolean;
  adminUserId: string | null;
}) {
  const queryClient = useQueryClient();
  const ownership = useOwnership(enabled);
  const users = useUserActivity(enabled);
  const { addShare, removeShare } = useOwnershipMutations();
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<EditState | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<Record<string, string>>({});

  const docLabel = useMemo(() => new Map(docs.map((d) => [d.id, d.label])), [docs]);
  const marcaLabel = useMemo(() => new Map(marcas.map((m) => [m.id, m.label])), [marcas]);
  const userName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users.data ?? []) map.set(u.user_id, u.full_name || u.email || u.user_id);
    return map;
  }, [users.data]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
    queryClient.invalidateQueries({ queryKey: ["certificates"] });
    queryClient.invalidateQueries({ queryKey: ["ownership-resources"] });
  }

  const update = useMutation({
    mutationFn: async (input: { id: string; patch: EditState }) => {
      const { error } = await supabase
        .from("certificates")
        .update({
          title: input.patch.title.trim(),
          network: input.patch.network.trim() || null,
          tx_hash: input.patch.tx_hash.trim() || null,
          verification_url: input.patch.verification_url.trim() || null,
          notes: input.patch.notes.trim() || null,
          document_id: input.patch.document_id || null,
          trademark_id: input.patch.trademark_id || null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Certificado atualizado");
      refresh();
      setOpenId(null);
      setForm(null);
      setFile(null);
    },
    onError: () => toast.error("Não foi possível salvar as alterações do certificado"),
  });

  async function handleDownload(c: AdminCertificate) {
    if (!c.storage_path) return;
    setBusyId(c.id);
    const result = await downloadFromBucket(
      "certificados",
      c.storage_path,
      c.file_name ?? "certificado.pdf",
    );
    setBusyId(null);
    if (!result.ok) toast.error(result.message);
  }

  async function handleUpload(c: AdminCertificate) {
    if (!file || !adminUserId) return;
    const validation = await validateUploadFileDeep(file);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    setBusyId(c.id);
    try {
      const path = `${adminUserId}/${validation.storageName}`;
      const uploaded = await supabase.storage
        .from("certificados")
        .upload(path, validation.file, { contentType: validation.contentType, upsert: false });
      if (uploaded.error) throw uploaded.error;

      const { error } = await supabase
        .from("certificates")
        .update({ storage_path: path, file_name: validation.displayName })
        .eq("id", c.id);
      if (error) {
        await supabase.storage.from("certificados").remove([path]);
        throw error;
      }
      if (c.storage_path) await supabase.storage.from("certificados").remove([c.storage_path]);
      toast.success(c.storage_path ? "Arquivo substituído" : "Arquivo anexado");
      setFile(null);
      refresh();
    } catch {
      toast.error("Não foi possível enviar o arquivo do certificado.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(c: AdminCertificate) {
    setBusyId(c.id);
    try {
      const { error } = await supabase.from("certificates").delete().eq("id", c.id);
      if (error) throw error;
      if (c.storage_path) await supabase.storage.from("certificados").remove([c.storage_path]);
      toast.success("Certificado excluído");
      if (openId === c.id) {
        setOpenId(null);
        setForm(null);
      }
      refresh();
    } catch {
      toast.error("Não foi possível excluir o certificado.");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return certs;
    return certs.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.tx_hash ?? "").toLowerCase().includes(q) ||
        (c.file_name ?? "").toLowerCase().includes(q),
    );
  }, [certs, term]);

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-3">
        <CardTitle className="text-lg">Certificados emitidos</CardTitle>
        <p className="text-sm text-muted-foreground">
          A visibilidade de cada certificado segue a permissão do documento ou da marca vinculada.
          Use o compartilhamento individual apenas para liberações pontuais.
        </p>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar por título, hash ou arquivo"
            aria-label="Buscar certificado"
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {filtered.length === 0 ? (
          <EmptyState
            title="Nenhum certificado encontrado"
            description="Publique um certificado pelo formulário acima ou ajuste a busca."
          />
        ) : (
          filtered.map((c) => {
            const isOpen = openId === c.id;
            const busy = busyId === c.id;
            const key = `certificate:${c.id}`;
            const shares = (ownership.data?.shares ?? []).filter(
              (s) => s.resource_type === "certificate" && s.resource_id === c.id,
            );
            const vinculo = c.document_id
              ? `Documento: ${docLabel.get(c.document_id) ?? "removido"}`
              : c.trademark_id
                ? `Marca: ${marcaLabel.get(c.trademark_id) ?? "removida"}`
                : "Sem vínculo — visível apenas para o admin e para quem receber compartilhamento";

            return (
              <div key={c.id} className="rounded-xl border border-border/60 bg-background/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{c.title}</p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {c.file_name ?? "Sem arquivo anexado"}
                      {c.network ? ` · ${c.network}` : ""}
                      {` · emitido em ${formatDateTime(c.issued_at)}`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{vinculo}</p>
                    {shares.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Compartilhado com:{" "}
                        {shares.map((s) => userName.get(s.user_id) ?? s.user_id).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.storage_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(c)}
                        disabled={busy}
                        aria-busy={busy}
                        aria-label={`Baixar ${c.title}`}
                      >
                        <Download className="h-4 w-4" aria-hidden />
                        Baixar
                      </Button>
                    )}
                    {c.verification_url && (
                      <Button variant="ghost" size="sm" asChild>
                        <a href={c.verification_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" aria-hidden />
                          Verificar
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-expanded={isOpen}
                      onClick={() => {
                        if (isOpen) {
                          setOpenId(null);
                          setForm(null);
                          setFile(null);
                          return;
                        }
                        setOpenId(c.id);
                        setForm({
                          title: c.title,
                          network: c.network ?? "",
                          tx_hash: c.tx_hash ?? "",
                          verification_url: c.verification_url ?? "",
                          notes: c.notes ?? "",
                          document_id: c.document_id ?? "",
                          trademark_id: c.trademark_id ?? "",
                        });
                        setFile(null);
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
                          aria-label={`Excluir ${c.title}`}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir “{c.title}”?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O certificado e o arquivo serão removidos definitivamente e deixarão de
                            aparecer para o cliente. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(c)}>
                            Excluir certificado
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
                          toast.error("Informe o título do certificado.");
                          return;
                        }
                        update.mutate({ id: c.id, patch: form });
                      }}
                    >
                      <div className="space-y-2">
                        <Label htmlFor={`ctitle-${c.id}`}>Título *</Label>
                        <Input
                          id={`ctitle-${c.id}`}
                          value={form.title}
                          maxLength={160}
                          onChange={(e) => setForm({ ...form, title: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`cnet-${c.id}`}>Rede</Label>
                        <Input
                          id={`cnet-${c.id}`}
                          value={form.network}
                          maxLength={60}
                          onChange={(e) => setForm({ ...form, network: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`chash-${c.id}`}>Hash da transação</Label>
                        <Input
                          id={`chash-${c.id}`}
                          value={form.tx_hash}
                          maxLength={200}
                          onChange={(e) => setForm({ ...form, tx_hash: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`curl-${c.id}`}>URL de verificação</Label>
                        <Input
                          id={`curl-${c.id}`}
                          value={form.verification_url}
                          maxLength={500}
                          onChange={(e) => setForm({ ...form, verification_url: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`cdocsel-${c.id}`}>Documento vinculado</Label>
                        <Select
                          value={form.document_id || NONE}
                          onValueChange={(v) =>
                            setForm({ ...form, document_id: v === NONE ? "" : v })
                          }
                        >
                          <SelectTrigger id={`cdocsel-${c.id}`}>
                            <SelectValue placeholder="Selecione (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sem documento</SelectItem>
                            {docs.map((d) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`cmarcasel-${c.id}`}>Marca vinculada</Label>
                        <Select
                          value={form.trademark_id || NONE}
                          onValueChange={(v) =>
                            setForm({ ...form, trademark_id: v === NONE ? "" : v })
                          }
                        >
                          <SelectTrigger id={`cmarcasel-${c.id}`}>
                            <SelectValue placeholder="Selecione (opcional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sem marca</SelectItem>
                            {marcas.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor={`cnotes-${c.id}`}>Observações</Label>
                        <Textarea
                          id={`cnotes-${c.id}`}
                          value={form.notes}
                          maxLength={1000}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                      <p className="text-sm font-medium">
                        {c.storage_path ? "Substituir arquivo" : "Anexar arquivo"}
                      </p>
                      <FileDropzone id={`certfile-${c.id}`} file={file} onSelect={setFile} />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!file || busy || !adminUserId}
                        aria-busy={busy}
                        onClick={() => handleUpload(c)}
                      >
                        <RefreshCw className="h-4 w-4" aria-hidden />
                        {busy ? "Enviando..." : c.storage_path ? "Substituir arquivo" : "Anexar arquivo"}
                      </Button>
                      {c.storage_path && (
                        <p className="text-xs text-muted-foreground">
                          O arquivo anterior é removido do armazenamento após a substituição.
                        </p>
                      )}
                    </div>

                    <div className="space-y-3 rounded-lg border border-border/60 p-4">
                      <p className="text-sm font-medium">Compartilhamento individual</p>
                      <div className="flex flex-wrap gap-2">
                        {shares.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Nenhum compartilhamento extra — vale a permissão do item vinculado.
                          </span>
                        ) : (
                          shares.map((s) => (
                            <span
                              key={s.id}
                              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs"
                            >
                              {userName.get(s.user_id) ?? s.user_id}
                              <button
                                type="button"
                                onClick={() => removeShare.mutate(s.id)}
                                aria-label={`Remover acesso de ${userName.get(s.user_id) ?? "usuário"}`}
                                className="rounded-full p-0.5 hover:bg-muted"
                              >
                                <X className="h-3 w-3" aria-hidden />
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Select
                          value={pendingUser[key] ?? ""}
                          onValueChange={(v) => setPendingUser((p) => ({ ...p, [key]: v }))}
                        >
                          <SelectTrigger
                            className="sm:w-64"
                            aria-label="Compartilhar certificado com usuário"
                          >
                            <SelectValue placeholder="Compartilhar com…" />
                          </SelectTrigger>
                          <SelectContent>
                            {(users.data ?? [])
                              .filter((u) => !shares.some((s) => s.user_id === u.user_id))
                              .map((u) => (
                                <SelectItem key={u.user_id} value={u.user_id}>
                                  {u.full_name || u.email}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={!pendingUser[key] || addShare.isPending}
                          onClick={() => {
                            const userId = pendingUser[key];
                            if (!userId) return;
                            addShare.mutate(
                              { resourceType: "certificate", resourceId: c.id, userId },
                              { onSuccess: () => setPendingUser((p) => ({ ...p, [key]: "" })) },
                            );
                          }}
                        >
                          Compartilhar
                        </Button>
                      </div>
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
