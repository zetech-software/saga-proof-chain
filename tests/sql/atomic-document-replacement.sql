\set ON_ERROR_STOP on
SELECT current_database() = 'portal_security_test' AS is_test_database \gset
\if :is_test_database
\else
  \echo 'Refusing to run outside portal_security_test'
  \quit 1
\endif
-- Fixtures exist only in the disposable CI database.
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TYPE public.app_role AS ENUM ('admin', 'cliente');
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
INSERT INTO public.user_roles VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin');
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE TABLE public.documents(
  id uuid PRIMARY KEY, created_by uuid, status text,
  storage_path text, file_name text, file_size bigint, mime_type text,
  archived_at timestamptz, deleted_at timestamptz
);
CREATE TABLE public.certificates(id uuid PRIMARY KEY, document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL);
INSERT INTO public.documents(id, created_by, status, storage_path, file_name, file_size, mime_type) VALUES (
  '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
  'recebido', '11111111-1111-4111-8111-111111111111/old.pdf', 'old.pdf', 10, 'application/pdf'
);
\ir ../../drizzle/migrations/0014_atomic_document_file_replacement.sql
COMMIT;

BEGIN;
CREATE FUNCTION public.test_replace(_actor uuid DEFAULT '11111111-1111-4111-8111-111111111111', _expected text DEFAULT '11111111-1111-4111-8111-111111111111/old.pdf')
RETURNS boolean LANGUAGE sql AS $$
 SELECT public.replace_document_file_atomic(
 '22222222-2222-4222-8222-222222222222', _actor, _expected,
 _actor::text || '/new.pdf', 'new.pdf', 20, 'application/pdf')
$$;
DO $$
DECLARE
  before_row jsonb;
  scenario text;
BEGIN
  IF has_function_privilege('authenticated', 'public.replace_document_file_atomic(uuid,uuid,text,text,text,bigint,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.replace_document_file_atomic(uuid,uuid,text,text,text,bigint,text)', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.replace_document_file_atomic(uuid,uuid,text,text,text,bigint,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Replacement RPC privileges are incorrect';
  END IF;
  FOREACH scenario IN ARRAY ARRAY['em_andamento','concluido','certificado_emitido','arquivado','excluido','outro_dono'] LOOP
    UPDATE public.documents SET
      status = CASE WHEN scenario IN ('em_andamento','concluido','certificado_emitido') THEN scenario ELSE 'recebido' END,
      archived_at = CASE WHEN scenario = 'arquivado' THEN now() ELSE NULL END,
      deleted_at = CASE WHEN scenario = 'excluido' THEN now() ELSE NULL END,
      created_by = CASE WHEN scenario = 'outro_dono' THEN 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid ELSE '11111111-1111-4111-8111-111111111111'::uuid END;
    SELECT to_jsonb(d) INTO before_row FROM public.documents d;
    IF public.test_replace() THEN RAISE EXCEPTION 'Client replacement allowed: %', scenario; END IF;
    IF before_row IS DISTINCT FROM (SELECT to_jsonb(d) FROM public.documents d) THEN
      RAISE EXCEPTION 'Blocked replacement changed row: %', scenario;
    END IF;
  END LOOP;
  UPDATE public.documents SET created_by = '11111111-1111-4111-8111-111111111111', status = 'recebido', archived_at = NULL, deleted_at = NULL;
  IF public.test_replace(_expected => 'stale.pdf') THEN RAISE EXCEPTION 'Stale file replacement allowed'; END IF;
  IF public.test_replace(_actor => NULL) THEN RAISE EXCEPTION 'Missing actor allowed'; END IF;
  FOREACH scenario IN ARRAY ARRAY['recebido','aguardando_documentacao'] LOOP
    UPDATE public.documents SET status = scenario, storage_path = '11111111-1111-4111-8111-111111111111/old.pdf';
    IF NOT public.test_replace() THEN RAISE EXCEPTION 'Valid client replacement denied: %', scenario; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.documents WHERE storage_path = '11111111-1111-4111-8111-111111111111/new.pdf'
      AND file_name = 'new.pdf' AND file_size = 20 AND mime_type = 'application/pdf' AND status = scenario) THEN
      RAISE EXCEPTION 'File metadata was not replaced';
    END IF;
  END LOOP;
  UPDATE public.documents SET status = 'recebido', storage_path = '11111111-1111-4111-8111-111111111111/old.pdf';
  INSERT INTO public.certificates VALUES ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222');
  IF public.test_replace() THEN RAISE EXCEPTION 'Client replacement with certificate allowed'; END IF;
  UPDATE public.documents SET status = 'concluido';
  IF NOT public.test_replace(_actor => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') THEN RAISE EXCEPTION 'Existing admin behavior was blocked'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.replace_document_file_atomic(
      '22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'old.pdf',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/new.pdf', 'new.pdf', 20, 'application/pdf');
    RAISE EXCEPTION 'Browser invoked privileged RPC with forged actor';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF public.replace_document_file_atomic(
    '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
    'stale.pdf', '11111111-1111-4111-8111-111111111111/new.pdf', 'new.pdf', 20, 'application/pdf') THEN
    RAISE EXCEPTION 'Service allowed stale path';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Atomic document replacement checks passed'
