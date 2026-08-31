import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Stamp,
  FileText,
  ShieldCheck,
  Shield,
  LifeBuoy,
  LogOut,
  UserCog,
} from "lucide-react";
import type { ReactNode } from "react";

import { supabase } from "@/integrations/supabase/client";
import { PoweredBy } from "@/components/PoweredBy";
import { SagaLogo } from "@/components/SagaLogo";
import { formatBadgeCount, useSupportNotifications } from "@/hooks/useSupportNotifications";

import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/painel", label: "Visão geral", icon: LayoutDashboard, exact: true },
  { to: "/painel/marcas", label: "Registro de marcas", icon: Stamp },
  { to: "/painel/documentos", label: "Documentos", icon: FileText },
  { to: "/painel/certificados", label: "Certificados", icon: ShieldCheck },
  { to: "/painel/suporte", label: "Suporte", icon: LifeBuoy },
  { to: "/painel/conta", label: "Minha conta", icon: UserCog },
];

export function PortalLayout({
  children,
  isAdmin,
  email,
}: {
  children: ReactNode;
  isAdmin: boolean;
  email?: string | null | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { adminCount, clientCount } = useSupportNotifications();
  usePageVisitTracker();


  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background-secondary/90 backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4 sm:px-6 sm:py-4">
          <Link
            to="/painel"
            className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <SagaLogo className="h-9 shrink-0 sm:h-12" />
            <span className="hidden text-[11px] uppercase tracking-[0.3em] text-muted-foreground lg:inline">
              Torre de Registros
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-3">
            {email && (
              <span className="hidden max-w-[220px] truncate text-xs text-muted-foreground lg:inline">
                {email}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
        <nav
          aria-label="Navegação do portal"
          className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden"
        >

          {[
            ...navItems.filter((item) => !(isAdmin && item.to === "/painel/suporte")),
            ...(isAdmin ? [{ to: "/painel/admin", label: "Admin", icon: Shield }] : []),
          ].map((item) => {
            const active =
              "exact" in item && item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const count =
              item.to === "/painel/admin"
                ? isAdmin
                  ? adminCount
                  : 0
                : item.to === "/painel/suporte"
                  ? clientCount
                  : 0;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-4 ${
                  active
                    ? "bg-brand/60 font-medium text-foreground ring-1 ring-inset ring-brand-hover/40"
                    : "text-muted-foreground hover:bg-brand-hover/15 hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
                {count > 0 && (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full border border-brand-hover/40 bg-brand-hover/20 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-brand-hover"
                    aria-hidden="true"
                  >

                    {formatBadgeCount(count)}
                  </span>
                )}
                {count > 0 && (
                  <span className="sr-only">
                    {item.to === "/painel/admin"
                      ? `${count} ${count === 1 ? "chamado novo não visualizado" : "chamados novos não visualizados"}`
                      : `${count} ${count === 1 ? "resposta não lida" : "respostas não lidas"}`}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">{children}</main>

      <footer className="mt-12 border-t border-border/60 py-8">
        <PoweredBy />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Acompanhamento de registros e certificação em blockchain.
        </p>
      </footer>
    </div>
  );
}
