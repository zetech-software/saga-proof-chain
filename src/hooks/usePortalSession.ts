import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function usePortalSession() {
  return useQuery({
    queryKey: ["portal-session"],
    // Role changes in another admin session must refresh the navigation.
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return { user: null, isAdmin: false, mustChangePassword: false };
      const [{ data: roles }, pending] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("password_change_required").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      if (pending.error) throw pending.error;
      return {
        user,
        isAdmin: (roles ?? []).some((r) => r.role === "admin"),
        mustChangePassword: !!pending.data,
      };
    },
  });
}
