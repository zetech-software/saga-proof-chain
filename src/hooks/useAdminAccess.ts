import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { AccessData, AccessMember, AccessOrganization, AccessEvent } from "@/lib/admin-access";

const rpcClient = supabase as unknown as { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
export function useAdminAccess(enabled: boolean) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["admin-access"],
    enabled, staleTime: 0,
    queryFn: async (): Promise<AccessData> => {
      const [users, profiles, orgs, members, events] = await Promise.all([
        rpcClient.rpc("admin_list_user_activity"),
        supabase.from("profiles").select("id,full_name,email"),
        supabase.from("organizations").select("id,name,slug,notes,updated_at").order("name"),
        supabase.from("organization_members").select("organization_id,user_id"),
        supabase.from("admin_access_events" as never).select("*").order("created_at", { ascending: false }).limit(50),
      ]);
      for (const result of [users, profiles, orgs, members, events]) {
        if (result.error) throw new Error("Não foi possível carregar a gestão de acesso. Confira se a regra 0016 foi aplicada.");
      }
      const profileMap = new Map((profiles.data ?? []).map(p => [p.id, p]));
      const rows = users.data as { user_id: string; full_name: string | null; email: string | null; roles: string[] | null }[];
      return {
        accounts: (rows ?? []).map(u => ({
          id: u.user_id, name: profileMap.get(u.user_id)?.full_name ?? null,
          email: u.email, roles: u.roles ?? [],
        })),
        organizations: (orgs.data ?? []) as AccessOrganization[],
        members: (members.data ?? []) as AccessMember[],
        events: (events.data ?? []) as unknown as AccessEvent[],
      };
    },
  });
  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["admin-access"] }),
      qc.invalidateQueries({ queryKey: ["ownership"] }),
      qc.invalidateQueries({ queryKey: ["user-activity"] }),
      qc.invalidateQueries({ queryKey: ["portal-session"] }),
      qc.invalidateQueries({ queryKey: ["account-status"] }),
      qc.invalidateQueries({ queryKey: ["admin-data"] }),
      qc.invalidateQueries({ queryKey: ["overview"] }),
      qc.invalidateQueries({ queryKey: ["documents"] }),
      qc.invalidateQueries({ queryKey: ["certificates"] }),
    ]);
  }
  const change = useMutation({
    mutationFn: async ({ name, args }: { name: string; args: Record<string, unknown> }) => {
      const { data, error } = await rpcClient.rpc(name, args);
      if (error) {
        const messages = [
          "Acesso restrito a administradores.", "Conta invalida.", "A funcao desta conta mudou. Atualize a lista.",
          "O ultimo administrador deve manter seu acesso.", "Voce nao pode remover seu proprio acesso administrativo.",
          "Conta ou organizacao invalida.", "O vinculo mudou. Atualize a lista.", "Informe nome e identificador validos.",
          "A organizacao mudou. Atualize a lista.", "O identificador de uma organizacao existente nao pode ser alterado.",
          "Organizacao nao encontrada.", "Informe uma conta e um nome validos.", "Perfil nao encontrado.", "O nome mudou. Atualize a lista.",
        ];
        throw new Error(messages.includes(error.message) ? error.message : "Não foi possível confirmar a alteração. Atualize a lista antes de repetir.");
      }
      return data;
    },
    onSuccess: refresh,
    onError: refresh,
  });
  return { query, change, refresh };
}
