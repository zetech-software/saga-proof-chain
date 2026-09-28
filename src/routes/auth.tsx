import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
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
          "Área de acesso restrito à Torre de Registros da Saga Mitologia Cósmica, por Zé Registra.",
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
  const queryClient = useQueryClient();
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/painel", replace: true });
      else setChecking(false);
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    if (loading) return;
    setLoading(true);
    // Nada da conta anterior pode aparecer na próxima sessão.
    await queryClient.cancelQueries();
    queryClient.clear();
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error("E-mail ou senha incorretos.");
      return;
    }
    toast.success("Bem-vindo de volta!");
    await navigate({ to: "/painel", replace: true });
  }

  async function onForgotPassword() {
    const parsedEmail = z
      .string()
      .trim()
      .email({ message: "Informe um e-mail válido para recuperar a senha" })
      .max(255)
      .safeParse(email);
    if (!parsedEmail.success) {
      toast.error(parsedEmail.error.issues[0]?.message ?? "Informe um e-mail válido");
      document.getElementById("email")?.focus();
      return;
    }
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setSendingReset(false);
    if (error && error.message?.toLowerCase().includes("rate")) {
      toast.error("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
      return;
    }
    // Resposta neutra: não revela se o e-mail existe.
    toast.success("Se este e-mail estiver cadastrado, enviamos um link de redefinição.");
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
          <Button type="submit" className="w-full" disabled={loading} aria-busy={loading}>
            {loading ? "Entrando..." : "Entrar na torre"}
          </Button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onForgotPassword}
            disabled={sendingReset}
            aria-busy={sendingReset}
            className="rounded text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            {sendingReset ? "Enviando link..." : "Esqueci minha senha"}
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Acesso exclusivo. Os usuários são criados pela equipe Zé Registra.
        </p>
      </div>

      <PoweredBy className="mt-10" />
    </div>
  );
}
