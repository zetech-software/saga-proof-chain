import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { ResourceType } from "@/hooks/useOwnership";

export type ResourceAction = "view" | "download";

export type ResourceView = {
  id: string;
  user_id: string;
  resource_type: ResourceType;
  resource_id: string;
  action: string;
  viewed_at: string;
};

// Evita registrar a mesma visualização várias vezes na mesma sessão do navegador.
const alreadyLogged = new Set<string>();

/** Registra que o usuário logado visualizou (ou baixou) um recurso. Falha em silêncio. */
export async function logResourceView(
  resourceType: ResourceType,
  resourceId: string,
  action: ResourceAction = "view",
) {
  try {
    const key = `${resourceType}:${resourceId}:${action}`;
    if (action === "view") {
      if (alreadyLogged.has(key)) return;
      alreadyLogged.add(key);
    }
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;
    await supabase.from("resource_views").insert({
      user_id: userId,
      resource_type: resourceType,
      resource_id: resourceId,
      action,
    });
  } catch {
    // Telemetria de acesso nunca deve interromper a navegação do usuário.
  }
}

/** Histórico de acessos aos recursos — admin enxerga todos, cliente apenas os seus. */
export function useResourceViews(enabled: boolean) {
  return useQuery({
    queryKey: ["resource-views"],
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<ResourceView[]> => {
      const { data, error } = await supabase
        .from("resource_views")
        .select("id, user_id, resource_type, resource_id, action, viewed_at")
        .order("viewed_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ResourceView[];
    },
  });
}
