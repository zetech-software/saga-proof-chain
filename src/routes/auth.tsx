import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { SagaLogo } from "@/components/SagaLogo";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PoweredBy } from "@/components/PoweredBy";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso à Torre — Saga Mitologia Cósmica" },
      {
        name: "description",
        content:
          "Área de acesso restrito ao torre de registros da Saga Mitologia Cósmica, por Zé Registra.",
      },
      { property: "og:title", content: "Acesso à Torre — Saga Mitologia Cósmica" },
      {
        property: "og:description",
        content: "Entre com seu usuário para acompanhar marcas, documentos e certificados.",
      },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email({ message: "Informe um e-mail válido" }).max(255),
  password: z.string().min(6, { message: "A senha deve ter ao menos 6 caracteres" }).max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error("E-mail ou senha incorretos.");
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="starfield flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/80 p-8 shadow-[var(--shadow-cosmic)] backdrop-blur">
        <div className="mb-8 text-center">
          <SagaLogo className="mx-auto h-20" />
          <p className="mt-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Torre de Registros
          </p>
        </div>


        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@sagamitologiacosmica.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar na torre"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acesso exclusivo. Os usuários são criados pela equipe Zé Registra.
        </p>
      </div>

      <PoweredBy className="mt-10" />
    </div>
  );
}
