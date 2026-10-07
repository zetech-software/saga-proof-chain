-- Administrative changes are checked in the database and recorded atomically.
-- Applying this migration does not change existing accounts, roles or memberships.
CREATE TABLE public.admin_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  target_user_id uuid,
  organization_id uuid,
  action text NOT NULL CHECK (action IN ('role_changed','member_added','member_removed','organization_created','organization_updated','profile_updated')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_access_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admin_access_events TO authenticated;
GRANT ALL ON public.admin_access_events TO service_role;
CREATE POLICY admin_access_events_read_admin ON public.admin_access_events
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX admin_access_events_created_idx ON public.admin_access_events(created_at DESC);

-- All functions use the same transaction lock, then recheck the caller.
-- A request queued behind the removal of its own admin role must be refused.
CREATE OR REPLACE FUNCTION public.admin_set_account_role(
  _user uuid, _role public.app_role, _expected_admin boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  was_admin boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(7016001);
  IF actor IS NULL OR NOT coalesce(public.has_role(actor, 'admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  IF _user IS NULL OR _role IS NULL OR _expected_admin IS NULL
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user) THEN
    RAISE EXCEPTION 'Conta invalida.';
  END IF;
  was_admin := public.has_role(_user, 'admin'::public.app_role);
  IF was_admin IS DISTINCT FROM _expected_admin THEN
    RAISE EXCEPTION 'A funcao desta conta mudou. Atualize a lista.';
  END IF;
  IF _role = 'admin' AND was_admin OR _role = 'cliente' AND NOT was_admin THEN
    RETURN false;
  END IF;
  IF _role = 'cliente' THEN
    IF (SELECT count(*) FROM public.user_roles WHERE role = 'admin') <= 1 THEN
      RAISE EXCEPTION 'O ultimo administrador deve manter seu acesso.';
    END IF;
    IF _user = actor THEN
      RAISE EXCEPTION 'Voce nao pode remover seu proprio acesso administrativo.';
    END IF;
    INSERT INTO public.user_roles(user_id, role) VALUES (_user, 'cliente') ON CONFLICT (user_id, role) DO NOTHING;
    DELETE FROM public.user_roles WHERE user_id = _user AND role = 'admin';
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (_user, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  INSERT INTO public.admin_access_events(actor_id, target_user_id, action, before_state, after_state)
  VALUES (actor, _user, 'role_changed', jsonb_build_object('admin', was_admin), jsonb_build_object('admin', _role = 'admin'));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_organization_member(
  _organization uuid, _user uuid, _member boolean, _expected_member boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  was_member boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(7016001);
  IF actor IS NULL OR NOT coalesce(public.has_role(actor, 'admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  IF _member IS NULL OR _expected_member IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user) THEN
    RAISE EXCEPTION 'Conta ou organizacao invalida.';
  END IF;
  was_member := EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = _organization AND user_id = _user);
  IF was_member IS DISTINCT FROM _expected_member THEN
    RAISE EXCEPTION 'O vinculo mudou. Atualize a lista.';
  END IF;
  IF was_member = _member THEN RETURN false; END IF;
  IF _member THEN
    INSERT INTO public.organization_members(organization_id, user_id) VALUES (_organization, _user);
  ELSE
    DELETE FROM public.organization_members WHERE organization_id = _organization AND user_id = _user;
  END IF;
  INSERT INTO public.admin_access_events(actor_id, target_user_id, organization_id, action, before_state, after_state)
  VALUES (actor, _user, _organization, CASE WHEN _member THEN 'member_added' ELSE 'member_removed' END,
          jsonb_build_object('member', was_member), jsonb_build_object('member', _member));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_save_organization(
  _id uuid, _name text, _slug text, _notes text, _expected_updated_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  old_row public.organizations%ROWTYPE;
  new_row public.organizations%ROWTYPE;
  existing boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(7016001);
  IF actor IS NULL OR NOT coalesce(public.has_role(actor, 'admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  IF _id IS NULL OR _name IS NULL OR length(btrim(_name)) NOT BETWEEN 2 AND 160
     OR _slug IS NULL OR length(_slug) NOT BETWEEN 2 AND 80 OR _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     OR length(coalesce(_notes, '')) > 1000 THEN
    RAISE EXCEPTION 'Informe nome e identificador validos.';
  END IF;
  SELECT * INTO old_row FROM public.organizations WHERE id = _id FOR UPDATE;
  existing := FOUND;
  IF existing THEN
    IF old_row.updated_at IS DISTINCT FROM _expected_updated_at THEN
      RAISE EXCEPTION 'A organizacao mudou. Atualize a lista.';
    END IF;
    IF old_row.slug IS DISTINCT FROM _slug THEN
      RAISE EXCEPTION 'O identificador de uma organizacao existente nao pode ser alterado.';
    END IF;
    UPDATE public.organizations SET name = btrim(_name), notes = nullif(btrim(_notes), ''), updated_at = clock_timestamp()
    WHERE id = _id RETURNING * INTO new_row;
  ELSE
    IF _expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Organizacao nao encontrada.'; END IF;
    INSERT INTO public.organizations(id, name, slug, notes)
    VALUES (_id, btrim(_name), _slug, nullif(btrim(_notes), '')) RETURNING * INTO new_row;
  END IF;
  INSERT INTO public.admin_access_events(actor_id, organization_id, action, before_state, after_state)
  VALUES (actor, _id, CASE WHEN existing THEN 'organization_updated' ELSE 'organization_created' END,
    CASE WHEN existing THEN jsonb_build_object('name', old_row.name, 'slug', old_row.slug, 'notes', old_row.notes) ELSE NULL END,
    jsonb_build_object('name', new_row.name, 'slug', new_row.slug, 'notes', new_row.notes));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_account_name(
  _user uuid, _name text, _expected_name text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor uuid := auth.uid();
  old_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(7016001);
  IF actor IS NULL OR NOT coalesce(public.has_role(actor, 'admin'::public.app_role), false) THEN
    RAISE EXCEPTION 'Acesso restrito a administradores.';
  END IF;
  IF _user IS NULL OR _name IS NULL OR length(btrim(_name)) NOT BETWEEN 2 AND 160
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user) THEN
    RAISE EXCEPTION 'Informe uma conta e um nome validos.';
  END IF;
  SELECT full_name INTO old_name FROM public.profiles WHERE id = _user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil nao encontrado.'; END IF;
  IF old_name IS DISTINCT FROM _expected_name THEN RAISE EXCEPTION 'O nome mudou. Atualize a lista.'; END IF;
  IF old_name IS NOT DISTINCT FROM btrim(_name) THEN RETURN false; END IF;
  UPDATE public.profiles SET full_name = btrim(_name) WHERE id = _user;
  INSERT INTO public.admin_access_events(actor_id, target_user_id, action, before_state, after_state)
  VALUES (actor, _user, 'profile_updated', jsonb_build_object('name', old_name), jsonb_build_object('name', btrim(_name)));
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_account_role(uuid, public.app_role, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_organization_member(uuid, uuid, boolean, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_save_organization(uuid, text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_account_name(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_account_role(uuid, public.app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_organization_member(uuid, uuid, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_organization(uuid, text, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_account_name(uuid, text, text) TO authenticated;
