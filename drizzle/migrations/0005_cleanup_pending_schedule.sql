CREATE TABLE IF NOT EXISTS public.internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.internal_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.internal_config TO service_role;
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.internal_config IS 'Internal server-only settings (service role only, no client access).';

INSERT INTO public.internal_config (key, value)
SELECT 'cleanup_pending_token', encode(extensions.gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.internal_config WHERE key = 'cleanup_pending_token');

SELECT cron.schedule(
  'cleanup-pending-uploads',
  '17 * * * *',
  $q$select net.http_post(
    url := 'https://project--21ce00b9-606b-4faa-9d00-76469ca6b106.lovable.app/api/public/cron/cleanup-pending',
    headers := jsonb_build_object('content-type','application/json','x-cron-secret',(select value from public.internal_config where key='cleanup_pending_token')),
    body := '{}'::jsonb
  )$q$
);