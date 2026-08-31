import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Organização do usuário logado (ex.: Saga Mitologia Cósmica).
 * Novos envios ficam vinculados a ela, mantendo o conteúdo visível para
 * todos os membros da mesma organização.
 */
export function useMyOrganization() {
  return useQuery({
    queryKey: ["my-organization"],
    staleTime: 300_000,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from("organization_members")
        .select("organization_id")
        .limit(1)
        .maybeSingle();
      return data?.organization_id ?? null;
    },
  });
}
