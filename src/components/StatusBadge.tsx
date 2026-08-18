import { statusTone } from "@/lib/portal";

const toneClass: Record<string, string> = {
  gold: "border-primary/35 bg-primary/10 text-primary",
  violet: "border-accent/40 bg-accent/15 text-accent-foreground",
  green: "border-success/35 bg-success/10 text-success",
  red: "border-destructive/35 bg-destructive/10 text-destructive",
  muted: "border-border/70 bg-muted/50 text-muted-foreground",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] leading-none ${toneClass[statusTone(status)]}`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
