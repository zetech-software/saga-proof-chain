import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Eye, Share2, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
import { RouteErrorState } from "@/components/RouteErrorState";
import { usePortalSession } from "@/hooks/usePortalSession";
import { useOwnership, type ResourceType } from "@/hooks/useOwnership";
import { useUserActivity } from "@/hooks/useUserActivity";
import { useResourceViews } from "@/hooks/useResourceViews";
import { formatDateTime } from "@/lib/portal";

export const Route = createFileRoute("/_authenticated/painel/compartilhados")({
  head: () => ({
    meta: [
      { title: "Recursos compartilhados — Torre de Registros | Saga Mitologia Cósmica" },
      {
        name: "description",
        content:
          "Acompanhe quais marcas, documentos e certificados estão compartilhados e quem visualizou cada item.",
      },
      { property: "og:title", content: "Recursos compartilhados — Saga Mitologia Cósmica" },
      {
        property: "og:description",
        content: "Controle de titularidade, compartilhamentos e histórico de acesso.",
      },
    ],
  }),
  errorComponent: RouteErrorState,
  component: SharedResourcesPage,
});

type Item = {
  id: string;
  label: string;
  type: ResourceType;
  organizationId: string | null;
  linkedTo: string | null;
};

const TYPE_LABEL: Record<ResourceType, string> = {
  trademark: "Marca",
  document: "Documento",
  certificate: "Certificado",
};

const ACTION_LABEL: Record<string, string> = {
  view: "Visualizou",
  download: "Baixou",
};

function SharedResourcesPage() {
  const { data: session, isLoading: loadingSession } = usePortalSession();
  const navigate = useNavigate();
  const isAdmin = session?.isAdmin ?? false;

  useEffect(() => {
    if (loadingSession || isAdmin) return;
    navigate({ to: "/painel", replace: true });
  }, [isAdmin, loadingSession, navigate]);

  const ownership = useOwnership(isAdmin);
  const users = useUserActivity(isAdmin);
  const views = useResourceViews(isAdmin);
  const [term, setTerm] = useState("");
  const [userFilter, setUserFilter] = useState("todos");
  const [typeFilter, setTypeFilter] = useState("todos");

  const resources = useQuery({
    queryKey: ["shared-resources"],
    enabled: isAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<Item[]> => {
      const [marcas, docs, certs] = await Promise.all([
        supabase.from("trademarks").select("id, name, organization_id").is("deleted_at", null).order("name"),
        supabase.from("documents").select("id, title, organization_id").is("deleted_at", null).order("title"),
        supabase
          .from("certificates")
          .select("id, title, document_id, trademark_id").is("deleted_at", null)
          .order("title"),
      ]);
      if (marcas.error) throw marcas.error;
      if (docs.error) throw docs.error;
      if (certs.error) throw certs.error;

      const docById = new Map((docs.data ?? []).map((d) => [d.id, d]));
      const marcaById = new Map((marcas.data ?? []).map((m) => [m.id, m]));

      return [
        ...(marcas.data ?? []).map((m) => ({
          id: m.id,
          label: m.name,
          type: "trademark" as const,
          organizationId: m.organization_id,
          linkedTo: null,
        })),
        ...(docs.data ?? []).map((d) => ({
          id: d.id,
          label: d.title,
          type: "document" as const,
          organizationId: d.organization_id,
          linkedTo: null,
        })),
        ...(certs.data ?? []).map((c) => {
          const doc = c.document_id ? docById.get(c.document_id) : undefined;
          const marca = c.trademark_id ? marcaById.get(c.trademark_id) : undefined;
          return {
            id: c.id,
            label: c.title,
            type: "certificate" as const,
            organizationId: doc?.organization_id ?? marca?.organization_id ?? null,
            linkedTo: doc ? `Documento: ${doc.title}` : marca ? `Marca: ${marca.name}` : null,
          };
        }),
      ];
    },
  });

  const userName = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users.data ?? []) map.set(u.user_id, u.full_name || u.email || u.user_id);
    return map;
  }, [users.data]);

  const orgName = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of ownership.data?.organizations ?? []) map.set(o.id, o.name);
    return map;
  }, [ownership.data]);

  const orgMembers = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of ownership.data?.members ?? []) {
      const list = map.get(m.organization_id) ?? [];
      list.push(m.user_id);
      map.set(m.organization_id, list);
    }
    return map;
  }, [ownership.data]);

  const viewsByResource = useMemo(() => {
    const map = new Map<string, { total: number; last: string; users: Set<string> }>();
    for (const v of views.data ?? []) {
      const key = `${v.resource_type}:${v.resource_id}`;
      const current = map.get(key);
      if (current) {
        current.total += 1;
        current.users.add(v.user_id);
      } else {
        map.set(key, { total: 1, last: v.viewed_at, users: new Set([v.user_id]) });
      }
    }
    return map;
  }, [views.data]);

  const items = useMemo(() => {
    const q = term.trim().toLowerCase();
    return (resources.data ?? [])
      .filter((i) => (typeFilter === "todos" ? true : i.type === typeFilter))
      .filter((i) => (q ? i.label.toLowerCase().includes(q) : true));
  }, [resources.data, term, typeFilter]);

  const history = useMemo(() => {
    const labels = new Map(
      (resources.data ?? []).map((i) => [`${i.type}:${i.id}`, i.label] as const),
    );
    return (views.data ?? [])
      .filter((v) => (userFilter === "todos" ? true : v.user_id === userFilter))
      .filter((v) => (typeFilter === "todos" ? true : v.resource_type === typeFilter))
      .slice(0, 200)
      .map((v) => ({
        ...v,
        label: labels.get(`${v.resource_type}:${v.resource_id}`) ?? "Item removido",
        person: userName.get(v.user_id) ?? v.user_id,
      }));
  }, [views.data, resources.data, userFilter, typeFilter, userName]);

  if (loadingSession) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (!isAdmin) {
    return (
      <Card className="bg-card/70">
        <CardContent className="px-6 py-8 text-sm text-muted-foreground">
          Área restrita à equipe Zé Registra. Redirecionando...
        </CardContent>
      </Card>
    );
  }

  const isLoading = resources.isLoading || ownership.isLoading || views.isLoading;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-gold">Recursos compartilhados</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Quem tem acesso a cada marca, documento e certificado — e o histórico de visualizações e
          downloads de Mariana, Léo e demais clientes.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_200px_220px]">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar item"
          aria-label="Buscar item compartilhado"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger aria-label="Filtrar por tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="trademark">Marcas</SelectItem>
            <SelectItem value="document">Documentos</SelectItem>
            <SelectItem value="certificate">Certificados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger aria-label="Filtrar histórico por usuário">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os usuários</SelectItem>
            {(users.data ?? []).map((u) => (
              <SelectItem key={u.user_id} value={u.user_id}>
                {u.full_name || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Share2 className="h-4 w-4 text-accent" aria-hidden />
            Quem enxerga cada item
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <ListSkeleton items={3} />
          ) : items.length === 0 ? (
            <EmptyState
              title="Nenhum item encontrado"
              description="Ajuste a busca ou o filtro de tipo."
            />
          ) : (
            items.map((item) => {
              const key = `${item.type}:${item.id}`;
              const shares = (ownership.data?.shares ?? []).filter(
                (s) => s.resource_type === item.type && s.resource_id === item.id,
              );
              const members = item.organizationId
                ? (orgMembers.get(item.organizationId) ?? [])
                : [];
              const audience = [
                ...members.map((id) => userName.get(id) ?? id),
                ...shares.map((s) => `${userName.get(s.user_id) ?? s.user_id} (individual)`),
              ];
              const stats = viewsByResource.get(key);
              return (
                <div
                  key={key}
                  className="rounded-lg border border-border/60 bg-card/40 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {TYPE_LABEL[item.type]}
                        {" · "}
                        {item.organizationId
                          ? (orgName.get(item.organizationId) ?? "Organização removida")
                          : "Sem organização"}
                        {item.linkedTo ? ` · ${item.linkedTo}` : ""}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                      {stats
                        ? `${stats.total} acesso(s) · último em ${formatDateTime(stats.last)}`
                        : "Nenhum acesso registrado"}
                    </span>
                  </div>
                  <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                    <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {audience.length > 0
                      ? `Com acesso: ${audience.join(", ")}`
                      : "Somente a equipe Zé Registra e quem enviou o item."}
                  </p>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="h-4 w-4 text-accent" aria-hidden />
            Histórico de acessos
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Últimos 200 registros de visualização e download dentro do portal.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <ListSkeleton items={4} />
          ) : history.length === 0 ? (
            <EmptyState
              title="Nenhum acesso registrado ainda"
              description="Assim que Mariana ou Léo abrirem ou baixarem um item, o acesso aparece aqui."
            />
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/40 px-4 py-3 text-sm"
              >
                <span className="min-w-0 break-words">
                  <strong className="font-medium">{h.person}</strong>{" "}
                  {(ACTION_LABEL[h.action] ?? "Acessou").toLowerCase()}{" "}
                  {TYPE_LABEL[h.resource_type].toLowerCase()} “{h.label}”
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(h.viewed_at)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
