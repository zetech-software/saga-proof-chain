import { createFileRoute, Outlet } from "@tanstack/react-router";

import { PortalLayout } from "@/components/PortalLayout";
import { usePortalSession } from "@/hooks/usePortalSession";

export const Route = createFileRoute("/_authenticated/painel")({
  component: PainelLayout,
});

function PainelLayout() {
  const { data } = usePortalSession();
  return (
    <PortalLayout isAdmin={data?.isAdmin ?? false} email={data?.user?.email}>
      <Outlet />
    </PortalLayout>
  );
}
