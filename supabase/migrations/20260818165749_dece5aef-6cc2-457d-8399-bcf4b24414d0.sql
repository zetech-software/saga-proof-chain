REVOKE ALL ON FUNCTION public.notify_admins_new_support_request() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_client_support_response() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_support_notification_read(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.mark_all_support_notifications_read(public.support_notification_type) FROM anon;