-- Create the certificate and optional document conclusion in one transaction.
-- This migration does not modify existing records or remove uploaded files.
CREATE OR REPLACE FUNCTION public.publish_certificate_atomic(
  _id uuid, _document uuid, _title text, _path text, _file_name text,
  _network text, _tx_hash text, _verification_url text, _notes text, _conclude boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  existing public.certificates%ROWTYPE;
  doc public.documents%ROWTYPE;
BEGIN
  IF actor IS NULL OR NOT coalesce(public.has_role(actor, 'admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'sem permissao';
  END IF;
  IF _id IS NULL OR _title IS NULL OR length(btrim(_title)) NOT BETWEEN 2 AND 160
     OR _conclude IS NULL OR (_conclude AND _document IS NULL) THEN
    RAISE EXCEPTION 'dados invalidos';
  END IF;
  IF _path IS NOT NULL THEN
    IF split_part(_path, '/', 1) <> actor::text
       OR _path !~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,160}$'
       OR _file_name IS NULL OR length(_file_name) NOT BETWEEN 1 AND 200
       OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'certificados' AND name = _path) THEN
      RAISE EXCEPTION 'arquivo nao validado';
    END IF;
  ELSIF _file_name IS NOT NULL THEN
    RAISE EXCEPTION 'arquivo invalido';
  END IF;

  -- A retry of the same request cannot insert a second certificate or
  -- conclude a document twice, including when the original response was lost.
  PERFORM pg_advisory_xact_lock(hashtextextended(_id::text, 0));
  SELECT * INTO existing FROM public.certificates WHERE id = _id;
  IF FOUND THEN
    IF existing.title IS DISTINCT FROM btrim(_title)
       OR existing.document_id IS DISTINCT FROM _document
       OR existing.storage_path IS DISTINCT FROM _path
       OR existing.file_name IS DISTINCT FROM _file_name
       OR existing.network IS DISTINCT FROM _network
       OR existing.tx_hash IS DISTINCT FROM _tx_hash
       OR existing.verification_url IS DISTINCT FROM _verification_url
       OR existing.notes IS DISTINCT FROM _notes THEN
      RAISE EXCEPTION 'envio ja registrado com dados diferentes';
    END IF;
    RETURN _id;
  END IF;

  IF _document IS NOT NULL THEN
    SELECT * INTO doc FROM public.documents WHERE id = _document FOR UPDATE;
    IF NOT FOUND OR doc.deleted_at IS NOT NULL OR doc.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'documento indisponivel';
    END IF;
  END IF;
  INSERT INTO public.certificates(id, document_id, title, storage_path, file_name, network, tx_hash, verification_url, notes)
  VALUES (_id, _document, btrim(_title), _path, _file_name, _network, _tx_hash, _verification_url, _notes);
  IF _conclude THEN
    UPDATE public.documents SET status = 'concluido' WHERE id = _document;
  END IF;
  RETURN _id;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_certificate_atomic(uuid, uuid, text, text, text, text, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_certificate_atomic(uuid, uuid, text, text, text, text, text, text, text, boolean)
  TO authenticated;
