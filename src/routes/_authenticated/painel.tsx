import { createFileRoute, Outlet } from "@tanstack/react-router";

import { PortalLayout } from "@/components/PortalLayout";
import { usePortalSession } from "@/hooks/usePortalSession";
import { RequiredPasswordChange } from "@/components/RequiredPasswordChange";

export const Route = createFileRoute("/_authenticated/painel")({
  component: PainelLayout,
});

function PainelLayout() {
  const { data, isPending, isError, refetch } = usePortalSession();
  // Só mostra o painel depois de confirmar sessão e cargo: nunca exibe menu/admin errado.
  if (isPending) {
    return (
      <div className="starfield flex min-h-screen items-center justify-center px-4" role="status" aria-live="polite">
        <p className="text-sm text-muted-foreground">Carregando sua conta…</p>
      </div>
    );
  }
  if (isError || !data?.user) {
    return (
      <div className="starfield flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-muted-foreground">Não foi possível carregar sua conta.</p>
        <button type="button" className="text-sm underline" onClick={() => refetch()}>Tentar novamente</button>
      </div>
    );
  }
  // Senha temporária: nada do portal abre antes da troca.
  if (data.mustChangePassword) return <RequiredPasswordChange email={data.user.email} />;
  return (
    <PortalLayout isAdmin={data?.isAdmin ?? false} email={data?.user?.email}>
      <Outlet />
    </PortalLayout>
  );
}
