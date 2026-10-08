REVOKE ALL ON public.admin_access_events FROM PUBLIC;
REVOKE ALL ON public.admin_access_events FROM anon;
REVOKE ALL ON public.admin_access_events FROM authenticated;
GRANT SELECT ON public.admin_access_events TO authenticated;
GRANT ALL ON public.admin_access_events TO service_role;