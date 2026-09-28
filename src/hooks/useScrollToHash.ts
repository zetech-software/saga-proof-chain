import { useEffect } from "react";

/** Rola até o elemento indicado no #hash quando a lista terminar de carregar. */
export function useScrollToHash(ready: boolean) {
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const el = document.getElementById(id);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [ready]);
}
