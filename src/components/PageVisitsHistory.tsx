import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { ListSkeleton } from "@/components/ListSkeleton";
import { useUserActivity } from "@/hooks/useUserActivity";
import { formatSpDateTime } from "@/lib/user-activity";

type Visit = {
  id: string;
  user_id: string;
  path: string;
  page_title: string | null;
  visited_at: string;
};

const PAGE_LABEL: Record<string, string> = {
  "/painel": "Visão geral",
  "/painel/marcas": "Registro de marcas",
  "/painel/documentos": "Documentos",
  "/painel/certificados": "Certificados",
  "/painel/suporte": "Suporte",
  "/painel/conta": "Minha conta",
  "/painel/admin": "Administração",
};

function labelFor(path: string) {
  return PAGE_LABEL[path] ?? path;
}

const RANGES = [
  { id: "1", label: "Últimas 24 horas" },
  { id: "7", label: "Últimos 7 dias" },
  { id: "30", label: "Últimos 30 dias" },
  { id: "todos", label: "Todo o período" },
];

/** Histórico de acessos às páginas do portal (visível apenas para admin). */
export function PageVisitsHistory({ enabled }: { enabled: boolean }) {
  const users = useUserActivity(enabled);
  const [range, setRange] = useState("7");
  const [userId, setUserId] = useState("todos");
  const [search, setSearch] = useState("");

  const visits = useQuery({
    queryKey: ["page-visits"],
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<Visit[]> => {
      const { data, error } = await supabase
        .from("page_visits")
        .select("id, user_id, path, page_title, visited_at")
        .order("visited_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Visit[];
    },
  });

  const userName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users.data ?? []) map.set(u.user_id, u.full_name || u.email || u.user_id);
    return map;
  }, [users.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const limitDate =
      range === "todos" ? null : new Date(Date.now() - Number(range) * 24 * 60 * 60 * 1000);
    return (visits.data ?? []).filter((v) => {
      if (userId !== "todos" && v.user_id !== userId) return false;
      if (limitDate && new Date(v.visited_at) < limitDate) return false;
      if (!q) return true;
      const who = (userName.get(v.user_id) ?? "").toLowerCase();
      return who.includes(q) || labelFor(v.path).toLowerCase().includes(q);
    });
  }, [visits.data, userId, range, search, userName]);

  const perUser = useMemo(() => {
    const map = new Map<string, { visits: number; last: string; lastPath: string }>();
    for (const v of filtered) {
      const current = map.get(v.user_id);
      if (!current) map.set(v.user_id, { visits: 1, last: v.visited_at, lastPath: v.path });
      else current.visits += 1;
    }
    return [...map.entries()].sort((a, b) => (a[1].last < b[1].last ? 1 : -1));
  }, [filtered]);

  return (
    <Card className="bg-card/70">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Histórico de acessos às páginas</CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => visits.refetch()}
            disabled={visits.isFetching}
            aria-busy={visits.isFetching}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Atualizar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Cada linha mostra qual usuário abriu qual página e o horário exato (fuso de São Paulo).
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuário ou página"
            aria-label="Buscar acessos"
          />
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger aria-label="Filtrar por usuário">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os usuários</SelectItem>
              {(users.data ?? []).map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.full_name || u.email || u.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger aria-label="Filtrar por período">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {visits.isLoading ? (
          <ListSkeleton rows={4} />
        ) : visits.isError ? (
          <p className="text-sm text-muted-foreground">
            Não foi possível carregar o histórico de acessos agora.
          </p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nenhum acesso registrado no período"
            description="Os acessos passam a aparecer aqui assim que os usuários navegarem pelo portal."
          />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {perUser.map(([id, info]) => (
                <div
                  key={id}
                  className="rounded-lg border border-border/60 bg-background/30 px-4 py-3"
                >
                  <p className="truncate text-sm font-medium">{userName.get(id) ?? id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {info.visits} {info.visits === 1 ? "acesso" : "acessos"} · último em{" "}
                    {formatSpDateTime(info.last)} ({labelFor(info.lastPath)})
                  </p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full min-w-[520px] text-left text-sm">
                <caption className="sr-only">Histórico detalhado de acessos às páginas</caption>
                <thead className="bg-background/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2">
                      Usuário
                    </th>
                    <th scope="col" className="px-4 py-2">
                      Página
                    </th>
                    <th scope="col" className="px-4 py-2">
                      Data e hora
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((v) => (
                    <tr key={v.id} className="border-t border-border/50">
                      <td className="px-4 py-2">{userName.get(v.user_id) ?? v.user_id}</td>
                      <td className="px-4 py-2">{labelFor(v.path)}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                        {formatSpDateTime(v.visited_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 200 && (
              <p className="text-xs text-muted-foreground">
                Mostrando os 200 acessos mais recentes de {filtered.length} no período.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
