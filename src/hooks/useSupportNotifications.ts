import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { usePortalSession } from "@/hooks/usePortalSession";

export type SupportNotificationType =
  | "new_support_request"
  | "support_response"
  | "new_document"
  | "additional_document"
  | "document_status"
  | "documents_requested"
  | "certificate_available";

export type SupportNotification = {
  id: string;
  support_request_id: string | null;
  document_id: string | null;
  certificate_id: string | null;
  type: SupportNotificationType;
  created_at: string;
  read_at: string | null;
};

const activeChannels = new Map<
  string,
  { channel: ReturnType<typeof supabase.channel>; refs: number }
>();

/**
 * Notificações internas de suporte do usuário autenticado.
 * A subscription Realtime é filtrada por recipient_id, então cada sessão
 * recebe apenas os próprios eventos.
 */
export function useSupportNotifications() {
  const queryClient = useQueryClient();
  const { data: session } = usePortalSession();
  const userId = session?.user?.id ?? null;

  const query = useQuery({
    queryKey: ["support-notifications", userId],
    enabled: !!userId,
    queryFn: async (): Promise<SupportNotification[]> => {
      const { data, error } = await supabase
        .from("support_notifications")
        .select("id, support_request_id, document_id, certificate_id, type, created_at, read_at")
        .is("read_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SupportNotification[];
    },
    // Uma falha aqui não deve quebrar a navegação do painel.
    retry: 1,
    throwOnError: false,
  });

  useEffect(() => {
    if (!userId) return;

    // Um único canal por usuário, mesmo com vários componentes usando o hook
    // (e com o duplo efeito do React StrictMode).
    const key = userId;
    let entry = activeChannels.get(key);
    if (!entry) {
      const channel = supabase
        .channel(`support-notifications-${key}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "support_notifications",
            filter: `recipient_id=eq.${key}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["support-notifications", key] });
            queryClient.invalidateQueries({ queryKey: ["admin-data"] });
            queryClient.invalidateQueries({ queryKey: ["support-requests"] });
            queryClient.invalidateQueries({ queryKey: ["documents"] });
            queryClient.invalidateQueries({ queryKey: ["certificates"] });
          },
        )
        .subscribe();
      entry = { channel, refs: 0 };
      activeChannels.set(key, entry);
    }
    entry.refs += 1;

    return () => {
      const current = activeChannels.get(key);
      if (!current) return;
      current.refs -= 1;
      if (current.refs <= 0) {
        activeChannels.delete(key);
        supabase.removeChannel(current.channel);
      }
    };
  }, [userId, queryClient]);

  const unread = query.data ?? [];

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.rpc("mark_support_notification_read", {
        _notification_id: notificationId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-notifications", userId] }),
  });

  const markAllRead = useMutation({
    mutationFn: async (type: SupportNotificationType) => {
      const { error } = await supabase.rpc("mark_all_support_notifications_read", {
        _type: type,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["support-notifications", userId] }),
  });

  function unreadOfType(type: SupportNotificationType) {
    return unread.filter((n) => n.type === type);
  }

  function unreadIdFor(type: SupportNotificationType, supportRequestId: string) {
    return unread.find((n) => n.type === type && n.support_request_id === supportRequestId)?.id;
  }

  return {
    unread,
    unreadOfType,
    unreadIdFor,
    adminCount: unreadOfType("new_support_request").length,
    clientCount: unreadOfType("support_response").length,
    adminDocumentCount:
      unreadOfType("new_document").length + unreadOfType("additional_document").length,
    clientDocumentCount:
      unreadOfType("document_status").length + unreadOfType("documents_requested").length,
    certificateCount: unreadOfType("certificate_available").length,
    markRead,
    markAllRead,
    isLoading: query.isLoading,
  };
}

export function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}
