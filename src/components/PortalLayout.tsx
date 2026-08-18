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

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/painel" className="flex items-center gap-3">
            <SagaLogo className="h-10 sm:h-12" />
            <span className="hidden text-[11px] uppercase tracking-[0.3em] text-muted-foreground sm:inline">
              Torre de Registros
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {email && (
              <span className="hidden text-xs text-muted-foreground sm:inline">{email}</span>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-2 pb-2 sm:px-5">
          {[
            ...navItems,
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
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {count > 0 && (
                  <span
                    className="inline-flex min-w-5 items-center justify-center rounded-full border border-primary/40 bg-primary/20 px-1.5 text-[11px] font-semibold text-primary"
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

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>

      <footer className="mt-12 border-t border-border/60 py-8">
        <PoweredBy />
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Acompanhamento de registros e certificação em blockchain.
        </p>
      </footer>
    </div>
  );
}
