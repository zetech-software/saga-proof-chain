-- 0017: target-role lookup, atomic purge, atomic document edit/archive,
-- certificates no longer reachable through a deleted parent.
-- Existing rows are not changed.

-- 1) has_role() answers only for the caller; read the target role directly.
CREATE OR REPLACE FUNCTION public.admin_set_account_role(
  _user uuid, _role public.app_role, _expected_admin boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  was_admin boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(7016001);
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = actor AND role = 'admin') THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  IF _user IS NULL OR _role IS NULL OR _expected_admin IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user) THEN
    RAISE EXCEPTION 'Conta invalida.';
  END IF;
  was_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user AND role = 'admin');
  IF was_admin IS DISTINCT FROM _expected_admin THEN
    RAISE EXCEPTION 'A funcao desta conta mudou. Atualize a lista.';
  END IF;
  IF _role = 'admin' AND was_admin OR _role = 'cliente' AND NOT was_admin THEN
    RETURN false;
  END IF;
  IF _role = 'cliente' THEN
    IF (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'O ultimo administrador deve manter seu acesso.';
    END IF;
    IF _user = actor THEN
      RAISE EXCEPTION 'Voce nao pode remover seu proprio acesso administrativo.';
    END IF;
    INSERT INTO public.user_roles(user_id, role) VALUES (_user, 'cliente') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id = _user AND role = 'admin';
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (_user, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  INSERT INTO public.admin_access_events(actor_id, target_user_id, action, before_state, after_state)
  VALUES (actor, _user, 'role_changed', jsonb_build_object('admin', was_admin), jsonb_build_object('admin', _role = 'admin'));
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_account_role(uuid, public.app_role, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_role(uuid, public.app_role, boolean) TO authenticated;

-- 2) Blocker check and permanent deletion in one transaction.
-- The row lock conflicts with any new child row (FK key-share lock);
-- the share-table lock serializes against new individual shares.
CREATE OR REPLACE FUNCTION public.purge_resource_atomic(
  _type text, _id uuid, _actor uuid, _expected_deleted_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  reasons text[] := '{}';
  r record;
BEGIN
  IF _actor IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _actor AND role = 'admin') THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  IF _type NOT IN ('trademark','document','certificate') OR _id IS NULL OR _expected_deleted_at IS NULL THEN
    RAISE EXCEPTION 'Item inválido.';
  END IF;
  LOCK TABLE public.resource_shares IN SHARE ROW EXCLUSIVE MODE;

  IF _type = 'trademark' THEN
    SELECT id, name AS title, deleted_at, NULL::text AS storage_path, NULL::text AS file_name, NULL::text AS status
      INTO r FROM public.trademarks WHERE id = _id FOR UPDATE;
  ELSIF _type = 'document' THEN
    SELECT id, title, deleted_at, storage_path, file_name, status
      INTO r FROM public.documents WHERE id = _id FOR UPDATE;
  ELSE
    SELECT id, title, deleted_at, storage_path, file_name, NULL::text AS status
      INTO r FROM public.certificates WHERE id = _id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item não encontrado.'; END IF;
  IF r.deleted_at IS NULL THEN
    RAISE EXCEPTION 'Primeiro exclua o item (ele vai para Excluídos). Só depois é possível excluir definitivamente.';
  END IF;
  IF r.deleted_at IS DISTINCT FROM _expected_deleted_at THEN
    RAISE EXCEPTION 'O item mudou durante a operação. Atualize a lista e revise novamente; nenhum arquivo foi removido.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.resource_shares WHERE resource_type::text = _type AND resource_id = _id) THEN
    reasons := array_append(reasons, 'compartilhamento ativo');
  END IF;
  IF _type = 'trademark' THEN
    IF EXISTS (SELECT 1 FROM public.documents WHERE trademark_id = _id) THEN reasons := array_append(reasons, 'documentos vinculados à marca'); END IF;
    IF EXISTS (SELECT 1 FROM public.certificates WHERE trademark_id = _id) THEN reasons := array_append(reasons, 'certificados vinculados à marca'); END IF;
  ELSIF _type = 'document' THEN
    IF EXISTS (SELECT 1 FROM public.certificates WHERE document_id = _id) THEN reasons := array_append(reasons, 'certificado vinculado'); END IF;
    IF EXISTS (SELECT 1 FROM public.documents WHERE related_document_id = _id) THEN reasons := array_append(reasons, 'envio adicional relacionado'); END IF;
    IF r.status IN ('concluido','certificado_emitido') THEN reasons := array_append(reasons, 'processo concluído'); END IF;
  END IF;
  IF array_length(reasons, 1) > 0 THEN
    RETURN jsonb_build_object('blocked', true, 'reasons', to_jsonb(reasons));
  END IF;

  IF _type = 'document' THEN
    DELETE FROM public.support_notifications WHERE document_id = _id;
    DELETE FROM public.resource_views WHERE resource_type = 'document' AND resource_id = _id;
    DELETE FROM public.documents WHERE id = _id;
  ELSIF _type = 'certificate' THEN
    DELETE FROM public.support_notifications WHERE certificate_id = _id;
    DELETE FROM public.resource_views WHERE resource_type = 'certificate' AND resource_id = _id;
    DELETE FROM public.certificates WHERE id = _id;
  ELSE
    DELETE FROM public.trademarks WHERE id = _id;
  END IF;
  RETURN jsonb_build_object('blocked', false, 'reasons', '[]'::jsonb, 'title', r.title,
    'storage_path', r.storage_path, 'file_name', r.file_name);
END $$;
REVOKE ALL ON FUNCTION public.purge_resource_atomic(text, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_resource_atomic(text, uuid, uuid, timestamptz) TO service_role;

-- 3) Edit / archive / unarchive: permission and state rechecked under the row lock,
-- change and history written in the same transaction.
CREATE OR REPLACE FUNCTION public.manage_document_atomic(
  _document uuid, _actor uuid, _action text,
  _title text DEFAULT NULL, _description text DEFAULT NULL,
  _admin_notes text DEFAULT NULL, _set_admin_notes boolean DEFAULT false
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d public.documents%ROWTYPE;
  is_admin boolean;
  certs integer;
BEGIN
  IF _document IS NULL OR _actor IS NULL OR _action NOT IN ('edit','archive','unarchive') THEN
    RAISE EXCEPTION 'Operação inválida.';
  END IF;
  is_admin := EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _actor AND role = 'admin');
  SELECT * INTO d FROM public.documents WHERE id = _document FOR UPDATE;
  IF NOT FOUND OR (NOT is_admin AND d.deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Documento não encontrado.';
  END IF;
  IF NOT is_admin AND d.created_by IS DISTINCT FROM _actor THEN
    RAISE EXCEPTION 'Sem permissão.';
  END IF;
  IF d.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Restaure o documento de Excluídos antes de alterá-lo.';
  END IF;
  SELECT count(*) INTO certs FROM public.certificates WHERE document_id = _document;

  IF _action = 'edit' THEN
    IF _title IS NULL OR length(btrim(_title)) NOT BETWEEN 2 AND 160 OR length(coalesce(_description,'')) > 1000
       OR length(coalesce(_admin_notes,'')) > 1000 THEN
      RAISE EXCEPTION 'Informe o título.';
    END IF;
    IF NOT is_admin AND (d.archived_at IS NOT NULL OR d.status NOT IN ('recebido','aguardando_documentacao')) THEN
      RAISE EXCEPTION 'Este documento não pode mais ser editado.';
    END IF;
    UPDATE public.documents SET title = btrim(_title), description = nullif(btrim(_description), ''),
      admin_notes = CASE WHEN is_admin AND _set_admin_notes THEN nullif(btrim(_admin_notes), '') ELSE admin_notes END
    WHERE id = _document;
    INSERT INTO public.document_events(document_id, actor_id, action, details) VALUES (_document, _actor, 'editado', '{}'::jsonb);
    RETURN 'ok';
  END IF;

  IF _action = 'archive' THEN
    IF d.archived_at IS NOT NULL THEN RETURN 'unchanged'; END IF;
    IF NOT is_admin AND (d.status <> 'recebido' OR certs > 0) THEN
      RAISE EXCEPTION 'Este documento faz parte de um processo ativo e não pode ser arquivado.';
    END IF;
    UPDATE public.documents SET archived_at = now(), archived_by = _actor WHERE id = _document;
    INSERT INTO public.document_events(document_id, actor_id, action, details) VALUES (_document, _actor, 'arquivado', '{}'::jsonb);
    RETURN 'ok';
  END IF;

  IF d.archived_at IS NULL THEN RETURN 'unchanged'; END IF;
  UPDATE public.documents SET archived_at = NULL, archived_by = NULL WHERE id = _document;
  INSERT INTO public.document_events(document_id, actor_id, action, details) VALUES (_document, _actor, 'restaurado', '{}'::jsonb);
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.manage_document_atomic(uuid, uuid, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_document_atomic(uuid, uuid, text, text, text, text, boolean) TO service_role;

-- 4) A deleted document or trademark no longer opens access to its certificates.
-- A certificate stays visible through another live link or a direct share.
CREATE OR REPLACE FUNCTION public.can_view_document(_user_id uuid, _document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
    AND _document_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = _document_id AND d.deleted_at IS NULL
      AND (d.created_by = _user_id
        OR public.is_org_member(_user_id, d.organization_id)
        OR public.has_share(_user_id, 'document', d.id)))
$$;
CREATE OR REPLACE FUNCTION public.can_view_trademark(_user_id uuid, _trademark_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
    AND _trademark_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trademarks t
    WHERE t.id = _trademark_id AND t.deleted_at IS NULL
      AND (t.created_by = _user_id
        OR public.is_org_member(_user_id, t.organization_id)
        OR public.has_share(_user_id, 'trademark', t.id)))
$$;
