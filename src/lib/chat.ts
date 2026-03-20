import { supabase } from "./supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Message {
  id: string;
  organization_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  is_read: boolean;
  is_deleted?: boolean;
  is_edited?: boolean;
  created_at: string;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  storage_path?: string | null;
}

export interface ContactProfile {
  id: string;
  full_name: string;
  role: string;
  avatar_url?: string | null;
  unread_count?: number; // количество непрочитанных сообщений от этого контакта
}

/** Диалог (переписка) с конкретным пользователем — только те, у кого есть история */
export interface ConversationThread {
  id: string;           // profile id собеседника
  full_name: string;
  role: string;
  avatar_url?: string | null;
  last_message?: string;    // превью последнего сообщения
  last_message_at?: string; // ISO timestamp последнего сообщения
  unread_count: number;
}

/** Загрузить список контактов (все активные профили в организации) */
export async function fetchContacts(excludeProfileId: string): Promise<ContactProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url")
    .neq("id", excludeProfileId)
    .order("full_name");

  if (error) {
    console.error("fetchContacts error:", error);
    return [];
  }

  return data as ContactProfile[];
}

// Fetch contacts along with unread counts for messages addressed to us.
// Reuses the existing messages table and does not create any new structures.
export async function fetchContactsWithUnread(
  excludeProfileId: string
): Promise<ContactProfile[]> {
  const contacts = await fetchContacts(excludeProfileId);

  const { data: msgs, error } = await supabase
    .from("messages")
    .select("sender_id")
    .eq("receiver_id", excludeProfileId)
    .eq("is_read", false);

  if (error) {
    console.error("fetchContactsWithUnread error:", error);
    return contacts;
  }

  const counts = new Map<string, number>();
  msgs?.forEach((m: any) => {
    const sid = m.sender_id;
    counts.set(sid, (counts.get(sid) || 0) + 1);
  });

  return contacts.map((c) => ({
    ...c,
    unread_count: counts.get(c.id) || 0,
  }));
}

/** Загрузить переписку между двумя пользователями */
export async function fetchConversation(
  myProfileId: string,
  otherProfileId: string,
  limit = 50
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${myProfileId},receiver_id.eq.${otherProfileId}),` +
      `and(sender_id.eq.${otherProfileId},receiver_id.eq.${myProfileId})`
    )
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("fetchConversation error:", error);
    return [];
  }

  return data as Message[];
}

/** Отправить сообщение */
export async function sendMessage(
  orgId: string,
  senderProfileId: string,
  receiverProfileId: string,
  content: string,
  fileInfo?: { file_name: string; file_size: number; mime_type: string; storage_path: string }
): Promise<Message | null> {
  const row: Record<string, unknown> = {
    organization_id: orgId,
    sender_id: senderProfileId,
    receiver_id: receiverProfileId,
    body: fileInfo ? fileInfo.file_name : (content.trim() || " "),
  };
  if (fileInfo) {
    row.file_name = fileInfo.file_name;
    row.file_size = fileInfo.file_size;
    row.mime_type = fileInfo.mime_type;
    row.storage_path = fileInfo.storage_path;
  }

  const { data, error } = await supabase
    .from("messages")
    .insert(row)
    .select()
    .single();

  if (error) {
    console.error("sendMessage error:", error);
    throw new Error(error.message);
  }

  return data as Message;
}

/** Пометить сообщения прочитанными */
export async function markAsRead(messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;

  const { error } = await supabase
    .from("messages")
    .update({ is_read: true })
    .in("id", messageIds);

  if (error) {
    console.error("markAsRead error:", error);
  }
}

// Пометить все непрочитанные сообщения от указанного собеседника прочитанными
// одновременно синхронизируя related notifications.
export async function markConversationAndNotificationsAsRead(
  myProfileId: string,
  otherProfileId: string
): Promise<string[]> { // returns array of message ids marked
  // 1. Find all unread messages from this sender to me
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("sender_id", otherProfileId)
    .eq("receiver_id", myProfileId)
    .eq("is_read", false);

  if (error) {
    console.error("markConversationAndNotificationsAsRead error:", error);
    return [];
  }

  const ids = (data || []).map((m: any) => String(m.id));
  if (ids.length === 0) return [];

  // 2. Mark messages as read
  const { error: msgErr } = await supabase
    .from("messages")
    .update({ is_read: true })
    .in("id", ids);
  if (msgErr) console.error("markConversationAndNotificationsAsRead messages update error:", msgErr);

  // 3. Mark related notifications as read (by message IDs)
  const { error: notifErr } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("recipient_id", myProfileId)
    .eq("related_entity_type", "message")
    .eq("is_read", false)
    .in("related_entity_id", ids);
  if (notifErr) console.error("markConversationAndNotificationsAsRead notification update error:", notifErr);

  return ids;
}

/** Подписка на новые входящие сообщения через Supabase Realtime */
export function subscribeToMessages(
  myProfileId: string,
  onNewMessage: (message: Message) => void
): RealtimeChannel {
  const channel = supabase
    .channel("messages-for-" + myProfileId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `receiver_id=eq.${myProfileId}`,
      },
      (payload) => {
        onNewMessage(payload.new as Message);
      }
    )
    .subscribe();

  return channel;
}

/** Отписка от канала */
export function unsubscribeFromMessages(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}

// ============================================================
// Групповые чаты
// ============================================================

export interface ChatGroup {
  id: string;
  organization_id: string;
  name: string;
  created_by: string;
  created_at: string;
  member_count?: number;
  last_message?: string;     // превью последнего сообщения в группе
  last_message_at?: string;  // ISO timestamp последнего сообщения
}

export interface ChatGroupMember {
  id: string;
  group_id: string;
  profile_id: string;
  joined_at: string;
  profile?: { full_name: string; role: string };
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  body: string;
  is_deleted?: boolean;
  is_edited?: boolean;
  created_at: string;
  sender?: { full_name: string };
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  storage_path?: string | null;
}

/** Загрузить группы организации */
export async function fetchGroups(): Promise<ChatGroup[]> {
  const { data, error } = await supabase
    .from("chat_groups")
    .select("*, members:chat_group_members(id)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchGroups error:", error);
    return [];
  }

  return (data || []).map((g: Record<string, unknown>) => ({
    id: g.id as string,
    organization_id: g.organization_id as string,
    name: g.name as string,
    created_by: g.created_by as string,
    created_at: g.created_at as string,
    member_count: Array.isArray(g.members) ? g.members.length : 0,
  }));
}

/** Создать группу */
export async function createGroup(
  orgId: string,
  createdBy: string,
  name: string,
  memberIds: string[]
): Promise<ChatGroup | null> {
  const { data, error } = await supabase
    .from("chat_groups")
    .insert({ organization_id: orgId, created_by: createdBy, name })
    .select()
    .single();

  if (error) throw new Error(error.message);

  const group = data as ChatGroup;

  // Добавить создателя + выбранных участников
  const allMembers = [...new Set([createdBy, ...memberIds])];
  const rows = allMembers.map((pid) => ({ group_id: group.id, profile_id: pid }));

  const { error: memErr } = await supabase
    .from("chat_group_members")
    .insert(rows);

  if (memErr) console.error("addGroupMembers error:", memErr);

  return group;
}

/** Удалить группу */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_groups")
    .delete()
    .eq("id", groupId);

  if (error) throw new Error(error.message);
}

/** Загрузить участников группы */
export async function fetchGroupMembers(groupId: string): Promise<ChatGroupMember[]> {
  const { data, error } = await supabase
    .from("chat_group_members")
    .select("*, profile:profiles!chat_group_members_profile_id_fkey(full_name, role)")
    .eq("group_id", groupId)
    .order("joined_at");

  if (error) {
    console.error("fetchGroupMembers error:", error);
    return [];
  }
  return data as ChatGroupMember[];
}

/** Добавить участника в группу */
export async function addGroupMember(groupId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_group_members")
    .insert({ group_id: groupId, profile_id: profileId });

  if (error) throw new Error(error.message);
}

/** Удалить участника из группы */
export async function removeGroupMember(groupId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("profile_id", profileId);

  if (error) throw new Error(error.message);
}

/** Загрузить сообщения группы */
export async function fetchGroupMessages(groupId: string, limit = 100): Promise<GroupMessage[]> {
  const { data, error } = await supabase
    .from("chat_group_messages")
    .select("*, sender:profiles!chat_group_messages_sender_id_fkey(full_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("fetchGroupMessages error:", error);
    return [];
  }
  return data as GroupMessage[];
}

/** Отправить сообщение в группу */
export async function sendGroupMessage(
  groupId: string,
  senderId: string,
  content: string,
  fileInfo?: { file_name: string; file_size: number; mime_type: string; storage_path: string }
): Promise<GroupMessage | null> {
  const row: Record<string, unknown> = {
    group_id: groupId,
    sender_id: senderId,
    body: fileInfo ? fileInfo.file_name : (content.trim() || " "),
  };
  if (fileInfo) {
    row.file_name = fileInfo.file_name;
    row.file_size = fileInfo.file_size;
    row.mime_type = fileInfo.mime_type;
    row.storage_path = fileInfo.storage_path;
  }

  const { data, error } = await supabase
    .from("chat_group_messages")
    .insert(row)
    .select("*, sender:profiles!chat_group_messages_sender_id_fkey(full_name)")
    .single();

  if (error) throw new Error(error.message);
  return data as GroupMessage;
}

/**
 * Список диалогов текущего пользователя — только те переписки,
 * в которых реально были сообщения, отсортированные по последней активности.
 */
export async function fetchConversationThreads(
  myProfileId: string
): Promise<ConversationThread[]> {
  const { data: msgs, error } = await supabase
    .from("messages")
    .select("sender_id, receiver_id, body, created_at, is_read, file_name")
    .or(`sender_id.eq.${myProfileId},receiver_id.eq.${myProfileId}`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error || !msgs?.length) return [];

  // Группируем по партнёру: берём последнее сообщение и считаем unread
  const threadMap = new Map<string, {
    last_message: string;
    last_message_at: string;
    unread_count: number;
  }>();

  for (const msg of msgs as any[]) {
    const partnerId = msg.sender_id === myProfileId ? msg.receiver_id : msg.sender_id;
    if (!threadMap.has(partnerId)) {
      threadMap.set(partnerId, {
        last_message: msg.file_name
          ? `📎 ${msg.file_name}`
          : (msg.body || ""),
        last_message_at: msg.created_at,
        unread_count: (msg.receiver_id === myProfileId && !msg.is_read) ? 1 : 0,
      });
    } else if (msg.receiver_id === myProfileId && !msg.is_read) {
      threadMap.get(partnerId)!.unread_count++;
    }
  }

  if (threadMap.size === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url")
    .in("id", [...threadMap.keys()]);

  const threads: ConversationThread[] = (profiles || []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name || "",
    role: p.role || "",
    avatar_url: p.avatar_url || null,
    ...threadMap.get(p.id)!,
  }));

  return threads.sort(
    (a, b) =>
      new Date(b.last_message_at!).getTime() -
      new Date(a.last_message_at!).getTime()
  );
}

/**
 * Группы, в которых состоит текущий пользователь,
 * с превью последнего сообщения и сортировкой по активности.
 */
export async function fetchGroupsForMember(
  myProfileId: string
): Promise<ChatGroup[]> {
  const { data: memberships } = await supabase
    .from("chat_group_members")
    .select("group_id")
    .eq("profile_id", myProfileId);

  if (!memberships?.length) return [];

  const groupIds = (memberships as any[]).map((m) => m.group_id);

  const { data: groups, error } = await supabase
    .from("chat_groups")
    .select("*, members:chat_group_members(id)")
    .in("id", groupIds);

  if (error || !groups?.length) return [];

  // Получить последние сообщения всех групп одним запросом
  const { data: allMsgs } = await supabase
    .from("chat_group_messages")
    .select("group_id, body, created_at, file_name")
    .in("group_id", groupIds)
    .order("created_at", { ascending: false });

  const latestPerGroup = new Map<string, any>();
  for (const msg of (allMsgs || []) as any[]) {
    if (!latestPerGroup.has(msg.group_id)) {
      latestPerGroup.set(msg.group_id, msg);
    }
  }

  const result: ChatGroup[] = (groups as any[]).map((g) => {
    const latest = latestPerGroup.get(g.id);
    return {
      id: g.id,
      organization_id: g.organization_id,
      name: g.name,
      created_by: g.created_by,
      created_at: g.created_at,
      member_count: Array.isArray(g.members) ? g.members.length : 0,
      last_message: latest?.file_name
        ? `📎 ${latest.file_name}`
        : latest?.body,
      last_message_at: latest?.created_at,
    };
  });

  return result.sort((a, b) => {
    const ta = a.last_message_at
      ? new Date(a.last_message_at).getTime()
      : new Date(a.created_at).getTime();
    const tb = b.last_message_at
      ? new Date(b.last_message_at).getTime()
      : new Date(b.created_at).getTime();
    return tb - ta;
  });
}

/** Мягкое удаление личного сообщения (только отправитель, ставит is_deleted = true) */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ is_deleted: true })
    .eq("id", messageId);

  if (error) {
    console.error("deleteMessage error:", error);
    throw new Error(error.message);
  }
}

/** Мягкое удаление сообщения в группе (только отправитель) */
export async function deleteGroupMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from("chat_group_messages")
    .update({ is_deleted: true })
    .eq("id", messageId);

  if (error) {
    console.error("deleteGroupMessage error:", error);
    throw new Error(error.message);
  }
}

/** Редактировать текст личного сообщения (только отправитель, только не удалённые) */
export async function editMessage(messageId: string, newBody: string): Promise<void> {
  const { error } = await supabase
    .from("messages")
    .update({ body: newBody, is_edited: true })
    .eq("id", messageId);

  if (error) {
    console.error("editMessage error:", error);
    throw new Error(error.message);
  }
}

/** Редактировать текст группового сообщения (только отправитель, только не удалённые) */
export async function editGroupMessage(messageId: string, newBody: string): Promise<void> {
  const { error } = await supabase
    .from("chat_group_messages")
    .update({ body: newBody, is_edited: true })
    .eq("id", messageId);

  if (error) {
    console.error("editGroupMessage error:", error);
    throw new Error(error.message);
  }
}

/** Получить профиль по id (для добавления нового диалога по realtime) */
export async function fetchProfileById(
  profileId: string
): Promise<ContactProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url")
    .eq("id", profileId)
    .single();

  if (error) return null;
  return data as ContactProfile;
}

// ============================================================
// Вложения (файлы / изображения)
// ============================================================

const CHAT_BUCKET = "chat-attachments";

/** Очистить имя файла: транслитерация кириллицы + замена небезопасных символов */
function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : "";
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",
    н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",
    ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"Yo",Ж:"Zh",З:"Z",И:"I",Й:"Y",К:"K",Л:"L",М:"M",
    Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Sch",
    Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
  };
  const transliterated = base.split("").map((c) => map[c] ?? c).join("");
  const safe = transliterated.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return (safe || "file") + ext;
}

/** Загрузить файл в Storage bucket chat-attachments */
export async function uploadChatFile(file: File, orgId: string): Promise<string> {
  const storagePath = `${orgId}/${Date.now()}_${sanitizeFileName(file.name)}`;
  const { error } = await supabase.storage.from(CHAT_BUCKET).upload(storagePath, file);
  if (error) {
    console.error("uploadChatFile error:", error);
    throw new Error(error.message);
  }
  return storagePath;
}

/** Получить signed URL для файла чата (1 час) */
export async function getChatFileUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) {
    console.error("getChatFileUrl error:", error);
    return null;
  }
  return data.signedUrl;
}

/** Проверить, является ли файл изображением */
export function isImageFile(mimeType: string | null | undefined): boolean {
  return !!mimeType && mimeType.startsWith("image/");
}

/** Форматировать размер файла */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}

/** Подписка на новые сообщения в группе */
export function subscribeToGroupMessages(
  groupId: string,
  onNewMessage: (msg: GroupMessage) => void
): RealtimeChannel {
  const channel = supabase
    .channel("group-messages-" + groupId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "chat_group_messages",
        filter: `group_id=eq.${groupId}`,
      },
      (payload) => {
        onNewMessage(payload.new as GroupMessage);
      }
    )
    .subscribe();

  return channel;
}

// ============================================================
// Счетчик непрочитанных сообщений
// ============================================================

/** Получить количество непрочитанных сообщений в чате */
export async function loadUnreadChatCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_unread_chat_count');

  if (error) {
    console.error("loadUnreadChatCount error:", error);
    return 0;
  }

  // Суммируем результаты из UNION ALL
  return Array.isArray(data) ? data.reduce((sum: number, count: number) => sum + count, 0) : 0;
}

/** Пометить личные сообщения как прочитанные */
export async function markPersonalMessagesAsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_personal_messages_as_read');

  if (error) {
    console.error("markPersonalMessagesAsRead error:", error);
  }
}

/** Пометить группу как прочитанную */
export async function markGroupAsRead(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_group_as_read', { group_id_param: groupId });

  if (error) {
    console.error("markGroupAsRead error:", error);
  }
}

/** Пометить все сообщения в чате как прочитанные */
export async function markAllChatAsRead(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  // Пометить личные сообщения
  await markPersonalMessagesAsRead();

  // Пометить все группы, где пользователь участник
  const groups = await fetchGroups();
  for (const group of groups) {
    await markGroupAsRead(group.id);
  }
}
