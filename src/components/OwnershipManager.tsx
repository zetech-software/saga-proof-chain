import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Share2, X } from "lucide-react";

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
import { useOwnership, useOwnershipMutations, type ResourceType } from "@/hooks/useOwnership";
import { useUserActivity } from "@/hooks/useUserActivity";

type Item = {
  id: string;
  label: string;
  type: ResourceType;
  organizationId: string | null;
  table: "documents" | "trademarks" | null;
};

const TYPE_LABEL: Record<ResourceType, string> = {
  trademark: "Marca",
  document: "Documento",
  certificate: "Certificado",
};

const NO_ORG = "__sem_organizacao__";

/**
 * Titularidade e compartilhamento: mostra a quem cada marca, documento ou
 * certificado pertence e permite ao admin liberar acesso pontual a um cliente.
 */
export function OwnershipManager({ enabled }: { enabled: boolean }) {
  const ownership = useOwnership(enabled);
  const users = useUserActivity(enabled);
  const { setOrganization, addShare, removeShare } = useOwnershipMutations();
  const [term, setTerm] = useState("");
  const [pendingUser, setPendingUser] = useState<Record<string, string>>({});

  const resources = useQuery({
    queryKey: ["ownership-resources"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<Item[]> => {
      const [marcas, docs, certs] = await Promise.all([
        supabase.from("trademarks").select("id, name, organization_id").is("deleted_at", null).order("name"),
        supabase.from("documents").select("id, title, organization_id").is("deleted_at", null).order("title"),
        supabase.from("certificates").select("id, title").is("deleted_at", null).order("title"),
      ]);
      if (marcas.error) throw marcas.error;
      if (docs.error) throw docs.error;
      if (certs.error) throw certs.error;
      return [
        ...(marcas.data ?? []).map((m) => ({
          id: m.id,
          label: m.name,
          type: "trademark" as const,
          organizationId: m.organization_id,
          table: "trademarks" as const,
        })),
        ...(docs.data ?? []).map((d) => ({
          id: d.id,
          label: d.title,
          type: "document" as const,
          organizationId: d.organization_id,
          table: "documents" as const,
        })),
        ...(certs.data ?? []).map((c) => ({
          id: c.id,
          label: c.title,
          type: "certificate" as const,
          organizationId: null,
          table: null,
        })),
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

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    const list = resources.data ?? [];
    if (!q) return list;
    return list.filter((i) => i.label.toLowerCase().includes(q));
  }, [resources.data, term]);

  const sharesFor = (item: Item) =>
    (ownership.data?.shares ?? []).filter(
      (s) => s.resource_type === item.type && s.resource_id === item.id,
    );

  const orphans = (resources.data ?? []).filter(
    (i) => i.table !== null && !i.organizationId,
  ).length;

  const isLoading = resources.isLoading || ownership.isLoading;

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4 text-accent" aria-hidden />
          Titularidade e compartilhamento
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Membros de uma organização veem tudo dela. Outros clientes só veem o que enviaram ou o
          que for compartilhado aqui.
        </p>
        {orphans > 0 && (
          <p className="flex items-center gap-2 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {orphans} item(ns) sem organização definida — visível apenas para quem enviou.
          </p>
        )}
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar marca, documento ou certificado"
          aria-label="Buscar item"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <ListSkeleton items={3} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Nenhum item encontrado"
            description="Cadastre marcas ou documentos para definir titularidade e compartilhamentos."
          />
        ) : (
          filtered.map((item) => {
            const key = `${item.type}:${item.id}`;
            const shares = sharesFor(item);
            return (
              <div
                key={key}
                className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {TYPE_LABEL[item.type]}
                      {item.table
                        ? ` · ${item.organizationId ? orgName.get(item.organizationId) ?? "Organização removida" : "Sem organização"}`
                        : " · segue o acesso do documento/marca vinculado"}
                    </p>
                  </div>
                  {item.table && (
                    <Select
                      value={item.organizationId ?? NO_ORG}
                      onValueChange={(value) =>
                        setOrganization.mutate({
                          table: item.table!,
                          id: item.id,
                          organizationId: value === NO_ORG ? null : value,
                        })
                      }
                    >
                      <SelectTrigger className="w-full sm:w-64" aria-label="Organização titular">
                        <SelectValue placeholder="Organização" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_ORG}>Sem organização</SelectItem>
                        {(ownership.data?.organizations ?? []).map((o) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {shares.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Nenhum compartilhamento individual.
                    </span>
                  ) : (
                    shares.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs"
                      >
                        {userName.get(s.user_id) ?? s.user_id}
                        <button
                          type="button"
                          onClick={() => removeShare.mutate(s.id)}
                          aria-label={`Remover acesso de ${userName.get(s.user_id) ?? "usuário"}`}
                          className="rounded-full p-0.5 hover:bg-muted"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={pendingUser[key] ?? ""}
                    onValueChange={(value) => setPendingUser((p) => ({ ...p, [key]: value }))}
                  >
                    <SelectTrigger className="sm:w-64" aria-label="Compartilhar com usuário">
                      <SelectValue placeholder="Compartilhar com…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(users.data ?? [])
                        .filter((u) => !shares.some((s) => s.user_id === u.user_id))
                        .map((u) => (
                          <SelectItem key={u.user_id} value={u.user_id}>
                            {u.full_name || u.email}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!pendingUser[key] || addShare.isPending}
                    onClick={() => {
                      const userId = pendingUser[key];
                      if (!userId) return;
                      addShare.mutate(
                        { resourceType: item.type, resourceId: item.id, userId },
                        { onSuccess: () => setPendingUser((p) => ({ ...p, [key]: "" })) },
                      );
                    }}
                  >
                    Compartilhar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
