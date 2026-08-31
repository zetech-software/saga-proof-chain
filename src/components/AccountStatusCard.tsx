import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListSkeleton } from "@/components/ListSkeleton";
import { useAccountStatus } from "@/hooks/useAccountStatus";
import { describeDaysSince, daysSinceAccess, formatSpDate, formatSpDateTime, roleLabel } from "@/lib/user-activity";

export function AccountStatusCard() {
  const { data, isLoading, isError } = useAccountStatus();

  if (isLoading) return <ListSkeleton items={1} />;
  if (isError || !data) return null;

  const days = daysSinceAccess(data.last_sign_in_at);

  const items: Array<{ label: string; value: React.ReactNode }> = [
    { label: "Nome", value: data.full_name ?? "—" },
    { label: "E-mail", value: <span className="break-all">{data.email ?? "—"}</span> },
    { label: "Perfil", value: roleLabel(data.roles) },
    { label: "Cadastro", value: formatSpDate(data.created_at) },
    {
      label: "Último acesso",
      value: data.last_sign_in_at ? formatSpDateTime(data.last_sign_in_at) : "Primeiro acesso",
    },
    { label: "Há quanto tempo", value: describeDaysSince(days) },
    {
      label: "E-mail confirmado",
      value: data.email_confirmed_at ? (
        <span className="text-gold-light">Sim</span>
      ) : (
        <span className="text-destructive">Pendente</span>
      ),
    },
  ];

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-gold" aria-hidden="true" /> Status da conta
        </CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="space-y-2 text-sm">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2 last:border-0 last:pb-0"
            >
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="text-right">{item.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Horários no fuso de Brasília. Estes dados são visíveis apenas para você.
        </p>
      </CardContent>
    </Card>
  );
}
