import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { adminResetPassword, adminCreateAccount, adminDeleteAccount } from "@/lib/admin-accounts.functions";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { ACCESS_ACTION_LABEL, isAccountAdmin, mayDemote, type AccessAccount, type AccessOrganization, type AccessEvent } from "@/lib/admin-access";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";

type Confirmation = { title: string; description: string; name: string; args: Record<string, unknown> };
type OrgDraft = { id: string; name: string; slug: string; notes: string; updated: string | null };

export function AdminAccessManager({ enabled, actorId }: { enabled: boolean; actorId: string }) {
  const { query, change, refresh } = useAdminAccess(enabled);
  const [search, setSearch] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [organization, setOrganization] = useState<OrgDraft | null>(null);
  const [account, setAccount] = useState<{ user: AccessAccount; name: string } | null>(null);
  const [pendingMembers, setPendingMembers] = useState<Record<string, string>>({});
  const [resetTarget, setResetTarget] = useState<AccessAccount | null>(null);
  const [creating, setCreating] = useState<{ email: string; name: string; admin: boolean; organizationId: string } | null>(null);
  const [revealed, setRevealed] = useState<{ email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<{ user: AccessAccount; typed: string } | null>(null);
  const deleteFn = useServerFn(adminDeleteAccount);
  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteFn({ data: { userId: deleting.user.id, confirmEmail: deleting.typed } });
      toast.success("Conta excluída.");
      setDeleting(null);
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível excluir a conta."); }
    finally { setBusy(false); }
  }
  const resetFn = useServerFn(adminResetPassword);
  const createFn = useServerFn(adminCreateAccount);
  async function doReset() {
    if (!resetTarget) return;
    setBusy(true);
    try {
      const r = await resetFn({ data: { userId: resetTarget.id } });
      setRevealed({ email: resetTarget.email ?? "", password: r.password });
      setResetTarget(null);
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível gerar a senha."); }
    finally { setBusy(false); }
  }
  async function doCreate() {
    if (!creating) return;
    setBusy(true);
    try {
      const r = await createFn({ data: { email: creating.email, name: creating.name, admin: creating.admin, organizationId: creating.organizationId || null } });
      setRevealed(r);
      setCreating(null);
      await refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Não foi possível criar a conta."); }
    finally { setBusy(false); }
  }
  const data = query.data;
  const accounts = useMemo(() => (data?.accounts ?? []).filter(u =>
    ((u.name ?? "") + " " + (u.email ?? "")).toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))
  ), [data, search]);
  if (!enabled) return null;
  if (query.isPending) return <p role="status">Carregando contas e acesso...</p>;
  if (query.isError || !data) return <Card><CardContent className="space-y-3 pt-6">
    <p role="alert">Não foi possível carregar a gestão. Confira a regra 0016 no banco e tente novamente.</p>
    <Button variant="outline" onClick={() => void refresh()}>Atualizar</Button>
  </CardContent></Card>;
  const label = (id: string | null) => data.accounts.find(u => u.id === id)?.name || data.accounts.find(u => u.id === id)?.email || "Conta";
  const orgLabel = (id: string | null) => data.organizations.find(o => o.id === id)?.name || "Organização";
  async function apply(input: { name: string; args: Record<string, unknown> }) {
    try {
      const result = await change.mutateAsync(input);
      toast.success(result === false ? "Os dados já estavam atualizados." : "Alteração registrada.");
      setConfirmation(null); setOrganization(null); setAccount(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível confirmar a alteração.");
    }
  }
  function editOrganization(org: AccessOrganization) {
    setOrganization({ id: org.id, name: org.name, slug: org.slug, notes: org.notes ?? "", updated: org.updated_at });
  }
  function eventDescription(event: AccessEvent) {
    if (event.action === "role_changed") return label(event.target_user_id) + ": " + (event.after_state?.["admin"] ? "Administrador" : "Cliente");
    if (event.action === "profile_updated") return String(event.before_state?.["name"] ?? "Sem nome") + " → " + String(event.after_state?.["name"] ?? "Sem nome");
    if (event.action === "organization_created" || event.action === "organization_updated") return String(event.after_state?.["name"] ?? orgLabel(event.organization_id));
    return label(event.target_user_id) + " em " + orgLabel(event.organization_id);
  }
  return <div className="space-y-6">
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Contas e funções</CardTitle>
        <div className="flex gap-2">
          <Button onClick={() => setCreating({ email: "", name: "", admin: false, organizationId: data.organizations[0]?.id ?? "" })} disabled={change.isPending || busy}>Nova conta</Button>
          <Button variant="outline" onClick={() => void refresh()} disabled={change.isPending}>Atualizar</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Gerencie as contas já cadastradas. Administradores têm acesso à gestão de todos os registros. Os vínculos com organizações são definidos abaixo.</p>
        <Label htmlFor="access-search">Buscar por nome ou e-mail</Label>
        <Input id="access-search" value={search} onChange={ev => setSearch(ev.target.value)} />
        {accounts.length === 0 && <p>Nenhuma conta encontrada.</p>}
        <div className="space-y-3">{accounts.map(user => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0">
            <p className="break-words font-medium">{user.name || user.email || "Sem nome"}</p>
            <p className="break-all text-sm text-muted-foreground">{user.email}</p>
            <p className="text-sm">{isAccountAdmin(user) ? "Administrador" : "Cliente"}{user.id === actorId ? " (sua conta)" : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={change.isPending} onClick={() => setAccount({ user, name: user.name ?? "" })}>Editar nome</Button>
            <Button size="sm" variant="outline" disabled={change.isPending || busy || user.id === actorId} onClick={() => setResetTarget(user)}>Nova senha provisória</Button>
            <Button size="sm" variant="destructive" disabled={change.isPending || busy || user.id === actorId} onClick={() => setDeleting({ user, typed: "" })}>Excluir conta</Button>
            <Button size="sm" variant="outline" disabled={change.isPending || (isAccountAdmin(user) && !mayDemote(user, actorId, data.accounts))}
              onClick={() => setConfirmation({
                title: isAccountAdmin(user) ? "Mudar para cliente?" : "Conceder acesso de administrador?",
                description: isAccountAdmin(user)
                  ? label(user.id) + " deixará de administrar o portal. Seus documentos e vínculos com organizações serão mantidos."
                  : label(user.id) + " poderá acessar e administrar todos os registros e gerenciar funções e organizações.",
                name: "admin_set_account_role",
                args: { _user: user.id, _role: isAccountAdmin(user) ? "cliente" : "admin", _expected_admin: isAccountAdmin(user) },
              })}>{isAccountAdmin(user) ? "Mudar para cliente" : "Tornar administrador"}</Button>
          </div>
        </div>)}</div>
        <p className="text-xs text-muted-foreground">Você mantém seu próprio acesso administrativo. O último administrador também fica protegido.</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Organizações e membros</CardTitle>
        <Button disabled={change.isPending} onClick={() => setOrganization({ id: crypto.randomUUID(), name: "", slug: "", notes: "", updated: null })}>Nova organização</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Um membro pode acessar os registros vinculados à organização. Adicionar ou retirar membros não muda a titularidade dos documentos.</p>
        {data.organizations.length === 0 && <p>Nenhuma organização cadastrada.</p>}
        {data.organizations.map(org => {
          const members = data.members.filter(m => m.organization_id === org.id);
          const available = data.accounts.filter(u => !members.some(m => m.user_id === u.id));
          return <div key={org.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-medium">{org.name}</p><p className="text-sm text-muted-foreground">{org.notes}</p></div>
              <Button size="sm" variant="outline" disabled={change.isPending} onClick={() => editOrganization(org)}>Editar organização</Button>
            </div>
            <div className="space-y-2">{members.map(member => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-2">
              <span>{label(member.user_id)}</span>
              <Button size="sm" variant="outline" disabled={change.isPending} onClick={() => setConfirmation({
                title: "Retirar vínculo com a organização?",
                description: label(member.user_id) + " deixará de ter acesso por vínculo com " + org.name + ". Acesso como administrador, por autoria ou por compartilhamento individual pode continuar.",
                name: "admin_set_organization_member",
                args: { _organization: org.id, _user: member.user_id, _member: false, _expected_member: true },
              })}>Retirar vínculo</Button>
            </div>)}</div>
            {members.length === 0 && <p className="text-sm text-muted-foreground">Sem membros.</p>}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={"member-" + org.id}>Adicionar conta existente</Label>
                <select id={"member-" + org.id} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={pendingMembers[org.id] ?? ""} disabled={change.isPending}
                  onChange={ev => setPendingMembers(prev => ({ ...prev, [org.id]: ev.target.value }))}>
                  <option value="">Selecione uma conta</option>
                  {available.map(user => <option key={user.id} value={user.id}>{user.name || user.email || "Sem nome"}</option>)}
                </select>
              </div>
              <Button disabled={change.isPending || !pendingMembers[org.id]} onClick={() => setConfirmation({
                title: "Adicionar membro?",
                description: label(pendingMembers[org.id] ?? null) + " terá acesso aos registros de " + org.name + ".",
                name: "admin_set_organization_member",
                args: { _organization: org.id, _user: pendingMembers[org.id], _member: true, _expected_member: false },
              })}>Adicionar</Button>
            </div>
          </div>;
        })}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Histórico de gestão</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Últimas 50 alterações de contas, funções e organizações.</p>
        {data.events.length === 0 && <p>Nenhuma alteração registrada nesta gestão.</p>}
        {data.events.map(event => <div key={event.id} className="border-b pb-3 last:border-0">
          <p className="font-medium">{ACCESS_ACTION_LABEL[event.action] ?? "Alteração registrada"}</p>
          <p className="break-words text-sm">{eventDescription(event)}</p>
          <p className="text-xs text-muted-foreground">{label(event.actor_id)} · {new Date(event.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
        </div>)}
      </CardContent>
    </Card>
    <AlertDialog open={!!confirmation} onOpenChange={open => { if (!open && !change.isPending) setConfirmation(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{confirmation?.title}</AlertDialogTitle><AlertDialogDescription>{confirmation?.description}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={change.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={change.isPending} onClick={ev => { ev.preventDefault(); if (confirmation) void apply(confirmation); }}>{change.isPending ? "Salvando..." : "Confirmar"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={!!organization} onOpenChange={open => { if (!open && !change.isPending) setOrganization(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{organization?.updated ? "Editar organização" : "Nova organização"}</DialogTitle></DialogHeader>
        {organization && <form className="space-y-4" onSubmit={ev => {
          ev.preventDefault();
          void apply({ name: "admin_save_organization", args: { _id: organization.id, _name: organization.name.trim(), _slug: organization.slug, _notes: organization.notes.trim() || null, _expected_updated_at: organization.updated } });
        }}>
          <div className="space-y-1"><Label htmlFor="org-name">Nome</Label><Input id="org-name" required minLength={2} maxLength={160} value={organization.name} onChange={ev => setOrganization({ ...organization, name: ev.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="org-slug">Identificador</Label><Input id="org-slug" required minLength={2} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" disabled={!!organization.updated} value={organization.slug} onChange={ev => setOrganization({ ...organization, slug: ev.target.value })} /><p className="text-xs text-muted-foreground">Use letras minúsculas, números e hífens. O identificador permanece fixo depois da criação.</p></div>
          <div className="space-y-1"><Label htmlFor="org-notes">Observações</Label><Textarea id="org-notes" maxLength={1000} value={organization.notes} onChange={ev => setOrganization({ ...organization, notes: ev.target.value })} /></div>
          <DialogFooter><Button type="button" variant="outline" disabled={change.isPending} onClick={() => setOrganization(null)}>Cancelar</Button><Button type="submit" disabled={change.isPending}>{change.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!account} onOpenChange={open => { if (!open && !change.isPending) setAccount(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar nome da conta</DialogTitle></DialogHeader>
        {account && <form className="space-y-4" onSubmit={ev => {
          ev.preventDefault(); void apply({ name: "admin_update_account_name", args: { _user: account.user.id, _name: account.name.trim(), _expected_name: account.user.name } });
        }}>
          <p className="break-all text-sm">{account.user.email}</p>
          <Label htmlFor="account-name">Nome</Label><Input id="account-name" required minLength={2} maxLength={160} value={account.name} onChange={ev => setAccount({ ...account, name: ev.target.value })} />
          <DialogFooter><Button type="button" variant="outline" disabled={change.isPending} onClick={() => setAccount(null)}>Cancelar</Button><Button type="submit" disabled={change.isPending}>{change.isPending ? "Salvando..." : "Salvar"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!resetTarget} onOpenChange={open => { if (!open && !busy) setResetTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Gerar nova senha provisória?</AlertDialogTitle>
          <AlertDialogDescription>A senha atual de {resetTarget ? label(resetTarget.id) : ""} deixará de funcionar. A pessoa terá que criar a própria senha no próximo acesso.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={busy} onClick={ev => { ev.preventDefault(); void doReset(); }}>{busy ? "Gerando..." : "Gerar senha"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <Dialog open={!!creating} onOpenChange={open => { if (!open && !busy) setCreating(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nova conta</DialogTitle></DialogHeader>
        {creating && <form className="space-y-4" onSubmit={ev => { ev.preventDefault(); void doCreate(); }}>
          <div className="space-y-1"><Label htmlFor="new-name">Nome</Label><Input id="new-name" required minLength={2} maxLength={160} value={creating.name} onChange={ev => setCreating({ ...creating, name: ev.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="new-email">E-mail de login</Label><Input id="new-email" type="email" required value={creating.email} onChange={ev => setCreating({ ...creating, email: ev.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="new-org">Organização</Label>
            <select id="new-org" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={creating.organizationId} onChange={ev => setCreating({ ...creating, organizationId: ev.target.value })}>
              <option value="">Nenhuma</option>
              {data.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={creating.admin} onChange={ev => setCreating({ ...creating, admin: ev.target.checked })} />Administrador</label>
          <p className="text-xs text-muted-foreground">Uma senha provisória será gerada e mostrada uma única vez. A pessoa cria a própria senha no primeiro acesso.</p>
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setCreating(null)}>Cancelar</Button><Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar conta"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Excluir conta?</DialogTitle></DialogHeader>
        {deleting && <form className="space-y-4" onSubmit={ev => { ev.preventDefault(); void doDelete(); }}>
          <p className="text-sm">A conta <strong className="break-all">{deleting.user.email}</strong> perderá o acesso definitivamente. Contas donas de marcas, documentos ou chamados não podem ser excluídas, para proteger esses dados.</p>
          <Label htmlFor="del-confirm">Digite o e-mail da conta para confirmar</Label>
          <Input id="del-confirm" value={deleting.typed} onChange={ev => setDeleting({ ...deleting, typed: ev.target.value })} />
          <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button type="submit" variant="destructive" disabled={busy || deleting.typed.trim().toLowerCase() !== (deleting.user.email ?? "").toLowerCase()}>{busy ? "Excluindo..." : "Excluir"}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
    <Dialog open={!!revealed} onOpenChange={open => { if (!open) setRevealed(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Senha provisória</DialogTitle></DialogHeader>
        {revealed && <div className="space-y-3">
          <p className="break-all text-sm">Login: <strong>{revealed.email}</strong></p>
          <p className="rounded-md border bg-muted p-3 font-mono text-lg select-all break-all">{revealed.password}</p>
          <p className="text-sm text-muted-foreground">Copie e envie à pessoa por um canal privado. Esta senha não será mostrada de novo; ela terá que trocá-la ao entrar.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(revealed.password); toast.success("Senha copiada."); }}>Copiar</Button>
            <Button onClick={() => setRevealed(null)}>Fechar</Button>
          </DialogFooter>
        </div>}
      </DialogContent>
    </Dialog>
  </div>;
}
