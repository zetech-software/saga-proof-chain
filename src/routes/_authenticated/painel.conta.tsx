import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { KeyRound } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RouteErrorState } from "@/components/RouteErrorState";
import { usePortalSession } from "@/hooks/usePortalSession";

export const Route = createFileRoute("/_authenticated/painel/conta")({
  head: () => ({
    meta: [
      { title: "Minha conta — Torre de Registros | Saga Mitologia Cósmica" },
      {
        name: "description",
        content: "Gerencie seu acesso e altere a senha da Torre de Registros.",
      },
      { property: "og:title", content: "Minha conta — Saga Mitologia Cósmica" },
      {
        property: "og:description",
        content: "Área para alterar a senha de acesso ao portal de registros.",
      },
    ],
  }),
  errorComponent: RouteErrorState,
  component: ContaPage,
});

const schema = z
  .object({
    current: z.string().min(1, { message: "Informe sua senha atual" }),
    password: z
      .string()
      .min(8, { message: "A nova senha deve ter ao menos 8 caracteres" })
      .max(72, { message: "A senha deve ter no máximo 72 caracteres" }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "As senhas não coincidem",
    path: ["confirm"],
  })
  .refine((v) => v.password !== v.current, {
    message: "A nova senha deve ser diferente da atual",
    path: ["password"],
  });

function ContaPage() {
  const { data: session } = usePortalSession();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ current, password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }
    const email = session?.user?.email;
    if (!email) {
      toast.error("Sua sessão expirou. Entre novamente.");
      return;
    }

    setSaving(true);
    // Reautenticação: confirma a senha atual antes de permitir a troca.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: parsed.data.current,
    });
    if (reauthError) {
      setSaving(false);
      toast.error("Senha atual incorreta.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setSaving(false);
    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (msg.includes("weak") || msg.includes("pwned")) {
        toast.error("Escolha uma senha mais forte e que não seja comum.");
        return;
      }
      toast.error("Não foi possível alterar a senha. Tente novamente.");
      return;
    }

    setCurrent("");
    setPassword("");
    setConfirm("");
    toast.success("Senha alterada com sucesso.");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl text-gold">Minha conta</h1>
        <p className="text-sm text-muted-foreground">
          {session?.user?.email
            ? `Acesso vinculado a ${session.user.email}.`
            : "Gerencie seu acesso à Torre de Registros."}
        </p>
      </header>

      <AccountStatusCard />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-gold" aria-hidden="true" /> Alterar senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="current-password">Senha atual</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-new-password">Nova senha</Label>
              <Input
                id="account-new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby="account-new-password-help"
              />
              <p id="account-new-password-help" className="text-xs text-muted-foreground">
                Use ao menos 8 caracteres, combinando letras, números e símbolos.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-confirm-password">Confirmar nova senha</Label>
              <Input
                id="account-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={saving} aria-busy={saving}>
              {saving ? "Salvando..." : "Alterar senha"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
