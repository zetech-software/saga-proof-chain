import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { UserActivity } from "@/lib/user-activity";

/**
 * Atividade de acesso dos usuários cadastrados.
 * Os dados vêm da função segura admin_list_user_activity(), que só responde
 * para quem possui o cargo admin.
 */
export function useUserActivity(enabled: boolean) {
  return useQuery({
    queryKey: ["user-activity"],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<UserActivity[]> => {
      const { data, error } = await supabase.rpc("admin_list_user_activity");
      if (error) throw error;
      return (data ?? []) as UserActivity[];
    },
  });
}
