DROP POLICY IF EXISTS documentos_insert_scoped ON storage.objects;
DROP POLICY IF EXISTS certificados_insert_admin ON storage.objects;

CREATE POLICY documentos_insert_pending ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos'
  AND split_part(name, '/', 1) = auth.uid()::text
  AND split_part(name, '/', 2) = 'pending'
  AND split_part(name, '/', 3) <> ''
  AND array_length(string_to_array(name, '/'), 1) = 3
);

CREATE POLICY certificados_insert_pending ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'certificados'
  AND public.has_role(auth.uid(), 'admin'::app_role)
  AND split_part(name, '/', 1) = auth.uid()::text
  AND split_part(name, '/', 2) = 'pending'
  AND split_part(name, '/', 3) <> ''
  AND array_length(string_to_array(name, '/'), 1) = 3
);

CREATE OR REPLACE FUNCTION public.can_view_storage_object(_user_id uuid, _bucket text, _path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN auth.uid() IS NOT NULL AND _user_id <> auth.uid() THEN false
    WHEN split_part(_path, '/', 2) = 'pending' THEN false
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

DROP POLICY IF EXISTS documents_insert_authenticated ON public.documents;
CREATE POLICY documents_insert_admin ON public.documents
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.reject_pending_storage_path()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.storage_path IS NOT NULL AND split_part(NEW.storage_path, '/', 2) = 'pending' THEN
    RAISE EXCEPTION 'arquivo ainda nao validado';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_pending_storage_path() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER documents_reject_pending BEFORE INSERT OR UPDATE OF storage_path ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.reject_pending_storage_path();
CREATE TRIGGER certificates_reject_pending BEFORE INSERT OR UPDATE OF storage_path ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.reject_pending_storage_path();