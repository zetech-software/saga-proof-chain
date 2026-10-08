import { createFileRoute, redirect } from "@tanstack/react-router";

// Preserve old bookmarks without exposing the retired support feature.
export const Route = createFileRoute("/_authenticated/painel/suporte")({
  beforeLoad: () => {
    throw redirect({ to: "/painel", replace: true });
  },
});
