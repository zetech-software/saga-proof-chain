CREATE TYPE public.support_notification_type AS ENUM ('new_support_request', 'support_response');

CREATE TABLE public.support_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  support_request_id uuid NOT NULL REFERENCES public.support_requests(id) ON DELETE CASCADE,
  type public.support_notification_type NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT support_notifications_unique UNIQUE (recipient_id, support_request_id, type)
);

CREATE INDEX support_notifications_recipient_idx
  ON public.support_notifications (recipient_id, read_at, created_at DESC);

GRANT SELECT ON public.support_notifications TO authenticated;
GRANT ALL ON public.support_notifications TO service_role;

ALTER TABLE public.support_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_notifications_select_own
  ON public.support_notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_admins_new_support_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.support_notifications (recipient_id, support_request_id, type)
  SELECT ur.user_id, NEW.id, 'new_support_request'
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
    AND (NEW.created_by IS NULL OR ur.user_id <> NEW.created_by)
  ON CONFLICT (recipient_id, support_request_id, type) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_requests_notify_admins
AFTER INSERT ON public.support_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_new_support_request();

CREATE OR REPLACE FUNCTION public.notify_client_support_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(btrim(NEW.admin_reply), '') = '' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(btrim(NEW.admin_reply), '') IS NOT DISTINCT FROM COALESCE(btrim(OLD.admin_reply), '') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.support_notifications (recipient_id, support_request_id, type)
  VALUES (NEW.created_by, NEW.id, 'support_response')
  ON CONFLICT (recipient_id, support_request_id, type)
  DO UPDATE SET created_at = now(), read_at = NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER support_requests_notify_client
AFTER UPDATE OF admin_reply ON public.support_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_client_support_response();

CREATE OR REPLACE FUNCTION public.mark_support_notification_read(_notification_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.support_notifications
  SET read_at = now()
  WHERE id = _notification_id
    AND recipient_id = auth.uid()
    AND read_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_support_notifications_read(_type public.support_notification_type)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.support_notifications
  SET read_at = now()
  WHERE recipient_id = auth.uid()
    AND type = _type
    AND read_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.mark_support_notification_read(uuid) FROM public;
REVOKE ALL ON FUNCTION public.mark_all_support_notifications_read(public.support_notification_type) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_support_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_support_notifications_read(public.support_notification_type) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.support_notifications;