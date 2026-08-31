import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export type Organization = { id: string; name: string; slug: string };
export type OrganizationMember = { organization_id: string; user_id: string };
export type ResourceType = "trademark" | "document" | "certificate";
export type ResourceShare = {
  id: string;
  resource_type: ResourceType;
  resource_id: string;
  user_id: string;
  created_at: string;
};

/** Organizações, membros e compartilhamentos — visão completa do admin. */
export function useOwnership(enabled: boolean) {
  return useQuery({
    queryKey: ["ownership"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const [orgs, members, shares] = await Promise.all([
        supabase.from("organizations").select("id, name, slug").order("name"),
        supabase.from("organization_members").select("organization_id, user_id"),
        supabase
          .from("resource_shares")
          .select("id, resource_type, resource_id, user_id, created_at")
          .order("created_at", { ascending: false }),
      ]);
      if (orgs.error) throw orgs.error;
      if (members.error) throw members.error;
      if (shares.error) throw shares.error;
      return {
        organizations: (orgs.data ?? []) as Organization[],
        members: (members.data ?? []) as OrganizationMember[],
        shares: (shares.data ?? []) as ResourceShare[],
      };
    },
  });
}

export function useOwnershipMutations() {
  const queryClient = useQueryClient();

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["ownership"] });
    queryClient.invalidateQueries({ queryKey: ["admin-data"] });
  }

  const setOrganization = useMutation({
    mutationFn: async (input: {
      table: "documents" | "trademarks";
      id: string;
      organizationId: string | null;
    }) => {
      const { error } = await supabase
        .from(input.table)
        .update({ organization_id: input.organizationId })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Titularidade atualizada");
      refresh();
    },
    onError: () => toast.error("Não foi possível atualizar a titularidade"),
  });

  const addShare = useMutation({
    mutationFn: async (input: {
      resourceType: ResourceType;
      resourceId: string;
      userId: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const adminId = userData.user?.id;
      if (!adminId) throw new Error("Sessão expirada");
      const { error } = await supabase.from("resource_shares").insert({
        resource_type: input.resourceType,
        resource_id: input.resourceId,
        user_id: input.userId,
        created_by: adminId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acesso compartilhado");
      refresh();
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "";
      toast.error(
        msg.includes("duplicate")
          ? "Esse usuário já tem acesso a este item."
          : "Não foi possível compartilhar o acesso.",
      );
    },
  });

  const removeShare = useMutation({
    mutationFn: async (shareId: string) => {
      const { error } = await supabase.from("resource_shares").delete().eq("id", shareId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compartilhamento removido");
      refresh();
    },
    onError: () => toast.error("Não foi possível remover o compartilhamento"),
  });

  return { setOrganization, addShare, removeShare };
}
