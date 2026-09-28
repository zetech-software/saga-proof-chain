import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, Send } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { askProcessAssistant, type AskResult } from "@/lib/ai-assistant.functions";

const MAX = 500;
const SUGGESTIONS = [
  "Qual é meu status?",
  "Falta algum documento?",
  "Meu certificado está pronto?",
  "Qual é meu prazo estimado?",
];

const ERRORS: Record<Exclude<AskResult, { ok: true }>["code"] | "session", string> = {
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
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  async function submit(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    if (question.length > MAX) return setError(ERRORS.too_long);
    setLoading(true);
    setError(null);
    setAnswer(null);
    setAsked(question);
    try {
      const r = await ask({ data: { question } });
      if (r.ok) {
        setAnswer(r.answer);
        setQ("");
      } else setError(ERRORS[r.code] ?? ERRORS.ai_failed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(/unauthorized|jwt|session/i.test(msg) ? ERRORS.session : ERRORS.unavailable);
    } finally {
      setLoading(false);
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
              disabled={loading}
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
            <Button type="submit" size="sm" disabled={loading || !q.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Perguntar
            </Button>
          </div>
        </form>
        {(answer || error || loading) && (
          <div className="rounded-lg border border-border/60 bg-background/50 p-3 text-sm" aria-live="polite">
            {asked && <p className="mb-2 break-words text-xs text-muted-foreground">Pergunta: {asked}</p>}
            {loading && <p className="text-muted-foreground">Consultando seu painel…</p>}
            {error && <p className="text-destructive">{error}</p>}
            {answer && (
              <>
                <p className="whitespace-pre-line break-words">{answer}</p>
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
