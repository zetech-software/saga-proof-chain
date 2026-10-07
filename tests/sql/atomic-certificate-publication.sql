\set ON_ERROR_STOP on
SELECT current_database() = 'portal_security_test' AS is_test_database \gset
\if :is_test_database
\else
  \echo 'Refusing to run outside portal_security_test'
  \quit 1
\endif
-- Extend only the disposable fixture created by the document replacement test.
BEGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE SCHEMA storage;
CREATE TABLE storage.objects(bucket_id text, name text);
ALTER TABLE public.certificates
  ADD COLUMN title text, ADD COLUMN storage_path text, ADD COLUMN file_name text,
  ADD COLUMN network text, ADD COLUMN tx_hash text, ADD COLUMN verification_url text, ADD COLUMN notes text;
\ir ../../drizzle/migrations/0015_atomic_certificate_publication.sql

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
INSERT INTO storage.objects VALUES ('certificados', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/test.pdf');
UPDATE public.documents SET status = 'recebido';
CREATE FUNCTION public.test_publish(_id uuid, _conclude boolean DEFAULT true, _path text DEFAULT 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/test.pdf')
RETURNS uuid LANGUAGE sql AS $$
 SELECT public.publish_certificate_atomic(_id, '22222222-2222-4222-8222-222222222222',
 'Atomic certificate', _path, 'test.pdf', 'Test network', 'TEST', NULL, NULL, _conclude)
$$;
CREATE FUNCTION public.test_fail_conclusion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.fail_conclusion', true) = 'true' AND NEW.status = 'concluido' THEN
    RAISE EXCEPTION 'simulated conclusion failure';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_fail_conclusion BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.test_fail_conclusion();

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.publish_certificate_atomic(uuid,uuid,text,text,text,text,text,text,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous publication is allowed';
  END IF;
  PERFORM set_config('test.fail_conclusion', 'true', true);
  BEGIN
    PERFORM public.test_publish('44444444-4444-4444-8444-444444444444');
    RAISE EXCEPTION 'Expected conclusion failure';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'simulated conclusion failure' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.certificates WHERE id = '44444444-4444-4444-8444-444444444444') THEN
    RAISE EXCEPTION 'Partial certificate survived failed conclusion';
  END IF;
  IF (SELECT status FROM public.documents) <> 'recebido' THEN
    RAISE EXCEPTION 'Failed conclusion changed document';
  END IF;
  PERFORM set_config('test.fail_conclusion', 'false', true);
END $$;

SET LOCAL ROLE authenticated;
SELECT public.test_publish('55555555-5555-4555-8555-555555555555');
-- Simulate a lost response by issuing exactly the same publication again.
SELECT public.test_publish('55555555-5555-4555-8555-555555555555');
RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.certificates WHERE id = '55555555-5555-4555-8555-555555555555') <> 1
    OR (SELECT status FROM public.documents) <> 'concluido' THEN
    RAISE EXCEPTION 'Publication or idempotency failed';
  END IF;
  BEGIN
    PERFORM public.test_publish('55555555-5555-4555-8555-555555555555', true, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/other.pdf');
    RAISE EXCEPTION 'Missing file accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'arquivo nao validado' THEN RAISE; END IF;
  END;
  UPDATE public.documents SET deleted_at = now();
  BEGIN
    PERFORM public.test_publish('66666666-6666-4666-8666-666666666666');
    RAISE EXCEPTION 'Deleted document accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'documento indisponivel' THEN RAISE; END IF;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.test_publish('77777777-7777-4777-8777-777777777777');
    RAISE EXCEPTION 'Client published an administrative certificate';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'sem permissao' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Atomic certificate publication checks passed'
