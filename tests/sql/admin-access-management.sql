\set ON_ERROR_STOP on
SELECT current_database() = 'portal_security_test' AS is_test_database \gset
\if :is_test_database
\else
  \echo 'Refusing to run outside portal_security_test'
  \quit 1
\endif
-- Fixtures use only the disposable CI database from the preceding SQL tests.
BEGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
INSERT INTO auth.users VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin@example.test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'other@example.test'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'client@example.test'),
 ('11111111-1111-4111-8111-111111111111', 'owner@example.test');
GRANT USAGE ON SCHEMA auth TO authenticated;
ALTER TABLE public.user_roles ADD COLUMN id uuid DEFAULT gen_random_uuid(),
  ADD CONSTRAINT test_unique_role UNIQUE(user_id, role);
INSERT INTO public.user_roles(user_id, role) VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cliente'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'cliente');
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users(id), full_name text, email text);
INSERT INTO public.profiles SELECT id, email, email FROM auth.users;
CREATE TABLE public.organizations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text UNIQUE NOT NULL,
 notes text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.organization_members(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES public.organizations(id),
 user_id uuid REFERENCES auth.users(id), created_at timestamptz DEFAULT now(), UNIQUE(organization_id,user_id)
);
INSERT INTO public.organizations(id,name,slug) VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Existing organization','existing');
ALTER TABLE public.documents ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.documents SET organization_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
CREATE FUNCTION public.is_org_member(_user uuid, _org uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS(SELECT 1 FROM public.organization_members WHERE user_id = _user AND organization_id = _org)
$$;
GRANT SELECT ON public.documents TO authenticated;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY test_docs_access ON public.documents FOR SELECT TO authenticated
USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.is_org_member(auth.uid(),organization_id));
\ir ../../drizzle/migrations/0016_admin_accounts_and_organizations.sql
-- Applying the migration must not change fixture roles, profiles or memberships.
DO $$
BEGIN
 IF (SELECT count(*) FROM public.user_roles) <> 3 OR (SELECT count(*) FROM public.profiles) <> 4
 OR (SELECT count(*) FROM public.organizations) <> 1 OR EXISTS(SELECT 1 FROM public.organization_members)
 OR EXISTS(SELECT 1 FROM public.admin_access_events) THEN RAISE EXCEPTION 'Migration changed existing data'; END IF;
END $$;
COMMIT;

BEGIN;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 BEGIN
  PERFORM public.admin_set_account_role(auth.uid(),'cliente',true);
  RAISE EXCEPTION 'Last admin demotion was allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'O ultimo administrador deve manter seu acesso.' THEN RAISE; END IF; END;
 IF NOT public.admin_set_account_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin',false) THEN RAISE EXCEPTION 'Promotion failed'; END IF;
 BEGIN
  PERFORM public.admin_set_account_role(auth.uid(),'cliente',true);
  RAISE EXCEPTION 'Self demotion was allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Voce nao pode remover seu proprio acesso administrativo.' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_set_account_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cliente',false);
  RAISE EXCEPTION 'Stale role change was allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'A funcao desta conta mudou. Atualize a lista.' THEN RAISE; END IF; END;
 IF NOT public.admin_set_account_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','cliente',true) THEN RAISE EXCEPTION 'Demotion failed'; END IF;
 IF NOT public.admin_update_account_name('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Client new name','client@example.test') THEN RAISE EXCEPTION 'Name update failed'; END IF;
 PERFORM public.admin_save_organization('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','New organization','new-org','Notes',NULL);
 IF NOT public.admin_set_organization_member('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true,false) THEN RAISE EXCEPTION 'Membership add failed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.documents) <> 1 THEN RAISE EXCEPTION 'Membership did not grant access'; END IF;
 IF EXISTS(SELECT 1 FROM public.admin_access_events) THEN RAISE EXCEPTION 'Client saw admin history'; END IF;
 BEGIN
  PERFORM public.admin_set_account_role(auth.uid(),'admin',false);
  RAISE EXCEPTION 'Client promoted itself';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Acesso restrito a administradores.' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_set_organization_member('dddddddd-dddd-4ddd-8ddd-dddddddddddd',auth.uid(),false,true);
  RAISE EXCEPTION 'Client changed membership';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Acesso restrito a administradores.' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_save_organization('ffffffff-ffff-4fff-8fff-ffffffffffff','Forged','forged',NULL,NULL);
  RAISE EXCEPTION 'Client created organization';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Acesso restrito a administradores.' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.admin_update_account_name('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Forged','admin@example.test');
  RAISE EXCEPTION 'Client edited admin profile';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Acesso restrito a administradores.' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
SELECT public.admin_set_organization_member('dddddddd-dddd-4ddd-8ddd-dddddddddddd','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false,true);
SELECT set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.documents) THEN RAISE EXCEPTION 'Removed member kept organization access'; END IF; END $$;
RESET ROLE;
DO $$
DECLARE org public.organizations%ROWTYPE;
BEGIN
 IF (SELECT count(*) FROM public.documents) <> 1 THEN RAISE EXCEPTION 'Membership removal deleted a document'; END IF;
 IF (SELECT count(*) FROM public.admin_access_events) <> 6 THEN RAISE EXCEPTION 'Administrative changes were not audited exactly once'; END IF;
 SELECT * INTO org FROM public.organizations WHERE slug = 'new-org';
 PERFORM set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
 PERFORM public.admin_save_organization(org.id,'Updated organization',org.slug,'Updated notes',org.updated_at);
 BEGIN
  PERFORM public.admin_save_organization(org.id,'Stale overwrite',org.slug,NULL,org.updated_at);
  RAISE EXCEPTION 'Stale organization overwrite allowed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'A organizacao mudou. Atualize a lista.' THEN RAISE; END IF; END;
 SELECT * INTO org FROM public.organizations WHERE slug = 'new-org';
 BEGIN
  PERFORM public.admin_save_organization(org.id,'Renamed slug','other-slug',NULL,org.updated_at);
  RAISE EXCEPTION 'Organization identifier changed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'O identificador de uma organizacao existente nao pode ser alterado.' THEN RAISE; END IF; END;
END $$;
CREATE FUNCTION public.test_reject_access_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
CREATE TRIGGER test_reject_access_audit BEFORE INSERT ON public.admin_access_events FOR EACH ROW EXECUTE FUNCTION public.test_reject_access_audit();
DO $$
BEGIN
 BEGIN
  PERFORM public.admin_set_account_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin',false);
  RAISE EXCEPTION 'Audit failure did not abort role change';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'audit unavailable' THEN RAISE; END IF; END;
 IF public.has_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin') THEN RAISE EXCEPTION 'Unaudited role change persisted'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$
BEGIN
 BEGIN
  PERFORM public.admin_set_account_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','admin',false);
  RAISE EXCEPTION 'Null session gained privileges';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Acesso restrito a administradores.' THEN RAISE; END IF; END;
 IF has_function_privilege('anon','public.admin_set_account_role(uuid,public.app_role,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Anonymous RPC execution allowed';
 END IF;
END $$;
ROLLBACK;
\echo 'Admin account and organization security checks passed'
