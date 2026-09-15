-- Impede que um usuário autenticado consulte permissões/papéis de OUTRO usuário
-- através das funções SECURITY DEFINER. Quando não há sessão (service_role,
-- triggers internos), o comportamento permanece inalterado.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$function$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
    AND _org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = _user_id AND m.organization_id = _org_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.has_share(_user_id uuid, _type shared_resource_type, _resource_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
    AND _resource_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.resource_shares s
    WHERE s.user_id = _user_id AND s.resource_type = _type AND s.resource_id = _resource_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_document(_user_id uuid, _document_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
    AND _document_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = _document_id
      AND (
        d.created_by = _user_id
        OR public.is_org_member(_user_id, d.organization_id)
        OR public.has_share(_user_id, 'document', d.id)
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_trademark(_user_id uuid, _trademark_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
    AND _trademark_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trademarks t
    WHERE t.id = _trademark_id
      AND (
        t.created_by = _user_id
        OR public.is_org_member(_user_id, t.organization_id)
        OR public.has_share(_user_id, 'trademark', t.id)
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_view_storage_object(_user_id uuid, _bucket text, _path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id <> auth.uid() THEN false
    WHEN public.has_role(_user_id, 'admin') THEN true
    WHEN split_part(_path, '/', 1) = _user_id::text THEN true
    WHEN _bucket = 'documentos' THEN EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = _path
        AND (
          d.created_by = _user_id
          OR public.is_org_member(_user_id, d.organization_id)
          OR public.has_share(_user_id, 'document', d.id)
        )
    )
    WHEN _bucket = 'certificados' THEN EXISTS (
      SELECT 1 FROM public.certificates c
      WHERE c.storage_path = _path
        AND (
          public.can_view_document(_user_id, c.document_id)
          OR public.can_view_trademark(_user_id, c.trademark_id)
          OR public.has_share(_user_id, 'certificate', c.id)
        )
    )
    ELSE false
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_share(uuid, shared_resource_type, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_document(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_trademark(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_storage_object(uuid, text, text) FROM anon;
