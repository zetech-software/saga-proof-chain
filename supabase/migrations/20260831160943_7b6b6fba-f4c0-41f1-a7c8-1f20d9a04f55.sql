CREATE OR REPLACE FUNCTION public.me_account_status()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  roles text[],
  created_at timestamptz,
  last_sign_in_at timestamptz,
  email_confirmed_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    COALESCE(p.full_name, u.email)::text,
    COALESCE(p.email, u.email)::text,
    COALESCE(
      (SELECT array_agg(r.role::text ORDER BY r.role::text)
         FROM public.user_roles r WHERE r.user_id = u.id),
      ARRAY[]::text[]
    ),
    u.created_at,
    u.last_sign_in_at,
    u.email_confirmed_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.me_account_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.me_account_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.me_account_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_privacy_overview()
RETURNS TABLE (
  table_name text,
  rls_enabled boolean,
  policy_name text,
  command text,
  roles text[],
  using_expression text,
  check_expression text,
  is_broad boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    c.relname::text,
    c.relrowsecurity,
    pol.polname::text,
    CASE pol.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      ELSE 'ALL'
    END::text,
    COALESCE(
      (SELECT array_agg(rolname::text ORDER BY rolname::text)
         FROM pg_roles WHERE oid = ANY (pol.polroles)),
      ARRAY['public']::text[]
    ),
    COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '')::text,
    COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '')::text,
    (pol.polcmd IN ('r', '*') AND COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') IN ('', 'true'))
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy pol ON pol.polrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname, pol.polname;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_privacy_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_privacy_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_overview() TO authenticated;