import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AskResult =
  | { ok: true; answer: string }
  | { ok: false; code: "too_long" | "empty" | "rate_hour" | "rate_day" | "no_process" | "unavailable" | "busy" | "ai_failed" | "not_client" };

/**
 * Assistente somente leitura. Aceita APENAS { question }; qualquer outro campo
 * (ids, organização, usuário) é descartado pela validação.
 */
export const askProcessAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ question: z.string() }).parse(input))
  .handler(async ({ data, context }): Promise<AskResult> => {
    const { supabase, userId } = context;
    const m = await import("./ai-assistant.server");
    const question = data.question.trim();
    if (!question) return { ok: false, code: "empty" };
    if (question.length > m.AI_MAX_CHARS) return { ok: false, code: "too_long" };

    // Somente clientes (admin vê todos os dados via RLS e não usa o assistente nesta versão).
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if ((roles ?? []).some((r) => r.role === "admin")) return { ok: false, code: "not_client" };

    // Limite no servidor, por usuário.
    const now = Date.now();
    const dayAgo = new Date(now - 86_400_000).toISOString();
    const hourAgo = new Date(now - 3_600_000).toISOString();
    const [{ count: day }, { count: hour }] = await Promise.all([
      supabase.from("ai_question_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", dayAgo),
      supabase.from("ai_question_usage").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", hourAgo),
    ]);
    if ((day ?? 0) >= m.AI_LIMIT_DAY) return { ok: false, code: "rate_day" };
    if ((hour ?? 0) >= m.AI_LIMIT_HOUR) return { ok: false, code: "rate_hour" };

    try {
      const topics = m.pickTopics(question);
      const ctx = await m.buildContext(supabase, userId, topics);
      if (ctx.empty) {
        // Se não há nada visível em nenhum bloco, avisa sem gastar IA.
        const all = await m.buildContext(supabase, userId, new Set(["processos", "certificados", "marcas"]));
        if (all.empty) return { ok: false, code: "no_process" };
      }
      const { error: usageErr } = await supabase.from("ai_question_usage").insert({ user_id: userId });
      if (usageErr) return { ok: false, code: "unavailable" };
      const answer = await m.askModel(ctx.text, question);
      return { ok: true, answer };
    } catch (e: any) {
      console.error("[ai-assistant] falha", e?.code ?? e?.message);
      return { ok: false, code: e?.code ?? "ai_failed" };
    }
  });
