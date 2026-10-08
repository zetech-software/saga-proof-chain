import { useMemo, useState } from "react";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

type OwnedItem = { created_by: string | null };

type Props = {
  enabled: boolean;
  /** Itens já carregados no painel Admin — usados apenas para contagem por usuário. */
  docs?: OwnedItem[] | undefined;
  marcas?: OwnedItem[] | undefined;
  suporte?: OwnedItem[] | undefined;
};

type SortId = "recentes" | "nome" | "cadastro";

const SORTS: Array<{ id: SortId; label: string }> = [
  { id: "recentes", label: "Último acesso" },
  { id: "nome", label: "Nome" },
  { id: "cadastro", label: "Cadastro" },
];

function countBy(items: OwnedItem[] | undefined, userId: string) {
  return (items ?? []).filter((i) => i.created_by === userId).length;
}

export function UserAccessActivity({ enabled, docs, marcas, suporte }: Props) {
  const { data, isLoading, isError, refetch, isFetching } = useUserActivity(enabled);
  const [filter, setFilter] = useState<AccessFilterId>("todos");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("recentes");

  const rows = useMemo(() => {
    const now = new Date();
    return (data ?? []).map((u) => ({
      ...u,
      days: daysSinceAccess(u.last_sign_in_at, now),
      docCount: countBy(docs, u.user_id),
      marcaCount: countBy(marcas, u.user_id),
      supportCount: countBy(suporte, u.user_id),
    }));
  }, [data, docs, marcas, suporte]);

  const counts = useMemo(() => {
    const map = {} as Record<AccessFilterId, number>;
    for (const f of ACCESS_FILTERS) {
      map[f.id] = rows.filter((r) => matchesAccessFilter(r.days, f.id)).length;
    }
    return map;
  }, [rows]);

  const roleTotals = useMemo(
    () => ({
      admins: rows.filter((r) => (r.roles ?? []).includes("admin")).length,
      clientes: rows.filter(
        (r) => (r.roles ?? []).includes("cliente") && !(r.roles ?? []).includes("admin"),
      ).length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (!matchesAccessFilter(r.days, filter)) return false;
      if (!term) return true;
      return (
        (r.full_name ?? "").toLowerCase().includes(term) ||
        (r.email ?? "").toLowerCase().includes(term)
      );
    });
    return [...list].sort((a, b) => {
      if (sort === "nome") return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      if (sort === "cadastro") return a.created_at.localeCompare(b.created_at);
      // Último acesso: quem nunca acessou vai para o fim.
      if (a.days === null && b.days === null) return 0;
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });
  }, [rows, filter, search, sort]);

  function exportCsv() {
    const header = [
      "Nome",
      "E-mail",
      "Cargo",
      "Cadastro",
      "Último acesso",
      "Há quanto tempo",
      "Documentos",
      "Marcas",
      "Chamados",
    ];
    const lines = visible.map((u) =>
      [
        u.full_name ?? "",
        u.email ?? "",
        roleLabel(u.roles),
        formatSpDate(u.created_at),
        u.days === null ? "Nunca acessou" : formatSpDateTime(u.last_sign_in_at),
        describeDaysSince(u.days),
        String(u.docCount),
        String(u.marcaCount),
        String(u.supportCount),
      ]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(";"),
    );
    const csv = `\uFEFF${[header.join(";"), ...lines].join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "usuarios-torre-de-registros.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <CardTitle>Usuários e atividade de acesso</CardTitle>
        <p className="text-xs text-muted-foreground">
          {rows.length} contas · {roleTotals.admins} administrador(es) · {roleTotals.clientes}{" "}
          cliente(s). Horário de Brasília.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar usuário por nome ou e-mail"
          />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Ordenação">
            {SORTS.map((s) => (
              <Button
                key={s.id}
                type="button"
                size="sm"
                variant={sort === s.id ? "default" : "outline"}
                aria-pressed={sort === s.id}
                onClick={() => setSort(s.id)}
              >
                {s.label}
              </Button>
            ))}
          </div>
        </div>

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
            title="Nenhum usuário encontrado"
            description="Ajuste a busca ou o filtro para ver outras contas."
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
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Envios</dt>
                      <dd>
                        {u.docCount} doc. · {u.marcaCount} marcas · {u.supportCount} chamados
                      </dd>
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
                    <th className="py-2 pr-4 font-medium">Há quanto tempo</th>
                    <th className="py-2 font-medium">Envios</th>
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
                      <td className="py-2.5 pr-4">{describeDaysSince(u.days)}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {u.docCount} / {u.marcaCount} / {u.supportCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Envios: documentos / marcas / chamados de suporte.
              </p>
            </div>
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={visible.length === 0}>
            Exportar CSV
          </Button>
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
