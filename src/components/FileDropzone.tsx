import { useRef, useState, type DragEvent } from "react";
import { FileText, UploadCloud, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/portal";
import { ACCEPT_ATTRIBUTE, ALLOWED_FORMATS_LABEL, MAX_UPLOAD_LABEL } from "@/lib/uploads";

/**
 * Componente puramente visual para seleção de arquivo.
 * Toda validação e o fluxo de upload continuam a cargo do chamador (onSelect).
 */
export function FileDropzone({
  id = "file",
  file,
  onSelect,
  disabled = false,
  describedById = "file-help",
}: {
  id?: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
  describedById?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function open() {
    if (!disabled) inputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = event.dataTransfer.files?.[0] ?? null;
    if (dropped) onSelect(dropped);
  }

  const extension = file?.name.includes(".")
    ? (file.name.split(".").pop() ?? "").toUpperCase()
    : "";

  return (
    <div className="space-y-3">
      <input
        id={id}
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ACCEPT_ATTRIBUTE}
        aria-describedby={describedById}
        disabled={disabled}
        onChange={(e) => {
          onSelect(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      {!file && (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-controls={id}
          aria-disabled={disabled}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              open();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            dragging
              ? "border-brand-hover/70 bg-brand-hover/10"
              : "border-border/70 bg-background/40 hover:border-brand-hover/50 hover:bg-brand-hover/5",
            disabled && "pointer-events-none opacity-60",
          )}
        >
          <span className="rounded-full bg-brand-hover/10 p-2.5">
            <UploadCloud className="h-5 w-5 text-brand-hover" />
          </span>
          <span className="text-sm font-medium text-foreground">Selecionar arquivo</span>
          <span className="text-xs text-muted-foreground">ou arraste e solte aqui</span>
          <span className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {ALLOWED_FORMATS_LABEL} · até {MAX_UPLOAD_LABEL}
          </span>
        </div>
      )}

      {file && (
        <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/50 p-3">
          <span className="mt-0.5 shrink-0 rounded-lg bg-brand-hover/10 p-2">
            <FileText className="h-4 w-4 text-brand-hover" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground" title={file.name}>
              {file.name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {extension ? `${extension} · ` : ""}
              {formatBytes(file.size)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={open} disabled={disabled}>
                Trocar arquivo
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Remover arquivo selecionado"
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
