import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PoweredBy } from "@/components/PoweredBy";
import { SagaLogo } from "@/components/SagaLogo";

export const Route = createFileRoute("/redefinir-senha")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Definir nova senha — Torre de Registros" },
      {
        name: "description",
        content:
          "Defina uma nova senha de acesso à Torre de Registros da Saga Mitologia Cósmica.",
      },
      { property: "og:title", content: "Definir nova senha — Torre de Registros" },
      {
        property: "og:description",
        content: "Página segura para criar uma nova senha de acesso ao portal.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

const schema = z
  .object({
    password: z
      .string()
      .min(8, { message: "A nova senha deve ter ao menos 8 caracteres" })
      .max(72, { message: "A senha deve ter no máximo 72 caracteres" }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  });

type LinkState = "checking" | "valid" | "invalid";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [linkState, setLinkState] = useState<LinkState>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolveRecovery() {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      // Link inválido/expirado sinalizado pelo próprio Supabase.
      if (url.searchParams.get("error") || hash.get("error")) {
        if (active) setLinkState("invalid");
        return;
      }

      // Formato novo: ?token_hash=...&type=recovery
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      if (tokenHash && type === "recovery") {
        const { error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (!active) return;
        if (!error) {
          setLinkState("valid");
          window.history.replaceState({}, "", "/redefinir-senha");
          return;
        }
        // O token só pode ser trocado uma vez: se a sessão de recuperação já
        // foi criada nesta aba, o link continua válido para o usuário.
        const { data: existing } = await supabase.auth.getSession();
        if (!active) return;
        setLinkState(existing.session ? "valid" : "invalid");
        if (existing.session) window.history.replaceState({}, "", "/redefinir-senha");
        return;
      }

      // Formato clássico: tokens no fragmento (o cliente já processa a sessão).
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setLinkState(data.session ? "valid" : "invalid");
      if (data.session && url.hash) window.history.replaceState({}, "", "/redefinir-senha");
    }

    void resolveRecovery();
    return () => {
      active = false;

    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setSaving(false);
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("expired") || msg.includes("session")) {
        setLinkState("invalid");
        toast.error("Seu link expirou. Solicite um novo e-mail de recuperação.");
        return;
      }
      if (msg.includes("weak") || msg.includes("pwned") || msg.includes("password")) {
        toast.error("Escolha uma senha mais forte e que não seja comum.");
        return;
      }
      toast.error("Não foi possível atualizar a senha. Tente novamente.");
      return;
    }
    toast.success("Senha atualizada com sucesso.");
    navigate({ to: "/painel", replace: true });
  }

  return (
    <div className="starfield flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border/70 bg-card/80 p-8 shadow-[var(--shadow-cosmic)] backdrop-blur">
        <div className="mb-8 text-center">
          <SagaLogo className="mx-auto h-20" />
          <p className="mt-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            Nova senha
          </p>
        </div>

        {linkState === "checking" && (
          <p className="text-center text-sm text-muted-foreground" role="status" aria-live="polite">
            Validando seu link de recuperação...
          </p>
        )}

        {linkState === "invalid" && (
          <div role="alert" aria-live="polite" className="space-y-4 text-center">
            <h1 className="font-display text-xl text-gold">Link inválido ou expirado</h1>
            <p className="text-sm text-muted-foreground">
              O link de redefinição já foi usado ou passou da validade. Solicite um novo e-mail na
              tela de acesso.
            </p>
            <Button className="w-full" onClick={() => navigate({ to: "/auth", replace: true })}>
              Voltar ao acesso
            </Button>
          </div>
        )}

        {linkState === "valid" && (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <h1 className="font-display text-xl text-gold">Defina sua nova senha</h1>
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="new-password-help"
                placeholder="••••••••"
              />
              <p id="new-password-help" className="text-xs text-muted-foreground">
                Use ao menos 8 caracteres, combinando letras, números e símbolos.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar nova senha</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" className="w-full" disabled={saving} aria-busy={saving}>
              {saving ? "Salvando..." : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </div>

      <PoweredBy className="mt-10" />
    </div>
  );
}
