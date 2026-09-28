ALTER TABLE public.ai_usage_daily
  ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0;

-- Soma tokens reais devolvidos pelo provedor no agregado do dia. Só o servidor (service_role) executa.
CREATE OR REPLACE FUNCTION public.record_ai_tokens(_user uuid, _input integer, _output integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF _user IS NULL OR _input < 0 OR _output < 0 OR _input > 1000000 OR _output > 1000000 THEN RETURN; END IF;
  UPDATE public.ai_usage_daily
     SET input_tokens = input_tokens + _input, output_tokens = output_tokens + _output
   WHERE user_id = _user AND day = today;
END; $$;
REVOKE ALL ON FUNCTION public.record_ai_tokens(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_tokens(uuid, integer, integer) TO service_role;

DROP FUNCTION public.admin_ai_usage_summary();
CREATE FUNCTION public.admin_ai_usage_summary()
 RETURNS TABLE(user_id uuid, full_name text, email text, last_24h integer, last_7d integer, last_30d integer, total_90d integer, last_day date, input_tokens_30d bigint, output_tokens_30d bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $function$
DECLARE today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT p.id, COALESCE(p.full_name, p.email)::text, COALESCE(p.email, '')::text,
    (SELECT count(*)::int FROM public.ai_question_usage q WHERE q.user_id = p.id AND q.created_at > now() - interval '24 hours'),
    COALESCE((SELECT sum(d.count)::int FROM public.ai_usage_daily d WHERE d.user_id = p.id AND d.day > today - 7), 0),
    COALESCE((SELECT sum(d.count)::int FROM public.ai_usage_daily d WHERE d.user_id = p.id AND d.day > today - 30), 0),
    COALESCE((SELECT sum(d.count)::int FROM public.ai_usage_daily d WHERE d.user_id = p.id), 0),
    (SELECT max(d.day) FROM public.ai_usage_daily d WHERE d.user_id = p.id AND d.count > 0),
    COALESCE((SELECT sum(d.input_tokens)::bigint FROM public.ai_usage_daily d WHERE d.user_id = p.id AND d.day > today - 30), 0),
    COALESCE((SELECT sum(d.output_tokens)::bigint FROM public.ai_usage_daily d WHERE d.user_id = p.id AND d.day > today - 30), 0)
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = p.id AND r.role = 'admin')
  ORDER BY 7 DESC, 2;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_ai_usage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ai_usage_summary() TO authenticated, service_role;