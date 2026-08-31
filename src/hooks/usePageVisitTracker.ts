import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";

/**
 * Registra cada acesso do usuário autenticado a uma página do portal.
 * A gravação é silenciosa: qualquer falha nunca interrompe a navegação.
 */
export function usePageVisitTracker() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const lastLogged = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Evita gravar o mesmo caminho duas vezes no mesmo render/StrictMode.
    const key = `${path}`;
    if (lastLogged.current === key) return;
    lastLogged.current = key;

    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data.user?.id;
      if (!userId || cancelled) return;
      await supabase.from("page_visits").insert({
        user_id: userId,
        path,
        page_title: document.title.slice(0, 200),
        user_agent: window.navigator.userAgent.slice(0, 300),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);
}
