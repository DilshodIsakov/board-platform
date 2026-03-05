import { supabase } from "./supabaseClient";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface Message {
  id: number;
  organization_id: string;
  sender_id: string;
  receiver_id: string;
  body: string;
  is_read: boolean;
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
}

/** Загрузить список контактов (все активные профили в организации) */
export async function fetchContacts(excludeProfileId: string): Promise<ContactProfile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .neq("id", excludeProfileId)
    .order("full_name");

  if (error) {
    console.error("fetchContacts error:", error);
    return [];
  }

  return data as ContactProfile[];
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
    body: content.trim() || null,
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
  content: string;
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
    content: content.trim() || null,
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
