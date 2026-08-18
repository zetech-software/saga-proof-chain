import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed border-border/70 bg-card/50">
      <CardContent className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        {Icon && (
          <span className="rounded-full bg-muted/60 p-2.5">
            <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </span>
        )}
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="max-w-md text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}
