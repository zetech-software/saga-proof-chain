CREATE POLICY "documentos_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documentos');
CREATE POLICY "documentos_insert_auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos');
CREATE POLICY "documentos_delete_admin" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'documentos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "certificados_select_auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'certificados');
CREATE POLICY "certificados_insert_admin" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'certificados' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "certificados_delete_admin" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'certificados' AND public.has_role(auth.uid(), 'admin'));