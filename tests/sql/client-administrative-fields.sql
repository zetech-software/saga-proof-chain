\set ON_ERROR_STOP on
-- Run exclusively in the disposable CI database, never against the project.
SELECT current_database() = 'portal_security_test' AS is_test_database \gset
\if :is_test_database
\else
  \echo 'Refusing to run outside portal_security_test'
  \quit 1
\endif
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
CREATE TYPE public.app_role AS ENUM ('admin', 'cliente');
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
INSERT INTO public.user_roles VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin');
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE TABLE public.trademarks(
  id uuid PRIMARY KEY, created_by uuid, name text, holder text, notes text,
  status text DEFAULT 'submetida', admin_notes text, protocol_number text,
  deleted_at timestamptz, deleted_by uuid,
  submitted_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.support_requests(
  id uuid PRIMARY KEY, created_by uuid, subject text, message text,
  status text DEFAULT 'aberta', admin_reply text,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.trademarks, public.support_requests TO authenticated, service_role;
ALTER TABLE public.trademarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY trademarks_insert_own ON public.trademarks FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY support_insert_own ON public.support_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY trademarks_read ON public.trademarks FOR SELECT TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY support_read ON public.support_requests FOR SELECT TO authenticated USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY trademarks_update_admin ON public.trademarks FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY support_update_admin ON public.support_requests FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

\ir ../../drizzle/migrations/0013_protect_client_administrative_fields.sql

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
-- A client cannot impersonate a restoration or server by setting a custom flag.
SELECT set_config('app.restoring', 'true', true);
INSERT INTO public.trademarks VALUES (
 '22222222-2222-4222-8222-222222222222', auth.uid(), 'Client brand', 'Holder', 'Client notes',
 'deferida', 'Forged administrative notes', 'FORGED', now(), auth.uid(),
 '2000-01-01', '2000-01-01', '2000-01-01'
);
INSERT INTO public.support_requests VALUES (
 '33333333-3333-4333-8333-333333333333', auth.uid(), 'Help', 'Client message',
 'respondida', 'Forged administrative reply', '2000-01-01', '2000-01-01'
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trademarks
    WHERE status = 'submetida' AND admin_notes IS NULL AND protocol_number IS NULL
    AND deleted_at IS NULL AND deleted_by IS NULL
    AND submitted_at = now() AND created_at = now() AND updated_at = now()
    AND name = 'Client brand' AND holder = 'Holder' AND notes = 'Client notes') THEN
    RAISE EXCEPTION 'Client trademark normalization failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_requests
    WHERE status = 'aberta' AND admin_reply IS NULL AND created_at = now() AND updated_at = now()
    AND subject = 'Help' AND message = 'Client message') THEN
    RAISE EXCEPTION 'Client support normalization failed';
  END IF;
  UPDATE public.trademarks SET status = 'deferida';
  IF FOUND THEN RAISE EXCEPTION 'Client may update trademark administrative fields'; END IF;
  UPDATE public.support_requests SET admin_reply = 'Forged';
  IF FOUND THEN RAISE EXCEPTION 'Client may update support administrative fields'; END IF;
  BEGIN
    INSERT INTO public.support_requests(id, created_by, subject)
    VALUES ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Not mine');
    RAISE EXCEPTION 'Client ownership policy was bypassed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
INSERT INTO public.trademarks(id, created_by, name, status, admin_notes, protocol_number, submitted_at)
VALUES ('55555555-5555-4555-8555-555555555555', auth.uid(), 'Admin brand', 'deferida', 'Real notes', 'REAL', '2000-01-01');
INSERT INTO public.support_requests(id, created_by, subject, status, admin_reply)
VALUES ('66666666-6666-4666-8666-666666666666', auth.uid(), 'Admin ticket', 'respondida', 'Real reply');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trademarks WHERE name = 'Admin brand'
    AND status = 'deferida' AND admin_notes = 'Real notes' AND protocol_number = 'REAL' AND submitted_at = '2000-01-01') THEN
    RAISE EXCEPTION 'Admin trademark fields were changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_requests WHERE subject = 'Admin ticket'
    AND status = 'respondida' AND admin_reply = 'Real reply') THEN
    RAISE EXCEPTION 'Admin support fields were changed';
  END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
INSERT INTO public.trademarks(id, created_by, name, status, admin_notes, deleted_at)
VALUES ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'Restored brand', 'deferida', 'Saved notes', '2000-01-01');
INSERT INTO public.support_requests(id, subject, status, admin_reply)
VALUES ('88888888-8888-4888-8888-888888888888', 'Restored ticket', 'respondida', 'Saved reply');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trademarks WHERE name = 'Restored brand'
    AND status = 'deferida' AND admin_notes = 'Saved notes' AND deleted_at = '2000-01-01') THEN
    RAISE EXCEPTION 'Trusted restoration was normalized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_requests WHERE subject = 'Restored ticket'
    AND status = 'respondida' AND admin_reply = 'Saved reply') THEN
    RAISE EXCEPTION 'Trusted support insert was normalized';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
\echo 'Client administrative field security checks passed'
