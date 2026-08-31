CREATE OR REPLACE FUNCTION public.admin_list_user_activity()
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  roles text[],
  created_at timestamptz,
  last_sign_in_at timestamptz
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
    u.id,
    COALESCE(p.full_name, u.email)::text,
    COALESCE(p.email, u.email)::text,
    COALESCE(
      (SELECT array_agg(r.role::text ORDER BY r.role::text) FROM public.user_roles r WHERE r.user_id = u.id),
      ARRAY[]::text[]
    ),
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_activity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_user_activity() TO authenticated;