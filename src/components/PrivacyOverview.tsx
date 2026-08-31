import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/ListSkeleton";
import { usePrivacyOverview, type PrivacyPolicyRow } from "@/hooks/usePrivacyOverview";

const TABLE_LABEL: Record<string, string> = {
  certificates: "Certificados",
  documents: "Documentos",
  profiles: "Perfis dos usuários",
  support_notifications: "Notificações de suporte",
  support_requests: "Solicitações de suporte",
  trademarks: "Marcas",
  user_roles: "Cargos dos usuários",
};

const COMMAND_LABEL: Record<string, string> = {
  SELECT: "Ver",
  INSERT: "Criar",
  UPDATE: "Editar",
  DELETE: "Excluir",
  ALL: "Tudo",
};

/** Traduz a condição técnica da regra para linguagem simples. */
function describeRule(row: PrivacyPolicyRow) {
  const expr = (row.using_expression || row.check_expression || "").trim();
  if (!expr || expr === "true") return "Qualquer usuário autenticado";
  const hasAdmin = expr.includes("has_role");
  const hasOwner = expr.includes("auth.uid()") && !expr.startsWith("has_role");
  if (hasAdmin && hasOwner) return "Somente o próprio usuário ou administradores";
  if (hasAdmin) return "Somente administradores";
  if (expr === "false") return "Ninguém (acesso direto bloqueado)";
  if (hasOwner) return "Somente o próprio usuário";
  return expr;
}

/** Tabelas em que a leitura ampla é decisão de produto (equipe única da Saga). */
const SHARED_BY_DESIGN = new Set(["documents", "trademarks", "certificates"]);

export function PrivacyOverview({ enabled }: { enabled: boolean }) {
  const { data, isLoading, isError, refetch, isFetching } = usePrivacyOverview(enabled);
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, PrivacyPolicyRow[]>();
    for (const row of data ?? []) {
      if (!row.policy_name) continue;
      const list = map.get(row.table_name) ?? [];
      list.push(row);
      map.set(row.table_name, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  const alerts = useMemo(
    () =>
      (data ?? []).filter(
        (r) => r.policy_name && r.is_broad && !SHARED_BY_DESIGN.has(r.table_name),
      ),
    [data],
  );

  const noRls = useMemo(
    () => [...new Set((data ?? []).filter((r) => !r.rls_enabled).map((r) => r.table_name))],
    [data],
  );

  if (isLoading) return <ListSkeleton items={2} />;

  if (isError) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Não foi possível carregar o resumo de privacidade"
        description="Tente novamente em instantes."
        action={
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        }
      />
    );
  }

  const visible = onlyAlerts
    ? grouped.filter(([table]) => alerts.some((a) => a.table_name === table))
    : grouped;

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-1">
        <CardTitle>Resumo de privacidade</CardTitle>
        <p className="text-xs text-muted-foreground">
          Quem pode ver e alterar cada tipo de informação. Somente leitura.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={onlyAlerts ? "outline" : "default"}
            aria-pressed={!onlyAlerts}
            onClick={() => setOnlyAlerts(false)}
          >
            Todas as áreas ({grouped.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={onlyAlerts ? "default" : "outline"}
            aria-pressed={onlyAlerts}
            onClick={() => setOnlyAlerts(true)}
          >
            Pontos de atenção ({alerts.length})
          </Button>
        </div>

        {noRls.length > 0 && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            Sem proteção de acesso: {noRls.join(", ")}
          </p>
        )}

        {visible.length === 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="Nenhum ponto de atenção"
            description="Todas as áreas seguem as regras de privacidade definidas."
          />
        ) : (
          <ul className="space-y-3">
            {visible.map(([table, rows]) => (
              <li
                key={table}
                className="rounded-lg border border-border/70 bg-background-secondary/40 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{TABLE_LABEL[table] ?? table}</p>
                  {SHARED_BY_DESIGN.has(table) && (
                    <span className="rounded-full border border-border/60 px-2.5 py-0.5 text-[11px] text-muted-foreground">
                      Compartilhado entre a equipe Saga (definido)
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1 text-xs">
                  {rows.map((r) => (
                    <li
                      key={`${table}-${r.policy_name}`}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span className="text-muted-foreground">
                        {COMMAND_LABEL[r.command ?? "ALL"] ?? r.command}
                      </span>
                      <span
                        className={
                          r.is_broad && !SHARED_BY_DESIGN.has(table)
                            ? "text-destructive"
                            : "text-foreground"
                        }
                      >
                        {describeRule(r)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
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
