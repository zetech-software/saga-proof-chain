import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AssistantUsage = {
  hourLeft: number;
  dayLeft: number;
  hourLimit: number;
  dayLimit: number;
  /** ISO do momento em que volta a haver pergunta disponível (só quando esgotado). */
  retryAt: string | null;
};

export type AskResult =
  | { ok: true; answer: string; links: { kind: "document" | "certificate" | "trademark"; id: string; label: string }[]; usage: AssistantUsage }
  | {
      ok: false;
      code: "invalid_input" | "too_long" | "empty" | "rate_hour" | "rate_day" | "no_process" | "unavailable" | "busy" | "ai_failed" | "not_client";
      usage?: AssistantUsage;
      /** true quando a tentativa já foi contada no limite (falha do provedor após o consumo). */
      counted?: boolean;
    };

/** Entrada permitida: exatamente { question: string }. Qualquer campo extra é REJEITADO. */
export const askInputSchema = z.object({ question: z.string() }).strict();

type StatusRow = { hour_used: number; day_used: number; hour_retry_at: string | null; day_retry_at: string | null };

function toUsage(s: StatusRow, limH: number, limD: number): AssistantUsage {
  const hourLeft = Math.max(0, limH - s.hour_used);
  const dayLeft = Math.max(0, limD - s.day_used);
  let retryAt: string | null = null;
  if (dayLeft === 0) retryAt = s.day_retry_at;
  else if (hourLeft === 0) retryAt = s.hour_retry_at;
  return { hourLeft, dayLeft, hourLimit: limH, dayLimit: limD, retryAt };
}

/** Saldo do próprio usuário. O id vem SEMPRE da sessão validada; não há entrada. */
export const getMyAssistantUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssistantUsage> => {
    const m = await import("./ai-assistant.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("ai_usage_status", { _user: context.userId });
    if (error || !data?.[0]) throw new Error("unavailable");
    return toUsage(data[0] as StatusRow, m.AI_LIMIT_HOUR, m.AI_LIMIT_DAY);
  });

/**
 * Assistente somente leitura. Ordem: validação da entrada → autenticação → montagem do
 * contexto autorizado → consumo do limite (atômico no banco) → chamada ao modelo.
 * Falha do provedor após o consumo: a pergunta continua contada (sem estorno).
 */
export const askProcessAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => askInputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AskResult> => {
    const { supabase, userId } = context;
    const m = await import("./ai-assistant.server");
    const question = data.question.trim();
    if (!question) return { ok: false, code: "empty" };
    if (question.length > m.AI_MAX_CHARS) return { ok: false, code: "too_long" };

    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if ((roles ?? []).some((r) => r.role === "admin")) return { ok: false, code: "not_client" };

    let ctx: Awaited<ReturnType<typeof m.buildContext>>;
    try {
      ctx = await m.buildContext(supabase, userId, m.pickTopics(question));
      if (ctx.empty) {
        const all = await m.buildContext(supabase, userId, new Set(["processos", "certificados", "marcas"]));
        if (all.empty) return { ok: false, code: "no_process" };
      }
    } catch (e: any) {
      console.error("[ai-assistant] contexto", e?.message);
      return { ok: false, code: "unavailable" };
    }

    // Consumo atômico: trava por usuário, confere 20/h e 100/24h, grava detalhe + agregado juntos.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error: consumeErr } = await supabaseAdmin.rpc("consume_ai_question", {
      _user: userId,
      _limit_hour: m.AI_LIMIT_HOUR,
      _limit_day: m.AI_LIMIT_DAY,
    });
    const c = rows?.[0];
    if (consumeErr || !c) return { ok: false, code: "unavailable" };
    const usage = toUsage(c as StatusRow, m.AI_LIMIT_HOUR, m.AI_LIMIT_DAY);
    if (!c.allowed) return { ok: false, code: c.reason === "rate_day" ? "rate_day" : "rate_hour", usage };

    try {
      const raw = await m.askModel(ctx.text, question);
      const { answer, links } = m.extractRefs(raw, ctx.refs);
      return { ok: true, answer, links, usage };
    } catch (e: any) {
      console.error("[ai-assistant] falha", e?.code ?? e?.message);
      return { ok: false, code: e?.code ?? "ai_failed", usage, counted: true };
    }
  });

export type AdminAiUsageRow = {
  user_id: string;
  full_name: string;
  email: string;
  last_24h: number;
  last_7d: number;
  last_30d: number;
  total_90d: number;
  last_day: string | null;
};
