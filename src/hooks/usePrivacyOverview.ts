import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type PrivacyPolicyRow = {
  table_name: string;
  rls_enabled: boolean;
  policy_name: string | null;
  command: string | null;
  roles: string[] | null;
  using_expression: string | null;
  check_expression: string | null;
  is_broad: boolean | null;
};

/**
 * Resumo somente leitura das regras de acesso vigentes.
 * Vem da função segura admin_privacy_overview(), restrita ao cargo admin.
 */
export function usePrivacyOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["privacy-overview"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<PrivacyPolicyRow[]> => {
      const { data, error } = await supabase.rpc("admin_privacy_overview");
      if (error) throw error;
      return (data ?? []) as PrivacyPolicyRow[];
    },
  });
}
