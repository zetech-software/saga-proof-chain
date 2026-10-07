-- Normalize administrative fields at the database boundary for client inserts.
-- Existing rows are untouched; administrators and trusted server migrations
-- retain their original insert behavior.
CREATE OR REPLACE FUNCTION public.normalize_client_trademark_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  NEW.status := 'submetida';
  NEW.admin_notes := NULL;
  NEW.protocol_number := NULL;
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;
  NEW.submitted_at := now();
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_client_trademark_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trademarks_normalize_client_insert
BEFORE INSERT ON public.trademarks
FOR EACH ROW EXECUTE FUNCTION public.normalize_client_trademark_insert();

CREATE OR REPLACE FUNCTION public.normalize_client_support_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  NEW.status := 'aberta';
  NEW.admin_reply := NULL;
  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_client_support_insert() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER support_requests_normalize_client_insert
BEFORE INSERT ON public.support_requests
FOR EACH ROW EXECUTE FUNCTION public.normalize_client_support_insert();
