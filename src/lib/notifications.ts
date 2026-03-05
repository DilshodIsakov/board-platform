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

/** Отписка от канала */
export function unsubscribeFromNotifications(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
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
    default:
      return "/";
  }
}
