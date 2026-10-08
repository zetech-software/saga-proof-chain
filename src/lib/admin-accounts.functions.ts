import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Senha provisória gerada no servidor: 14 caracteres, letras e números garantidos. */
function generateTemporaryPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b, i) =>
    i === 0 ? letters[b % letters.length] : i === 1 ? digits[b % digits.length] : all[b % all.length],
  );
  return chars.join("");
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!isAdmin) throw new Error("Acesso restrito a administradores.");
}

/**
 * Admin define nova senha provisória para outra conta. A senha é devolvida uma
 * única vez para o admin repassar; a pessoa é obrigada a trocá-la no próximo acesso.
 */
export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = generateTemporaryPassword();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password });
    if (error) throw new Error("Não foi possível definir a senha provisória.");
    await supabaseAdmin.from("password_change_required").upsert({ user_id: data.userId });
    await supabaseAdmin.from("admin_access_events").insert({
      actor_id: context.userId, target_user_id: data.userId, action: "password_reset",
    });
    return { password };
  });

/** Admin cria uma conta nova com senha provisória (troca obrigatória no 1º acesso). */
export const adminCreateAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      email: z.string().trim().toLowerCase().email().max(254),
      name: z.string().trim().min(2).max(160),
      admin: z.boolean(),
      organizationId: z.string().uuid().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const password = generateTemporaryPassword();
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email, password, email_confirm: true, user_metadata: { full_name: data.name },
    });
    if (error || !created.user) {
      throw new Error(/already|exists|registered/i.test(error?.message ?? "")
        ? "Já existe uma conta com este e-mail."
        : "Não foi possível criar a conta.");
    }
    const id = created.user.id;
    await supabaseAdmin.from("profiles").update({ full_name: data.name, email: data.email }).eq("id", id);
    await supabaseAdmin.from("password_change_required").upsert({ user_id: id });
    if (data.admin) await supabaseAdmin.from("user_roles").upsert({ user_id: id, role: "admin" }, { onConflict: "user_id,role" });
    if (data.organizationId) {
      await supabaseAdmin.from("organization_members").insert({ organization_id: data.organizationId, user_id: id });
    }
    await supabaseAdmin.from("admin_access_events").insert({
      actor_id: context.userId, target_user_id: id, organization_id: data.organizationId,
      action: "account_created", after_state: { email: data.email, name: data.name, admin: data.admin },
    });
    return { password, email: data.email };
  });
