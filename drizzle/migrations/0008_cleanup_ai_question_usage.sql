-- Retenção: 2 dias (o maior limite é diário = 24h; 2 dias dão folga). Roda dentro do banco, diariamente às 03:41 UTC.
SELECT cron.schedule(
  'cleanup-ai-question-usage',
  '41 3 * * *',
  $q$DELETE FROM public.ai_question_usage WHERE created_at < now() - interval '2 days'$q$
);
COMMENT ON TABLE public.ai_question_usage IS 'Contador do limite do assistente (só user_id + horário). Registros com mais de 2 dias são apagados diariamente pelo job cleanup-ai-question-usage.';