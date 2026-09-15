CREATE TABLE public.resource_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_type public.shared_resource_type NOT NULL,
  resource_id uuid NOT NULL,
  action text NOT NULL DEFAULT 'view',
  viewed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.resource_views TO authenticated;
GRANT ALL ON public.resource_views TO service_role;

ALTER TABLE public.resource_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY resource_views_insert_own ON public.resource_views
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY resource_views_select_own_or_admin ON public.resource_views
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX resource_views_resource_idx ON public.resource_views (resource_type, resource_id, viewed_at DESC);
CREATE INDEX resource_views_user_idx ON public.resource_views (user_id, viewed_at DESC);