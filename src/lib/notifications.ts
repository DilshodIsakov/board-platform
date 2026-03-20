import { supabase } from "./supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
}

/** Загрузить уведомления текущего пользователя */
export async function fetchNotifications(limit = 30): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchNotifications error:", error);
    return [];
  }
  return data as Notification[];
}

/** Количество непрочитанных */
export async function fetchUnreadCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("is_read", false);

  if (error) {
    console.error("fetchUnreadCount error:", error);
    return 0;
  }
  return count ?? 0;
}

// Count unread chat messages directly from messages table (source of truth).
// Previously counted from notifications table, but notification related_entity_id
// format didn't always match message IDs, causing badge to never decrease.
export async function fetchUnreadChatCount(): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return 0;

  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("receiver_id", session.user.id)
    .eq("is_read", false);

  if (error) {
    console.error("fetchUnreadChatCount error:", error);
    return 0;
  }
  return count ?? 0;
}

/** Пометить одно уведомление прочитанным */
export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id);

  if (error) console.error("markNotificationRead error:", error);
}

/** Пометить все уведомления прочитанными */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("is_read", false);

  if (error) console.error("markAllNotificationsRead error:", error);
}

/** Realtime-подписка на новые уведомления */
export function subscribeToNotifications(
  userId: string,
  onNew: (n: Notification) => void
): RealtimeChannel {
  const channel = supabase
    .channel("notifications-" + userId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => {
        onNew(payload.new as Notification);
      }
    )
    .subscribe();

  return channel;
}

/** Realtime-подписка на обновления уведомлений (используется для синхронизации при прочтении сообщений в чате) */
export function subscribeToNotificationUpdates(
  userId: string,
  onUpdate: (n: Notification) => void
): RealtimeChannel {
  const channel = supabase
    .channel("notifications-updates-" + userId)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${userId}`,
      },
      (payload) => {
        onUpdate(payload.new as Notification);
      }
    )
    .subscribe();

  return channel;
}

/** Отписка от канала */
export function unsubscribeFromNotifications(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}

/** Пометить notifications прочитанными по message IDs */
export async function markNotificationsByMessageIds(
  recipientId: string,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length === 0) return;

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", recipientId)
    .eq("related_entity_type", "message")
    .in("related_entity_id", messageIds);

  if (error) {
    console.error("markNotificationsByMessageIds error:", error);
  }
}

/** Определить маршрут для навигации по клику на уведомление */
export function getNotificationRoute(n: Notification): string {
  switch (n.related_entity_type) {
    case "task":
      return `/tasks/${n.related_entity_id}`;
    case "message":
    case "group_message":
      return "/chat";
    case "meeting":
      return `/meetings/${n.related_entity_id}`;
    case "ns_meeting":
      return `/ns-meetings/${n.related_entity_id}`;
    case "voting":
      return "/voting";
    default:
      return "/";
  }
}
