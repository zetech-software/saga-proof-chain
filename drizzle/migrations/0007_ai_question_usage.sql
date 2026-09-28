-- Contador de uso do assistente (somente para limite). NÃO guarda pergunta, resposta nem contexto.
CREATE TABLE public.ai_question_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_question_usage TO authenticated;
GRANT ALL ON public.ai_question_usage TO service_role;
ALTER TABLE public.ai_question_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_select_own ON public.ai_question_usage FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY ai_usage_insert_own ON public.ai_question_usage FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
-- Sem UPDATE/DELETE: o cliente não consegue apagar o próprio uso para contornar o limite.
CREATE INDEX ai_question_usage_user_time ON public.ai_question_usage (user_id, created_at DESC);