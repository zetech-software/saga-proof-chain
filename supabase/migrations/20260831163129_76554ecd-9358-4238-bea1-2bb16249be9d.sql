CREATE TABLE public.page_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  page_title text,
  user_agent text,
  visited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX page_visits_user_visited_idx ON public.page_visits (user_id, visited_at DESC);
CREATE INDEX page_visits_visited_idx ON public.page_visits (visited_at DESC);

GRANT SELECT, INSERT ON public.page_visits TO authenticated;
GRANT ALL ON public.page_visits TO service_role;

ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY page_visits_insert_own ON public.page_visits
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY page_visits_select_own_or_admin ON public.page_visits
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY page_visits_delete_admin ON public.page_visits
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.admin_page_visit_summary()
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  visits bigint,
  first_visit_at timestamptz,
  last_visit_at timestamptz,
  last_path text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    v.user_id,
    COALESCE(p.full_name, p.email)::text,
    COALESCE(p.email, '')::text,
    count(*)::bigint,
    min(v.visited_at),
    max(v.visited_at),
    (SELECT lv.path FROM public.page_visits lv
      WHERE lv.user_id = v.user_id
      ORDER BY lv.visited_at DESC LIMIT 1)::text
  FROM public.page_visits v
  LEFT JOIN public.profiles p ON p.id = v.user_id
  GROUP BY v.user_id, p.full_name, p.email
  ORDER BY max(v.visited_at) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_page_visit_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_page_visit_summary() TO authenticated;