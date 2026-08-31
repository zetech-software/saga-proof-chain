import { useMemo, useState } from "react";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/ListSkeleton";
import { useUserActivity } from "@/hooks/useUserActivity";
import {
  ACCESS_FILTERS,
  daysSinceAccess,
  describeDaysSince,
  formatSpDate,
  formatSpDateTime,
  matchesAccessFilter,
  roleLabel,
  type AccessFilterId,
} from "@/lib/user-activity";

export function UserAccessActivity({ enabled }: { enabled: boolean }) {
  const { data, isLoading, isError, refetch, isFetching } = useUserActivity(enabled);
  const [filter, setFilter] = useState<AccessFilterId>("todos");

  const rows = useMemo(() => {
    const now = new Date();
    return (data ?? []).map((u) => {
      const days = daysSinceAccess(u.last_sign_in_at, now);
      return { ...u, days };
    });
  }, [data]);

  const counts = useMemo(() => {
    const map = {} as Record<AccessFilterId, number>;
    for (const f of ACCESS_FILTERS) {
      map[f.id] = rows.filter((r) => matchesAccessFilter(r.days, f.id)).length;
    }
    return map;
  }, [rows]);

  const visible = rows.filter((r) => matchesAccessFilter(r.days, filter));

  if (isLoading) return <ListSkeleton items={2} />;

  if (isError) {
    return (
      <EmptyState
        icon={Users}
        title="Não foi possível carregar a atividade de acesso"
        description="Tente novamente em instantes."
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-1">
        <CardTitle>Atividade de acesso dos usuários</CardTitle>
        <p className="text-xs text-muted-foreground">
          Dados reais de login das contas cadastradas (horário de Brasília).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros de acesso">
          {ACCESS_FILTERS.map((f) => (
            <Button
              key={f.id}
              type="button"
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              <span className="ml-1 opacity-70">({counts[f.id] ?? 0})</span>
            </Button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nenhum usuário neste filtro"
            description="Ajuste o filtro para ver outras contas."
          />
        ) : (
          <>
            {/* Mobile */}
            <ul className="space-y-3 md:hidden">
              {visible.map((u) => (
                <li
                  key={u.user_id}
                  className="rounded-lg border border-border/70 bg-background-secondary/40 p-4"
                >
                  <p className="text-sm font-medium text-foreground">{u.full_name ?? "—"}</p>
                  <p className="break-all text-xs text-muted-foreground">{u.email ?? "—"}</p>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Cargo</dt>
                      <dd>{roleLabel(u.roles)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Cadastro</dt>
                      <dd>{formatSpDate(u.created_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Último acesso</dt>
                      <dd className={u.days === null ? "text-gold-light" : undefined}>
                        {u.days === null ? "Nunca acessou" : formatSpDateTime(u.last_sign_in_at)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Há quanto tempo</dt>
                      <dd>{describeDaysSince(u.days)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            {/* Desktop */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
                  <tr className="border-b border-border/70">
                    <th className="py-2 pr-4 font-medium">Nome</th>
                    <th className="py-2 pr-4 font-medium">E-mail</th>
                    <th className="py-2 pr-4 font-medium">Cargo</th>
                    <th className="py-2 pr-4 font-medium">Cadastro</th>
                    <th className="py-2 pr-4 font-medium">Último acesso</th>
                    <th className="py-2 font-medium">Há quanto tempo</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((u) => (
                    <tr key={u.user_id} className="border-b border-border/40 last:border-0">
                      <td className="py-2.5 pr-4">{u.full_name ?? "—"}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{u.email ?? "—"}</td>
                      <td className="py-2.5 pr-4">{roleLabel(u.roles)}</td>
                      <td className="py-2.5 pr-4">{formatSpDate(u.created_at)}</td>
                      <td className="py-2.5 pr-4">
                        {u.days === null ? (
                          <span className="text-gold-light">Nunca acessou</span>
                        ) : (
                          formatSpDateTime(u.last_sign_in_at)
                        )}
                      </td>
                      <td className="py-2.5">{describeDaysSince(u.days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-busy={isFetching}
          >
            {isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
