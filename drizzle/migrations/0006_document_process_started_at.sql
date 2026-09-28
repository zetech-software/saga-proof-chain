ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS process_started_at date,
  ADD COLUMN IF NOT EXISTS process_start_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS process_start_confirmed_at timestamptz;

COMMENT ON COLUMN public.documents.process_started_at IS 'Data real de início do processo, confirmada manualmente por admin (base da estimativa de prazo).';

CREATE OR REPLACE FUNCTION public.documents_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  rel public.documents%ROWTYPE;
BEGIN
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
$function$;

CREATE OR REPLACE FUNCTION public.documents_guard_process_start()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.process_started_at IS DISTINCT FROM OLD.process_started_at THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') THEN
      RAISE EXCEPTION 'somente admin pode definir a data de inicio do processo';
    END IF;
    IF NEW.process_started_at IS NULL THEN
      NEW.process_start_confirmed_by := NULL;
      NEW.process_start_confirmed_at := NULL;
    ELSE
      NEW.process_start_confirmed_by := auth.uid();
      NEW.process_start_confirmed_at := now();
    END IF;
  ELSE
    NEW.process_start_confirmed_by := OLD.process_start_confirmed_by;
    NEW.process_start_confirmed_at := OLD.process_start_confirmed_at;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.documents_guard_process_start() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER documents_guard_process_start
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_guard_process_start();