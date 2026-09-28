ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

CREATE TABLE public.document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  actor_id uuid,
  action text NOT NULL CHECK (action IN ('editado','arquivo_substituido','arquivado','restaurado','excluido')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_events TO authenticated;
GRANT ALL ON public.document_events TO service_role;
ALTER TABLE public.document_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_events_select_admin ON public.document_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX document_events_document_idx ON public.document_events (document_id, created_at DESC);

-- archived_at/archived_by só mudam pelo servidor (service_role) ou por admin.
CREATE OR REPLACE FUNCTION public.documents_guard_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.archived_by IS DISTINCT FROM OLD.archived_by)
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'sem permissao para arquivar';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.documents_guard_archive() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER documents_guard_archive BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_guard_archive();