CREATE TABLE public.ai_usage_daily (
  user_id uuid NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
REVOKE ALL ON public.ai_usage_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.ai_usage_daily IS 'Agregado diário (America/Sao_Paulo) de perguntas ao assistente. Somente user_id, dia e quantidade.';

INSERT INTO public.ai_usage_daily (user_id, day, count)
SELECT user_id, (created_at AT TIME ZONE 'America/Sao_Paulo')::date, count(*)::int
FROM public.ai_question_usage GROUP BY 1, 2
ON CONFLICT (user_id, day) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ai_usage_status(_user uuid)
RETURNS TABLE(hour_used int, day_used int, hour_retry_at timestamptz, day_retry_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT
    (SELECT count(*)::int FROM public.ai_question_usage WHERE user_id = _user AND created_at > now() - interval '1 hour'),
    (SELECT count(*)::int FROM public.ai_question_usage WHERE user_id = _user AND created_at > now() - interval '24 hours'),
    (SELECT min(created_at) + interval '1 hour' FROM public.ai_question_usage WHERE user_id = _user AND created_at > now() - interval '1 hour'),
    (SELECT min(created_at) + interval '24 hours' FROM public.ai_question_usage WHERE user_id = _user AND created_at > now() - interval '24 hours')
$$;

CREATE OR REPLACE FUNCTION public.consume_ai_question(_user uuid, _limit_hour int DEFAULT 20, _limit_day int DEFAULT 100)
RETURNS TABLE(allowed boolean, reason text, hour_used int, day_used int, hour_retry_at timestamptz, day_retry_at timestamptz)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE s record;
BEGIN
  IF _user IS NULL THEN RAISE EXCEPTION 'user obrigatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_usage:' || _user::text));
  SELECT * INTO s FROM public.ai_usage_status(_user);
  IF s.day_used >= _limit_day THEN
    RETURN QUERY SELECT false, 'rate_day'::text, s.hour_used, s.day_used, s.hour_retry_at, s.day_retry_at; RETURN;
  END IF;
  IF s.hour_used >= _limit_hour THEN
    RETURN QUERY SELECT false, 'rate_hour'::text, s.hour_used, s.day_used, s.hour_retry_at, s.day_retry_at; RETURN;
  END IF;
  INSERT INTO public.ai_question_usage (user_id) VALUES (_user);
  INSERT INTO public.ai_usage_daily (user_id, day, count)
  VALUES (_user, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
  ON CONFLICT (user_id, day) DO UPDATE SET count = public.ai_usage_daily.count + 1;
  SELECT * INTO s FROM public.ai_usage_status(_user);
  RETURN QUERY SELECT true, NULL::text, s.hour_used, s.day_used, s.hour_retry_at, s.day_retry_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_usage_summary()
RETURNS TABLE(user_id uuid, full_name text, email text, last_24h int, last_7d int, last_30d int, total_90d int, last_day date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, COALESCE(p.full_name, p.email)::text, COALESCE(p.email, '')::text,
    (SELECT count(*)::int FROM public.ai_question_usage q WHERE q.user_id = p.id AND q.created_at > now() - interval '24 hours'),
    COALESCE((SELECT sum(d.count)::int FROM public.ai_usage_daily d WHERE d.user_id = p.id AND d.day > today - 7), 0),
    COALESCE((SELECT sum(d.count)::int FROM public.ai_usage_daily d WHERE d.user_id = p.id AND d.day > today - 30), 0),
    COALESCE((SELECT sum(d.count)::int FROM public.ai_usage_daily d WHERE d.user_id = p.id), 0),
    (SELECT max(d.day) FROM public.ai_usage_daily d WHERE d.user_id = p.id AND d.count > 0)
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
  ORDER BY 7 DESC, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.ai_usage_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_ai_question(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_ai_question(uuid, int, int) TO service_role;
REVOKE ALL ON FUNCTION public.admin_ai_usage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_summary() TO authenticated, service_role;

SELECT cron.unschedule('cleanup-ai-question-usage');
SELECT cron.schedule('cleanup-ai-question-usage', '41 3 * * *',
  $c$DELETE FROM public.ai_question_usage WHERE created_at < now() - interval '2 days';
     DELETE FROM public.ai_usage_daily WHERE day < (now() AT TIME ZONE 'America/Sao_Paulo')::date - 90;$c$);