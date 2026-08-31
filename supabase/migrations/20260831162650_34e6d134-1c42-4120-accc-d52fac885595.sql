-- 1. organization_id só pode apontar para organização do próprio usuário
DROP POLICY IF EXISTS documents_insert_authenticated ON public.documents;
CREATE POLICY documents_insert_authenticated ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    organization_id IS NULL
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_org_member(auth.uid(), organization_id)
  )
);

DROP POLICY IF EXISTS trademarks_insert_authenticated ON public.trademarks;
CREATE POLICY trademarks_insert_authenticated ON public.trademarks
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    organization_id IS NULL
    OR public.has_role(auth.uid(), 'admin')
    OR public.is_org_member(auth.uid(), organization_id)
  )
);

-- 2. Integridade dos compartilhamentos
CREATE OR REPLACE FUNCTION public.validate_resource_share()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ok boolean;
BEGIN
  IF NEW.resource_type = 'trademark' THEN
    SELECT EXISTS (SELECT 1 FROM public.trademarks WHERE id = NEW.resource_id) INTO ok;
  ELSIF NEW.resource_type = 'document' THEN
    SELECT EXISTS (SELECT 1 FROM public.documents WHERE id = NEW.resource_id) INTO ok;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.certificates WHERE id = NEW.resource_id) INTO ok;
  END IF;

  IF NOT ok THEN
    RAISE EXCEPTION 'recurso inexistente para o tipo informado';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER resource_shares_validate
BEFORE INSERT OR UPDATE ON public.resource_shares
FOR EACH ROW EXECUTE FUNCTION public.validate_resource_share();

-- 3. Storage: leitura de arquivos herda a permissão do registro correspondente
CREATE OR REPLACE FUNCTION public.can_view_storage_object(_user_id uuid, _bucket text, _path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN public.has_role(_user_id, 'admin') THEN true
    -- arquivo enviado pelo próprio usuário (prefixo do caminho)
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
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_storage_object(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_resource_share() FROM PUBLIC, anon;

DROP POLICY IF EXISTS documentos_select_auth ON storage.objects;
CREATE POLICY documentos_select_scoped ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'documentos' AND public.can_view_storage_object(auth.uid(), 'documentos', name));

DROP POLICY IF EXISTS certificados_select_auth ON storage.objects;
CREATE POLICY certificados_select_scoped ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'certificados' AND public.can_view_storage_object(auth.uid(), 'certificados', name));

-- upload de cliente continua permitido apenas na própria pasta
DROP POLICY IF EXISTS documentos_insert_auth ON storage.objects;
CREATE POLICY documentos_insert_scoped ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos'
  AND (public.has_role(auth.uid(), 'admin') OR split_part(name, '/', 1) = auth.uid()::text)
);