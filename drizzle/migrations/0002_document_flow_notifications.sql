ALTER TYPE public.support_notification_type ADD VALUE IF NOT EXISTS 'new_document';
ALTER TYPE public.support_notification_type ADD VALUE IF NOT EXISTS 'additional_document';
ALTER TYPE public.support_notification_type ADD VALUE IF NOT EXISTS 'document_status';
ALTER TYPE public.support_notification_type ADD VALUE IF NOT EXISTS 'documents_requested';
ALTER TYPE public.support_notification_type ADD VALUE IF NOT EXISTS 'certificate_available';

ALTER TABLE public.support_notifications ALTER COLUMN support_request_id DROP NOT NULL;
ALTER TABLE public.support_notifications ADD COLUMN IF NOT EXISTS document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE;
ALTER TABLE public.support_notifications ADD COLUMN IF NOT EXISTS certificate_id uuid REFERENCES public.certificates(id) ON DELETE CASCADE;
ALTER TABLE public.support_notifications ADD CONSTRAINT support_notifications_has_target
  CHECK (support_request_id IS NOT NULL OR document_id IS NOT NULL OR certificate_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS support_notifications_doc_uniq
  ON public.support_notifications (recipient_id, document_id, type) WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS support_notifications_cert_uniq
  ON public.support_notifications (recipient_id, certificate_id, type) WHERE certificate_id IS NOT NULL;

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS related_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS is_additional boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS documents_related_idx ON public.documents(related_document_id);

-- Quem realmente enxerga um documento (mesma regra do RLS, sem admins).
CREATE OR REPLACE FUNCTION public.document_viewer_ids(_doc uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u FROM (
    SELECT d.created_by AS u FROM public.documents d WHERE d.id = _doc
    UNION SELECT m.user_id FROM public.documents d
      JOIN public.organization_members m ON m.organization_id = d.organization_id WHERE d.id = _doc
    UNION SELECT s.user_id FROM public.resource_shares s
      WHERE s.resource_type = 'document' AND s.resource_id = _doc
  ) x
  WHERE u IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = x.u AND r.role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.trademark_viewer_ids(_tm uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT u FROM (
    SELECT t.created_by AS u FROM public.trademarks t WHERE t.id = _tm
    UNION SELECT m.user_id FROM public.trademarks t
      JOIN public.organization_members m ON m.organization_id = t.organization_id WHERE t.id = _tm
    UNION SELECT s.user_id FROM public.resource_shares s
      WHERE s.resource_type = 'trademark' AND s.resource_id = _tm
  ) x
  WHERE u IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = x.u AND r.role = 'admin')
$$;

-- Antes de inserir: cliente não define status/notas; envio adicional só se ligado a processo visível e aguardando documentação.
CREATE OR REPLACE FUNCTION public.documents_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_admin boolean;
  rel public.documents%ROWTYPE;
BEGIN
  is_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
  IF NOT is_admin THEN
    NEW.status := 'recebido';
    NEW.admin_notes := NULL;
    NEW.estimated_completion := NULL;
  END IF;
  NEW.is_additional := false;
  IF NEW.related_document_id IS NOT NULL THEN
    SELECT * INTO rel FROM public.documents WHERE id = NEW.related_document_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'processo relacionado inexistente';
    END IF;
    IF NOT is_admin AND NOT (NEW.created_by IN (SELECT public.document_viewer_ids(rel.id))) THEN
      RAISE EXCEPTION 'sem permissao para o processo relacionado';
    END IF;
    IF rel.status = 'aguardando_documentacao' THEN
      NEW.is_additional := true;
      IF NEW.trademark_id IS NULL THEN NEW.trademark_id := rel.trademark_id; END IF;
    ELSIF NOT is_admin THEN
      RAISE EXCEPTION 'este processo nao esta aguardando documentacao';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_before_insert BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_before_insert();

CREATE OR REPLACE FUNCTION public.notify_document_inserted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NULL OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.created_by AND role = 'admin') THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.support_notifications (recipient_id, document_id, type)
  SELECT ur.user_id, NEW.id,
    (CASE WHEN NEW.is_additional THEN 'additional_document' ELSE 'new_document' END)::public.support_notification_type
  FROM public.user_roles ur WHERE ur.role = 'admin'
  ON CONFLICT (recipient_id, document_id, type) WHERE document_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_notify_insert AFTER INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_document_inserted();

CREATE OR REPLACE FUNCTION public.notify_document_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.support_notification_type;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  t := (CASE WHEN NEW.status = 'aguardando_documentacao' THEN 'documents_requested' ELSE 'document_status' END)::public.support_notification_type;
  INSERT INTO public.support_notifications (recipient_id, document_id, type)
  SELECT v, NEW.id, t FROM public.document_viewer_ids(NEW.id) v
  WHERE v IS DISTINCT FROM auth.uid()
  ON CONFLICT (recipient_id, document_id, type) WHERE document_id IS NOT NULL
  DO UPDATE SET created_at = now(), read_at = NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER documents_notify_status AFTER UPDATE OF status ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.notify_document_status();

CREATE OR REPLACE FUNCTION public.notify_certificate_available()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.support_notifications (recipient_id, certificate_id, type)
  SELECT DISTINCT v, NEW.id, 'certificate_available'::public.support_notification_type FROM (
    SELECT public.document_viewer_ids(NEW.document_id) AS v WHERE NEW.document_id IS NOT NULL
    UNION SELECT public.trademark_viewer_ids(NEW.trademark_id) WHERE NEW.trademark_id IS NOT NULL
    UNION SELECT s.user_id FROM public.resource_shares s
      WHERE s.resource_type = 'certificate' AND s.resource_id = NEW.id
  ) x
  WHERE v IS NOT NULL
  ON CONFLICT (recipient_id, certificate_id, type) WHERE certificate_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER certificates_notify_insert AFTER INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.notify_certificate_available();

REVOKE EXECUTE ON FUNCTION public.document_viewer_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trademark_viewer_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.documents_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_document_inserted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_document_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_certificate_available() FROM PUBLIC, anon, authenticated;