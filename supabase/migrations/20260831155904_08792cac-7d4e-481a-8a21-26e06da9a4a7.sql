DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));