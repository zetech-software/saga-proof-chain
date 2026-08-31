-- 1. Organizações (titulares)
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- 2. Compartilhamentos manuais criados pelo admin
CREATE TYPE public.shared_resource_type AS ENUM ('trademark', 'document', 'certificate');

CREATE TABLE public.resource_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type public.shared_resource_type NOT NULL,
  resource_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resource_type, resource_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_shares TO authenticated;
GRANT ALL ON public.resource_shares TO service_role;
ALTER TABLE public.resource_shares ENABLE ROW LEVEL SECURITY;

-- 3. Titularidade em marcas e documentos
ALTER TABLE public.trademarks ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.documents ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX idx_trademarks_organization ON public.trademarks(organization_id);
CREATE INDEX idx_documents_organization ON public.documents(organization_id);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_resource_shares_user ON public.resource_shares(user_id);

CREATE TRIGGER organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Funções auxiliares (security definer, evitam recursão de RLS)
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _org_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.user_id = _user_id AND m.organization_id = _org_id
  )
$$;

CREATE OR REPLACE FUNCTION public.has_share(_user_id uuid, _type public.shared_resource_type, _resource_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _resource_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.resource_shares s
    WHERE s.user_id = _user_id AND s.resource_type = _type AND s.resource_id = _resource_id
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_trademark(_user_id uuid, _trademark_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _trademark_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trademarks t
    WHERE t.id = _trademark_id
      AND (
        t.created_by = _user_id
        OR public.is_org_member(_user_id, t.organization_id)
        OR public.has_share(_user_id, 'trademark', t.id)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_document(_user_id uuid, _document_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _document_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = _document_id
      AND (
        d.created_by = _user_id
        OR public.is_org_member(_user_id, d.organization_id)
        OR public.has_share(_user_id, 'document', d.id)
      )
  )
$$;

-- 5. Políticas das novas tabelas
CREATE POLICY organizations_select_member_or_admin ON public.organizations
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.is_org_member(auth.uid(), id));

CREATE POLICY organization_members_select_self_or_admin ON public.organization_members
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY resource_shares_select_own_or_admin ON public.resource_shares
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY resource_shares_insert_admin ON public.resource_shares
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());

CREATE POLICY resource_shares_update_admin ON public.resource_shares
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY resource_shares_delete_admin ON public.resource_shares
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 6. Dados: organização Saga Mitologia Cósmica + membros (Mariana, Léo e admins)
INSERT INTO public.organizations (name, slug, notes)
VALUES ('Saga Mitologia Cósmica', 'saga-mitologia-cosmica', 'Titular principal dos registros.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.organization_members (organization_id, user_id)
SELECT o.id, u.id
FROM public.organizations o
JOIN auth.users u ON u.email IN (
  'mariana@zeregistra.com.br',
  'leo@zeregistra.com.br',
  'admin@zeregistra.com.br',
  'admin.teste@zeregistra.com.br'
)
WHERE o.slug = 'saga-mitologia-cosmica'
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Conteúdo existente passa a pertencer à Saga
UPDATE public.trademarks SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'saga-mitologia-cosmica')
WHERE organization_id IS NULL;
UPDATE public.documents SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'saga-mitologia-cosmica')
WHERE organization_id IS NULL;

-- 7. Substituição das políticas de leitura globais
DROP POLICY IF EXISTS trademarks_select_authenticated ON public.trademarks;
CREATE POLICY trademarks_select_scoped ON public.trademarks
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
  OR public.is_org_member(auth.uid(), organization_id)
  OR public.has_share(auth.uid(), 'trademark', id)
);

DROP POLICY IF EXISTS documents_select_authenticated ON public.documents;
CREATE POLICY documents_select_scoped ON public.documents
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
  OR public.is_org_member(auth.uid(), organization_id)
  OR public.has_share(auth.uid(), 'document', id)
);

DROP POLICY IF EXISTS certificates_select_authenticated ON public.certificates;
CREATE POLICY certificates_select_scoped ON public.certificates
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.can_view_document(auth.uid(), document_id)
  OR public.can_view_trademark(auth.uid(), trademark_id)
  OR public.has_share(auth.uid(), 'certificate', id)
);