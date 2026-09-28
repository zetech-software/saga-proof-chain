import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/ListSkeleton";
import type { AdminAiUsageRow } from "@/lib/ai-assistant.functions";

/** Média observada por pergunta com o modelo atual (aproximação, em créditos Lovable). */
const AVG_CREDITS_PER_QUESTION = 0.015;

function fmtDay(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function fmtCost(n: number) {
  return `≈ ${(n * AVG_CREDITS_PER_QUESTION).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} créditos`;
}

/** Uso quantitativo do assistente (admin). Sem perguntas, respostas ou contexto. */
export function AdminAiUsagePanel({ enabled }: { enabled: boolean }) {
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin-ai-usage"],
    enabled,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_ai_usage_summary");
      if (error) throw error;
      return (data ?? []) as AdminAiUsageRow[];
    },
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((r) => !s || r.full_name.toLowerCase().includes(s) || r.email.toLowerCase().includes(s));
  }, [q.data, search]);

  const totals = useMemo(
    () =>
      (q.data ?? []).reduce(
        (a, r) => ({ d1: a.d1 + r.last_24h, d7: a.d7 + r.last_7d, d30: a.d30 + r.last_30d, all: a.all + r.total_90d }),
        { d1: 0, d7: 0, d30: 0, all: 0 },
      ),
    [q.data],
  );

  if (!enabled) return null;

  return (
    <Card aria-label="Uso do assistente">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4 text-brand-hover" aria-hidden /> Uso do assistente
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => q.refetch()} aria-label="Atualizar">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Últimas 24h", totals.d1],
            ["7 dias", totals.d7],
            ["30 dias", totals.d30],
            ["Total (90 dias)", totals.all],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-lg border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold">{n}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Custo estimado com o modelo atual (30 dias): {fmtCost(totals.d30)}. Aproximação pela média observada por
          pergunta; não é histórico financeiro e muda com o modelo e o tamanho das respostas.
        </p>
        <Input placeholder="Buscar cliente por nome ou e-mail" value={search} onChange={(e) => setSearch(e.target.value)} />
        {q.isLoading ? (
          <ListSkeleton />
        ) : q.isError ? (
          <p className="text-sm text-destructive">Não foi possível carregar o uso do assistente.</p>
        ) : rows.length === 0 ? (
          <EmptyState title="Nenhum cliente encontrado" description="Ajuste a busca." />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.user_id} className="min-w-0 rounded-lg border border-border/60 p-3">
                <p className="truncate text-sm font-medium">{r.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-6">
                  <div><dt className="text-muted-foreground">24h</dt><dd>{r.last_24h}</dd></div>
                  <div><dt className="text-muted-foreground">7 dias</dt><dd>{r.last_7d}</dd></div>
                  <div><dt className="text-muted-foreground">30 dias</dt><dd>{r.last_30d}</dd></div>
                  <div><dt className="text-muted-foreground">Total (90 dias)</dt><dd>{r.total_90d}</dd></div>
                  <div><dt className="text-muted-foreground">Último dia de uso</dt><dd>{fmtDay(r.last_day)}</dd></div>
                  <div><dt className="text-muted-foreground">Custo estimado</dt><dd className="whitespace-nowrap">{fmtCost(r.last_30d)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
