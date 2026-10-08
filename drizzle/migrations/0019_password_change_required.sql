CREATE TABLE public.password_change_required (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.password_change_required FROM anon, authenticated;
GRANT SELECT ON public.password_change_required TO authenticated;
GRANT ALL ON public.password_change_required TO service_role;
ALTER TABLE public.password_change_required ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own flag readable" ON public.password_change_required FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.password_change_required(user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'cliente')
  ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.password_change_required (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;