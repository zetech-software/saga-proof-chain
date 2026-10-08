import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const passwordSchema = z.object({
  password: z
    .string()
    .min(10, "Use pelo menos 10 caracteres.")
    .max(72, "Use no máximo 72 caracteres.")
    .regex(/[A-Za-z]/, "Inclua pelo menos uma letra.")
    .regex(/[0-9]/, "Inclua pelo menos um número."),
});

/**
 * Troca obrigatória de senha. O servidor confere a pendência da própria sessão,
 * grava a nova senha e só então libera o portal — o navegador não consegue
 * apenas apagar a pendência sem trocar a senha.
 */
export const completeRequiredPasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => passwordSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pending } = await supabaseAdmin
      .from("password_change_required")
      .select("user_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!pending) return { ok: true };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) {
      const weak = /weak|short|pwned|password/i.test(error.message);
      throw new Error(
        weak
          ? "Essa senha não foi aceita. Escolha uma senha mais forte."
          : "Não foi possível trocar a senha. Tente novamente.",
      );
    }
    await supabaseAdmin.from("password_change_required").delete().eq("user_id", context.userId);
    return { ok: true };
  });
