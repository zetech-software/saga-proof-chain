\set ON_ERROR_STOP on
SELECT current_database() = 'portal_real_roles_test' AS is_test_database \gset
\if :is_test_database
\else
  \echo 'Refusing to run outside portal_real_roles_test'
  \quit 1
\endif
-- Uses the production definition of has_role (answers only for the caller),
-- not a simplified stub. Fixtures exist only in this disposable database.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
CREATE TYPE public.app_role AS ENUM ('admin', 'cliente');
CREATE TYPE public.shared_resource_type AS ENUM ('trademark', 'document', 'certificate');
CREATE TABLE public.user_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL, UNIQUE(user_id, role));
INSERT INTO public.user_roles(user_id, role) VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin'),
 ('11111111-1111-4111-8111-111111111111','cliente'), ('22222222-2222-4222-8222-222222222222','cliente');
-- Production definition, copied verbatim.
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (auth.uid() IS NULL OR _user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE TABLE public.organizations(id uuid PRIMARY KEY, name text, slug text, notes text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.organization_members(organization_id uuid, user_id uuid);
CREATE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.organization_members WHERE user_id = _user_id AND organization_id = _org_id) $$;
CREATE TABLE public.resource_shares(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_type public.shared_resource_type, resource_id uuid, user_id uuid);
CREATE FUNCTION public.has_share(_user_id uuid, _type public.shared_resource_type, _id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM public.resource_shares WHERE user_id = _user_id AND resource_type = _type AND resource_id = _id) $$;
CREATE TABLE public.trademarks(id uuid PRIMARY KEY, name text, created_by uuid, organization_id uuid, deleted_at timestamptz);
CREATE TABLE public.documents(
  id uuid PRIMARY KEY, created_by uuid, organization_id uuid, trademark_id uuid REFERENCES public.trademarks(id),
  related_document_id uuid REFERENCES public.documents(id), title text, description text, admin_notes text,
  status text, storage_path text, file_name text, archived_at timestamptz, archived_by uuid, deleted_at timestamptz);
CREATE TABLE public.certificates(id uuid PRIMARY KEY, title text, document_id uuid REFERENCES public.documents(id),
  trademark_id uuid REFERENCES public.trademarks(id), storage_path text, file_name text, deleted_at timestamptz);
CREATE TABLE public.document_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid, actor_id uuid, action text, details jsonb);
CREATE TABLE public.support_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid REFERENCES public.documents(id), certificate_id uuid REFERENCES public.certificates(id));
CREATE TABLE public.resource_views(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_type public.shared_resource_type, resource_id uuid);
INSERT INTO public.trademarks VALUES ('70000000-0000-4000-8000-000000000001','Marca','11111111-1111-4111-8111-111111111111',NULL,NULL);
INSERT INTO public.documents(id, created_by, title, status, storage_path, file_name, trademark_id) VALUES
 ('d0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Recebido','recebido','11111111-1111-4111-8111-111111111111/a.pdf','a.pdf',NULL),
 ('d0000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Em andamento','em_andamento','11111111-1111-4111-8111-111111111111/b.pdf','b.pdf',NULL),
 ('d0000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Com certificado','recebido','11111111-1111-4111-8111-111111111111/c.pdf','c.pdf','70000000-0000-4000-8000-000000000001');
INSERT INTO public.certificates VALUES ('c0000000-0000-4000-8000-000000000001','Cert','d0000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000001',NULL,NULL,NULL);
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
\ir ../../drizzle/migrations/0016_admin_accounts_and_organizations.sql
\ir ../../drizzle/migrations/0017_target_roles_atomic_operations.sql
COMMIT;

-- 1) An admin can demote another admin with the real has_role.
BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF public.has_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin') THEN
    RAISE EXCEPTION 'Fixture assumption broken: has_role answered for another user';
  END IF;
  IF NOT public.admin_set_account_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cliente',true) THEN
    RAISE EXCEPTION 'Demoting another admin failed';
  END IF;
  BEGIN
    PERFORM public.admin_set_account_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cliente',true);
    RAISE EXCEPTION 'Stale demotion accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'A funcao desta conta mudou. Atualize a lista.' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.admin_set_account_role(auth.uid(),'cliente',true);
    RAISE EXCEPTION 'Last admin demoted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'O ultimo administrador deve manter seu acesso.' THEN RAISE; END IF; END;
  IF NOT public.admin_set_account_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin',false) THEN RAISE EXCEPTION 'Promotion failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
  BEGIN
    PERFORM public.admin_set_account_role(auth.uid(),'admin',false);
    RAISE EXCEPTION 'Client promoted itself';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Acesso restrito a administradores.' THEN RAISE; END IF; END;
END $$;
ROLLBACK;

-- 2) Document edit/archive rechecks owner, status, deletion and certificates.
BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE owner uuid := '11111111-1111-4111-8111-111111111111'; other uuid := '22222222-2222-4222-8222-222222222222';
BEGIN
  BEGIN PERFORM public.manage_document_atomic('d0000000-0000-4000-8000-000000000001', other, 'edit', 'Hack');
    RAISE EXCEPTION 'Other client edited';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Sem permissão.' THEN RAISE; END IF; END;
  IF public.manage_document_atomic('d0000000-0000-4000-8000-000000000001', owner, 'edit', 'Novo título', 'x') <> 'ok' THEN RAISE EXCEPTION 'Owner edit failed'; END IF;
  BEGIN PERFORM public.manage_document_atomic('d0000000-0000-4000-8000-000000000002', owner, 'edit', 'Título');
    RAISE EXCEPTION 'Edited in progress document';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Este documento não pode mais ser editado.' THEN RAISE; END IF; END;
  BEGIN PERFORM public.manage_document_atomic('d0000000-0000-4000-8000-000000000003', owner, 'archive');
    RAISE EXCEPTION 'Archived document with certificate';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Este documento faz parte de um processo ativo e não pode ser arquivado.' THEN RAISE; END IF; END;
  IF public.manage_document_atomic('d0000000-0000-4000-8000-000000000001', owner, 'archive') <> 'ok' THEN RAISE EXCEPTION 'Archive failed'; END IF;
  BEGIN PERFORM public.manage_document_atomic('d0000000-0000-4000-8000-000000000001', owner, 'edit', 'Arquivado');
    RAISE EXCEPTION 'Edited archived document';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Este documento não pode mais ser editado.' THEN RAISE; END IF; END;
  UPDATE public.documents SET deleted_at = now() WHERE id = 'd0000000-0000-4000-8000-000000000002';
  BEGIN PERFORM public.manage_document_atomic('d0000000-0000-4000-8000-000000000002', owner, 'archive');
    RAISE EXCEPTION 'Changed deleted document';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Documento não encontrado.' THEN RAISE; END IF; END;
  IF (SELECT count(*) FROM public.document_events) <> 2 THEN RAISE EXCEPTION 'History not written exactly once per change'; END IF;
END $$;
ROLLBACK;
DO $$ BEGIN
  IF has_function_privilege('authenticated','public.manage_document_atomic(uuid,uuid,text,text,text,text,boolean)','EXECUTE')
  OR has_function_privilege('authenticated','public.purge_resource_atomic(text,uuid,uuid,timestamptz)','EXECUTE') THEN
    RAISE EXCEPTION 'Browser sessions can call server-only operations';
  END IF;
END $$;

-- 3) Permanent deletion: blockers and deletion in one locked operation.
BEGIN;
SET LOCAL ROLE service_role;
UPDATE public.documents SET deleted_at = '2026-10-01' WHERE id IN ('d0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000003');
DO $$
DECLARE admin uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; r jsonb;
BEGIN
  BEGIN PERFORM public.purge_resource_atomic('document','d0000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','2026-10-01');
    RAISE EXCEPTION 'Client purged';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Sem permissão.' THEN RAISE; END IF; END;
  r := public.purge_resource_atomic('document','d0000000-0000-4000-8000-000000000003',admin,'2026-10-01');
  IF NOT (r->>'blocked')::boolean OR NOT r->'reasons' ? 'certificado vinculado' THEN RAISE EXCEPTION 'Linked certificate did not block: %', r; END IF;
  BEGIN PERFORM public.purge_resource_atomic('document','d0000000-0000-4000-8000-000000000001',admin,'2026-09-01');
    RAISE EXCEPTION 'Stale deletion accepted';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'O item mudou%' THEN RAISE; END IF; END;
  INSERT INTO public.resource_shares(resource_type, resource_id, user_id) VALUES ('document','d0000000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222');
  r := public.purge_resource_atomic('document','d0000000-0000-4000-8000-000000000001',admin,'2026-10-01');
  IF NOT (r->>'blocked')::boolean THEN RAISE EXCEPTION 'Share did not block'; END IF;
  DELETE FROM public.resource_shares;
  INSERT INTO public.support_notifications(document_id) VALUES ('d0000000-0000-4000-8000-000000000001');
  r := public.purge_resource_atomic('document','d0000000-0000-4000-8000-000000000001',admin,'2026-10-01');
  IF (r->>'blocked')::boolean OR r->>'storage_path' <> '11111111-1111-4111-8111-111111111111/a.pdf' THEN RAISE EXCEPTION 'Purge failed: %', r; END IF;
  IF EXISTS (SELECT 1 FROM public.documents WHERE id = 'd0000000-0000-4000-8000-000000000001')
  OR EXISTS (SELECT 1 FROM public.support_notifications) THEN RAISE EXCEPTION 'Purge left rows behind'; END IF;
END $$;
ROLLBACK;

-- 4) A deleted parent no longer opens access to its certificate.
BEGIN;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $$ BEGIN
  IF NOT public.can_view_trademark(auth.uid(),'70000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Owner lost live trademark'; END IF;
  UPDATE public.trademarks SET deleted_at = now();
  UPDATE public.documents SET deleted_at = now() WHERE id = 'd0000000-0000-4000-8000-000000000003';
  IF public.can_view_trademark(auth.uid(),'70000000-0000-4000-8000-000000000001')
  OR public.can_view_document(auth.uid(),'d0000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'Deleted parent still grants access';
  END IF;
  INSERT INTO public.resource_shares(resource_type, resource_id, user_id) VALUES ('certificate','c0000000-0000-4000-8000-000000000001',auth.uid());
  IF NOT public.has_share(auth.uid(),'certificate','c0000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Direct share lost'; END IF;
END $$;
ROLLBACK;
\echo 'Real has_role and atomic operation checks passed'
