import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type AccountStatus = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  roles: string[] | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
};

/**
 * Dados da própria conta do usuário logado.
 * Vem da função segura me_account_status(), que devolve apenas o registro
 * de quem está autenticado — nunca de outro usuário.
 */
export function useAccountStatus(enabled = true) {
  return useQuery({
    queryKey: ["account-status"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AccountStatus | null> => {
      const { data, error } = await supabase.rpc("me_account_status");
      if (error) throw error;
      return ((data ?? [])[0] as AccountStatus | undefined) ?? null;
    },
  });
}
