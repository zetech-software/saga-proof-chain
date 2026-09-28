-- Exclusão recuperável: marcas, documentos e certificados vão para "Excluídos" antes de qualquer remoção.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.trademarks ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;
ALTER TABLE public.certificates ADD COLUMN IF NOT EXISTS deleted_at timestamptz, ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- deleted_at/deleted_by só mudam pelo servidor (service_role).
CREATE OR REPLACE FUNCTION public.guard_soft_delete_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by)
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'exclusao so pelo servidor';
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.guard_soft_delete_columns() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER documents_guard_soft_delete BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.guard_soft_delete_columns();
CREATE TRIGGER trademarks_guard_soft_delete BEFORE UPDATE ON public.trademarks FOR EACH ROW EXECUTE FUNCTION public.guard_soft_delete_columns();
CREATE TRIGGER certificates_guard_soft_delete BEFORE UPDATE ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.guard_soft_delete_columns();

-- Itens em "Excluídos" somem para clientes; admin continua vendo.
DROP POLICY IF EXISTS documents_select_scoped ON public.documents;
CREATE POLICY documents_select_scoped ON public.documents FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR (deleted_at IS NULL AND (
    created_by = auth.uid() OR is_org_member(auth.uid(), organization_id) OR has_share(auth.uid(), 'document'::shared_resource_type, id))));
DROP POLICY IF EXISTS trademarks_select_scoped ON public.trademarks;
CREATE POLICY trademarks_select_scoped ON public.trademarks FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR (deleted_at IS NULL AND (
    created_by = auth.uid() OR is_org_member(auth.uid(), organization_id) OR has_share(auth.uid(), 'trademark'::shared_resource_type, id))));
DROP POLICY IF EXISTS certificates_select_scoped ON public.certificates;
CREATE POLICY certificates_select_scoped ON public.certificates FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin'::app_role) OR (deleted_at IS NULL AND (
    can_view_document(auth.uid(), document_id) OR can_view_trademark(auth.uid(), trademark_id) OR has_share(auth.uid(), 'certificate'::shared_resource_type, id))));

CREATE OR REPLACE FUNCTION public.can_view_storage_object(_user_id uuid, _bucket text, _path text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id <> auth.uid() THEN false
    WHEN split_part(_path, '/', 2) = 'pending' THEN false
    WHEN public.has_role(_user_id, 'admin') THEN true
    WHEN _bucket = 'documentos' AND EXISTS (SELECT 1 FROM public.documents d WHERE d.storage_path = _path AND d.deleted_at IS NOT NULL) THEN false
    WHEN _bucket = 'certificados' AND EXISTS (SELECT 1 FROM public.certificates c WHERE c.storage_path = _path AND c.deleted_at IS NOT NULL) THEN false
    WHEN split_part(_path, '/', 1) = _user_id::text THEN true
    WHEN _bucket = 'documentos' THEN EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = _path AND d.deleted_at IS NULL
        AND (d.created_by = _user_id OR public.is_org_member(_user_id, d.organization_id) OR public.has_share(_user_id, 'document', d.id)))
    WHEN _bucket = 'certificados' THEN EXISTS (
      SELECT 1 FROM public.certificates c
      WHERE c.storage_path = _path AND c.deleted_at IS NULL
        AND (public.can_view_document(_user_id, c.document_id) OR public.can_view_trademark(_user_id, c.trademark_id) OR public.has_share(_user_id, 'certificate', c.id)))
    ELSE false
  END
$function$;

-- Nenhuma exclusão direta pelo navegador: tudo passa pelo servidor com regras e registro.
DROP POLICY IF EXISTS documents_delete_admin ON public.documents;
DROP POLICY IF EXISTS trademarks_delete_admin ON public.trademarks;
DROP POLICY IF EXISTS certificates_delete_admin ON public.certificates;
DROP POLICY IF EXISTS documentos_delete_admin ON storage.objects;
DROP POLICY IF EXISTS certificados_delete_admin ON storage.objects;

-- Registro de exclusões, restaurações e marcações.
CREATE TABLE public.resource_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('user','organization','trademark','document','certificate','restoration')),
  resource_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('excluido','restaurado','excluido_definitivamente','marcado_teste','desmarcado_teste','restauracao_aprovada','restauracao_ignorada')),
  actor_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.resource_lifecycle_events TO authenticated;
GRANT ALL ON public.resource_lifecycle_events TO service_role;
ALTER TABLE public.resource_lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY resource_lifecycle_events_select_admin ON public.resource_lifecycle_events
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE INDEX resource_lifecycle_events_idx ON public.resource_lifecycle_events (resource_type, resource_id, created_at DESC);

-- Marcação explícita de teste. Nada é marcado automaticamente.
CREATE TABLE public.test_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('user','organization','trademark','document','certificate')),
  resource_id uuid NOT NULL,
  marked_by uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id)
);
GRANT SELECT ON public.test_markers TO authenticated;
GRANT ALL ON public.test_markers TO service_role;
ALTER TABLE public.test_markers ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_markers_select_admin ON public.test_markers
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Revisão de restauração: itens vindos da cópia anterior, cada um aprovado individualmente.
CREATE TABLE public.restoration_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_label text NOT NULL,
  resource_type text NOT NULL CHECK (resource_type IN ('user','profile','user_role','organization','organization_member','trademark','document','certificate','resource_share','storage_object','support_notification','page_visit','resource_view','other')),
  previous_id uuid,
  title text,
  owner_label text,
  organization_label text,
  original_date timestamptz,
  file_bucket text,
  file_path text,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision text NOT NULL DEFAULT 'pendente' CHECK (decision IN ('pendente','restaurado','ignorado')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.restoration_candidates TO authenticated;
GRANT ALL ON public.restoration_candidates TO service_role;
ALTER TABLE public.restoration_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY restoration_candidates_select_admin ON public.restoration_candidates
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Durante uma restauração aprovada, os gatilhos não normalizam dados nem disparam avisos.
CREATE OR REPLACE FUNCTION public.documents_before_insert()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  is_admin boolean;
  rel public.documents%ROWTYPE;
BEGIN
  IF current_setting('app.restoring', true) = 'on' THEN RETURN NEW; END IF;
  is_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
  IF NOT is_admin THEN
    NEW.status := 'recebido';
    NEW.admin_notes := NULL;
    NEW.estimated_completion := NULL;
    NEW.process_started_at := NULL;
    NEW.process_start_confirmed_by := NULL;
    NEW.process_start_confirmed_at := NULL;
  ELSIF NEW.process_started_at IS NOT NULL THEN
    NEW.process_start_confirmed_by := auth.uid();
    NEW.process_start_confirmed_at := now();
  ELSE
    NEW.process_start_confirmed_by := NULL;
    NEW.process_start_confirmed_at := NULL;
  END IF;
  NEW.is_additional := false;
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;
  IF NEW.related_document_id IS NOT NULL THEN
    SELECT * INTO rel FROM public.documents WHERE id = NEW.related_document_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'processo relacionado inexistente'; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_document_inserted()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF current_setting('app.restoring', true) = 'on' THEN RETURN NEW; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_certificate_available()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF current_setting('app.restoring', true) = 'on' THEN RETURN NEW; END IF;
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
$function$;

-- Restaura UM item aprovado a partir da cópia anterior. Nunca sobrescreve: falha se o id já existir.
CREATE OR REPLACE FUNCTION public.restore_candidate(_candidate uuid, _actor uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.restoration_candidates%ROWTYPE; p jsonb;
BEGIN
  SELECT * INTO c FROM public.restoration_candidates WHERE id = _candidate FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item de restauracao inexistente'; END IF;
  IF c.decision <> 'pendente' THEN RAISE EXCEPTION 'item ja decidido'; END IF;
  IF c.previous_id IS NULL THEN RAISE EXCEPTION 'item sem id anterior'; END IF;
  p := c.payload || jsonb_build_object('id', c.previous_id);
  PERFORM set_config('app.restoring', 'on', true);
  IF c.resource_type = 'organization' THEN
    IF EXISTS (SELECT 1 FROM public.organizations WHERE id = c.previous_id) THEN RAISE EXCEPTION 'conflito: ja existe'; END IF;
    INSERT INTO public.organizations SELECT * FROM jsonb_populate_record(NULL::public.organizations, p);
  ELSIF c.resource_type = 'organization_member' THEN
    IF EXISTS (SELECT 1 FROM public.organization_members WHERE id = c.previous_id) THEN RAISE EXCEPTION 'conflito: ja existe'; END IF;
    INSERT INTO public.organization_members SELECT * FROM jsonb_populate_record(NULL::public.organization_members, p);
  ELSIF c.resource_type = 'trademark' THEN
    IF EXISTS (SELECT 1 FROM public.trademarks WHERE id = c.previous_id) THEN RAISE EXCEPTION 'conflito: ja existe'; END IF;
    INSERT INTO public.trademarks SELECT * FROM jsonb_populate_record(NULL::public.trademarks, p);
  ELSIF c.resource_type = 'document' THEN
    IF EXISTS (SELECT 1 FROM public.documents WHERE id = c.previous_id) THEN RAISE EXCEPTION 'conflito: ja existe'; END IF;
    INSERT INTO public.documents SELECT * FROM jsonb_populate_record(NULL::public.documents, p);
  ELSIF c.resource_type = 'certificate' THEN
    IF EXISTS (SELECT 1 FROM public.certificates WHERE id = c.previous_id) THEN RAISE EXCEPTION 'conflito: ja existe'; END IF;
    INSERT INTO public.certificates SELECT * FROM jsonb_populate_record(NULL::public.certificates, p);
  ELSIF c.resource_type = 'resource_share' THEN
    IF EXISTS (SELECT 1 FROM public.resource_shares WHERE id = c.previous_id) THEN RAISE EXCEPTION 'conflito: ja existe'; END IF;
    INSERT INTO public.resource_shares SELECT * FROM jsonb_populate_record(NULL::public.resource_shares, p);
  ELSE
    RAISE EXCEPTION 'tipo exige restauracao assistida pelo suporte';
  END IF;
  UPDATE public.restoration_candidates SET decision = 'restaurado', decided_by = _actor, decided_at = now() WHERE id = _candidate;
  INSERT INTO public.resource_lifecycle_events (resource_type, resource_id, action, actor_id, details)
  VALUES ('restoration', _candidate, 'restauracao_aprovada', _actor, jsonb_build_object('tipo', c.resource_type, 'id_anterior', c.previous_id));
  RETURN 'ok';
END; $$;
REVOKE EXECUTE ON FUNCTION public.restore_candidate(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_candidate(uuid, uuid) TO service_role;