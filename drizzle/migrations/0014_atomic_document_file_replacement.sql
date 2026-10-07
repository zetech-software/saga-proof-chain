-- Server-only final authorization and file metadata update in one transaction.
-- No existing rows or Storage objects are changed when this migration is applied.
CREATE OR REPLACE FUNCTION public.replace_document_file_atomic(
  _document uuid, _actor uuid, _expected_path text, _new_path text,
  _file_name text, _file_size bigint, _mime_type text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  doc public.documents%ROWTYPE;
  is_admin boolean;
BEGIN
  IF _actor IS NULL OR _new_path IS NULL
     OR split_part(_new_path, '/', 1) <> _actor::text
     OR _new_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,160}$'
     OR _new_path = _expected_path
     OR _file_name IS NULL OR length(_file_name) NOT BETWEEN 1 AND 200
     OR _file_size IS NULL OR _file_size NOT BETWEEN 1 AND 52428800
     OR _mime_type IS NULL THEN
    RETURN false;
  END IF;

  -- FOR UPDATE also conflicts with the key-share lock taken by certificate
  -- inserts through their document_id foreign key. Whichever operation wins
  -- the lock is observed by the subsequent certificate check.
  SELECT * INTO doc FROM public.documents WHERE id = _document FOR UPDATE;
  IF NOT FOUND OR doc.storage_path IS DISTINCT FROM _expected_path THEN
    RETURN false;
  END IF;
  is_admin := public.has_role(_actor, 'admin'::public.app_role);
  IF NOT coalesce(is_admin, false) THEN
    IF doc.created_by IS DISTINCT FROM _actor
       OR doc.deleted_at IS NOT NULL
       OR doc.archived_at IS NOT NULL
       OR doc.status IS NULL
       OR doc.status NOT IN ('recebido', 'aguardando_documentacao')
       OR EXISTS (SELECT 1 FROM public.certificates WHERE document_id = _document) THEN
      RETURN false;
    END IF;
  END IF;

  UPDATE public.documents SET
    storage_path = _new_path, file_name = _file_name,
    file_size = _file_size, mime_type = _mime_type
  WHERE id = _document;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_document_file_atomic(uuid, uuid, text, text, text, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_document_file_atomic(uuid, uuid, text, text, text, bigint, text)
  TO service_role;
