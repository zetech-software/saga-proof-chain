export type AccessAccount = { id: string; name: string | null; email: string | null; roles: string[]; };
export type AccessOrganization = { id: string; name: string; slug: string; notes: string | null; updated_at: string; };
export type AccessMember = { organization_id: string; user_id: string; };
export type AccessEvent = { id: string; actor_id: string; target_user_id: string | null; organization_id: string | null; action: string; before_state: Record<string, unknown> | null; after_state: Record<string, unknown> | null; created_at: string; };
export type AccessData = { accounts: AccessAccount[]; organizations: AccessOrganization[]; members: AccessMember[]; events: AccessEvent[]; };
export function isAccountAdmin(account: AccessAccount) { return account.roles.includes("admin"); }
export function mayDemote(account: AccessAccount, actorId: string, accounts: AccessAccount[]) {
  return isAccountAdmin(account) && account.id !== actorId && accounts.filter(isAccountAdmin).length > 1;
}
export const ACCESS_ACTION_LABEL: Record<string, string> = {
  role_changed: "Função alterada", member_added: "Membro adicionado", member_removed: "Vínculo removido",
  organization_created: "Organização criada", organization_updated: "Organização atualizada", profile_updated: "Nome atualizado",
};
