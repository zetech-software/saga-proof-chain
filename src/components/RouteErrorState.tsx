import type { ErrorComponentProps } from "@tanstack/react-router";
import { Link, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type RouteErrorStateProps = ErrorComponentProps & {
  _unused?: never;
  reset: () => void;
};

/**
 * Estado de erro amigável para rotas do portal.
 * Nunca exibe stack trace, mensagens internas, nomes de tabelas ou tokens.
 */
export function RouteErrorState({ error, reset }: RouteErrorStateProps) {
  const router = useRouter();

  useEffect(() => {
    if (import.meta.env.DEV) {
      // Detalhes técnicos apenas em desenvolvimento.
      console.error("[rota] falha ao carregar:", error);
    }
  }, [error]);

  return (
    <Card
      role="alert"
      aria-live="polite"
      className="mx-auto w-full max-w-xl border-destructive/30 bg-card/70"
    >
      <CardContent className="flex flex-col items-center gap-4 px-4 py-10 text-center sm:px-8">
        <div className="rounded-xl bg-destructive/10 p-3">
          <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-2xl text-gold">Não foi possível carregar esta página</h2>
          <p className="text-sm text-muted-foreground">
            Houve uma falha temporária ao buscar as informações. Você pode tentar novamente ou
            voltar à visão geral.
          </p>
          <p className="text-xs text-muted-foreground">
            Se o problema continuar, abra um chamado na Área de suporte.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Tentar novamente
          </Button>
          <Button variant="outline" asChild>
            <Link to="/painel">Voltar à Visão geral</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/painel/suporte">Área de suporte</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
