import { statusTone } from "@/lib/portal";

const toneClass: Record<string, string> = {
  gold: "border-primary/40 bg-primary/10 text-primary",
  violet: "border-accent/50 bg-accent/15 text-accent-foreground",
  green: "border-success/40 bg-success/10 text-success",
  red: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted/60 text-muted-foreground",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${toneClass[statusTone(status)]}`}
    >
      {label}
    </span>
  );
}
