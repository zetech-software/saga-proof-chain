import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Bot, FileText, Loader2, Send, ShieldCheck, Stamp } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  askProcessAssistant,
  getMyAssistantUsage,
  type AskResult,
  type AssistantUsage,
} from "@/lib/ai-assistant.functions";

function spTime(iso: string) {
  const d = new Date(iso);
  const sameDay =
    d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) ===
    new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hm = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  if (sameDay) return hm;
  return `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })} às ${hm}`;
}

function limitMessage(u: AssistantUsage | undefined) {
  if (!u?.retryAt) return "Limite de perguntas atingido. Tente novamente mais tarde.";
  return `Limite atingido. Você poderá perguntar novamente por volta das ${spTime(u.retryAt)}.`;
}

const MAX = 500;
const SUGGESTIONS = [
  "Qual é meu status?",
  "Falta algum documento?",
  "Meu certificado está pronto?",
  "Qual é meu prazo estimado?",
];

type AssistantLink = Extract<AskResult, { ok: true }>["links"][number];

const LINK_META = {
  document: { to: "/painel/documentos", prefix: "doc", verb: "Ver documento", Icon: FileText },
  certificate: { to: "/painel/certificados", prefix: "cert", verb: "Ver certificado", Icon: ShieldCheck },
  trademark: { to: "/painel/marcas", prefix: "marca", verb: "Ver marca", Icon: Stamp },
} as const;

const ERRORS: Record<Exclude<AskResult, { ok: true }>["code"] | "session", string> = {
  invalid_input: "Pergunta inválida.",
  too_long: `Sua pergunta passou de ${MAX} caracteres. Tente resumir.`,
  empty: "Escreva uma pergunta.",
  rate_hour: "Você atingiu o limite de 20 perguntas por hora. Tente novamente mais tarde.",
  rate_day: "Você atingiu o limite de 100 perguntas por dia. Tente novamente amanhã.",
  no_process: "Ainda não há processos disponíveis no seu painel.",
  unavailable: "O assistente está temporariamente indisponível. Tente mais tarde.",
  busy: "O assistente está com muitas solicitações agora. Tente em alguns minutos.",
  ai_failed: "Não foi possível gerar a resposta agora. Tente novamente.",
  not_client: "O assistente está disponível apenas para clientes.",
  session: "Sua sessão expirou. Entre novamente para continuar.",
};

export function ProcessAssistant() {
  const ask = useServerFn(askProcessAssistant);
  const fetchUsage = useServerFn(getMyAssistantUsage);
  const qc = useQueryClient();
  const usageQ = useQuery({ queryKey: ["assistant-usage"], queryFn: () => fetchUsage(), refetchOnWindowFocus: true, staleTime: 10_000 });
  const usage = usageQ.data;
  const exhausted = !!usage && (usage.hourLeft === 0 || usage.dayLeft === 0);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [links, setLinks] = useState<AssistantLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  async function submit(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    if (question.length > MAX) return setError(ERRORS.too_long);
    setLoading(true);
    setError(null);
    setAnswer(null);
    setLinks([]);
    setAsked(question);
    try {
      const r = await ask({ data: { question } });
      if (r.usage) qc.setQueryData(["assistant-usage"], r.usage);
      if (r.ok) {
        setAnswer(r.answer);
        setLinks(r.links);
        setQ("");
      } else if (r.code === "rate_hour" || r.code === "rate_day") setError(limitMessage(r.usage));
      else setError((ERRORS[r.code] ?? ERRORS.ai_failed) + (r.counted ? " Esta tentativa contou no seu limite." : ""));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(/unauthorized|jwt|session/i.test(msg) ? ERRORS.session : ERRORS.unavailable);
    } finally {
      setLoading(false);
      qc.invalidateQueries({ queryKey: ["assistant-usage"] });
    }
  }

  return (
    <Card className="border-border/70 bg-card/60">
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 shrink-0 text-brand-hover" aria-hidden />
          <h2 className="text-sm font-medium">Pergunte sobre seus processos</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={loading || exhausted}
              onClick={() => submit(s)}
              className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-hover/50 hover:text-foreground disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(q);
          }}
          className="space-y-2"
        >
          <Textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(q);
              }
            }}
            maxLength={MAX}
            rows={2}
            placeholder="Ex.: Falta algum documento no meu processo?"
            aria-label="Sua pergunta"
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {q.length}/{MAX}
            </span>
            <Button type="submit" size="sm" disabled={loading || !q.trim() || exhausted}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Perguntar
            </Button>
          </div>
        </form>
        {usage && (
          <p className="text-[11px] leading-relaxed text-muted-foreground" aria-live="polite">
            {exhausted ? (
              <span className="text-destructive">{limitMessage(usage)}</span>
            ) : (
              <>
                <span className="whitespace-nowrap">{usage.hourLeft} de {usage.hourLimit} disponíveis nesta hora</span>
                {" · "}
                <span className="whitespace-nowrap">{usage.dayLeft} de {usage.dayLimit} disponíveis nas últimas 24h</span>
              </>
            )}
          </p>
        )}
        {(answer || error || loading) && (
          <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-sm" aria-live="polite">
            {asked && <p className="mb-2 break-words text-xs text-muted-foreground">Pergunta: {asked}</p>}
            {loading && <p className="text-muted-foreground">Consultando seu painel…</p>}
            {error && <p className="text-destructive">{error}</p>}
            {answer && (
              <>
                <p className="whitespace-pre-line break-words">{answer}</p>
                {links.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {links.map((l) => {
                      const meta = LINK_META[l.kind];
                      return (
                        <Link
                          key={l.kind + l.id}
                          to={meta.to}
                          hash={`${meta.prefix}-${l.id}`}
                          title={l.label}
                          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-brand-hover/50 hover:text-foreground"
                        >
                          <meta.Icon className="h-3.5 w-3.5 shrink-0 text-brand-hover" aria-hidden />
                          <span className="shrink-0">{meta.verb}</span>
                          {links.length > 1 && <span className="min-w-0 truncate">· {l.label}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Resposta gerada por IA com base nas informações disponíveis no seu painel.
                </p>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
