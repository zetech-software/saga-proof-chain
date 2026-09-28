import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Archive, ArchiveRestore, Pencil, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { FileDropzone } from "@/components/FileDropzone";
import { stagePendingUpload } from "@/lib/secure-upload";
import { describeUploadError, validateUploadFileDeep } from "@/lib/uploads";
import {
  editDocument,
  replaceDocumentFile,
  setDocumentArchived,
} from "@/lib/document-management.functions";

type Doc = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  archived_at?: string | null;
};

/**
 * Ações do cliente no próprio documento. O servidor confere tudo de novo:
 * editar e substituir só enquanto o processo permite; arquivar só antes de
 * entrar em andamento; exclusão definitiva é exclusiva do admin.
 */
export function ClientDocumentActions({ doc, hasCertificate }: { doc: Doc; hasCertificate: boolean }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"edit" | "replace" | null>(null);
  const [title, setTitle] = useState(doc.title);
  const [description, setDescription] = useState(doc.description ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const editable = !doc.archived_at && ["recebido", "aguardando_documentacao"].includes(doc.status);
  const canReplace = editable && !hasCertificate;
  const canArchive = !doc.archived_at && doc.status === "recebido" && !hasCertificate;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  };

  async function run(label: string, fn: () => Promise<unknown>, ok: string) {
    if (busy) return;
    setBusy(label);
    try {
      await fn();
      toast.success(ok);
      setMode(null);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast.error(msg && msg.length < 140 && !/unauthor|jwt|fetch/i.test(msg) ? msg : "Não foi possível concluir a ação.");
    } finally {
      setBusy(null);
    }
  }

  async function replace() {
    const checked = await validateUploadFileDeep(file);
    if (!checked.ok) return toast.error(checked.message);
    await run(
      "replace",
      async () => {
        try {
          const pending = await stagePendingUpload("documentos", checked.file, checked.storageName, checked.contentType);
          await replaceDocumentFile({ data: { id: doc.id, pendingPath: pending, fileName: checked.displayName } });
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("O ")) throw e;
          throw new Error(describeUploadError(e) + " O arquivo anterior foi mantido.");
        }
      },
      "Arquivo substituído.",
    );
    setFile(null);
  }

  if (doc.archived_at) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={!!busy}
        onClick={() => run("restore", () => setDocumentArchived({ data: { id: doc.id, archived: false } }), "Documento restaurado.")}
      >
        <ArchiveRestore className="h-4 w-4" />
        {busy === "restore" ? "Restaurando…" : "Restaurar"}
      </Button>
    );
  }
  if (!editable && !canArchive) return null;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap gap-2">
        {editable && (
          <Button variant="outline" size="sm" aria-expanded={mode === "edit"} onClick={() => setMode(mode === "edit" ? null : "edit")}>
            <Pencil className="h-4 w-4" /> Editar
          </Button>
        )}
        {canReplace && (
          <Button variant="outline" size="sm" aria-expanded={mode === "replace"} onClick={() => setMode(mode === "replace" ? null : "replace")}>
            <RefreshCw className="h-4 w-4" /> Substituir arquivo
          </Button>
        )}
        {canArchive && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!!busy}>
                <Archive className="h-4 w-4" /> Arquivar
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Arquivar “{doc.title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  O documento sai da sua lista principal, mas nada é apagado. Você pode restaurá-lo em “Arquivados”.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => run("archive", () => setDocumentArchived({ data: { id: doc.id, archived: true } }), "Documento arquivado.")}
                >
                  Arquivar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {mode === "edit" && (
        <form
          className="space-y-3 rounded-lg border border-border/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length < 2) return toast.error("Informe o título.");
            void run(
              "edit",
              () => editDocument({ data: { id: doc.id, title: title.trim(), description: description.trim() || null } }),
              "Documento atualizado.",
            );
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`ct-${doc.id}`}>Título</Label>
            <Input id={`ct-${doc.id}`} value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cd-${doc.id}`}>Descrição</Label>
            <Textarea id={`cd-${doc.id}`} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Button type="submit" size="sm" disabled={!!busy} aria-busy={busy === "edit"}>
            {busy === "edit" ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      )}

      {mode === "replace" && (
        <div className="space-y-3 rounded-lg border border-border/60 p-3">
          <FileDropzone id={`cr-${doc.id}`} file={file} onSelect={setFile} disabled={!!busy} />
          <Button size="sm" disabled={!file || !!busy} aria-busy={busy === "replace"} onClick={replace}>
            {busy === "replace" ? "Enviando e validando…" : "Substituir arquivo"}
          </Button>
          <p className="text-xs text-muted-foreground">O arquivo atual só é trocado depois que o novo for validado.</p>
        </div>
      )}
    </div>
  );
}
