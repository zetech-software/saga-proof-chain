import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { completeRequiredPasswordChange } from "@/lib/password-change.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RequiredPasswordChange({ email }: { email?: string | null }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    if (password !== confirm) return setError("As senhas não coincidem.");
    setSaving(true);
    try {
      await completeRequiredPasswordChange({ data: { password } });
      toast.success("Senha alterada. Bem-vindo ao portal.");
      await qc.invalidateQueries({ queryKey: ["portal-session"] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(msg.startsWith("[") || !msg ? "Use pelo menos 10 caracteres, com letras e números." : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="starfield flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crie sua nova senha</CardTitle>
          <p className="text-sm text-muted-foreground">
            Por segurança, troque a senha temporária antes de usar o portal.
            {email ? <span className="block break-all">{email}</span> : null}
          </p>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-1">
              <Label htmlFor="required-new-password">Nova senha</Label>
              <Input id="required-new-password" type="password" autoComplete="new-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="required-help" />
              <p id="required-help" className="text-xs text-muted-foreground">Pelo menos 10 caracteres, com letras e números.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="required-confirm-password">Confirmar nova senha</Label>
              <Input id="required-confirm-password" type="password" autoComplete="new-password" required
                value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>{saving ? "Salvando…" : "Salvar nova senha"}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
