import { supabase } from "./supabaseClient";

export interface AgendaItemComment {
  id: string;
  created_at: string;
  updated_at: string;
  meeting_id: string;
  agenda_item_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  parent_comment_id: string | null;
  content: string;
  is_deleted: boolean;
}

/** Загрузить все комментарии для списка agenda_item_id */
export async function fetchCommentsByAgendaItems(
  agendaItemIds: string[]
): Promise<Record<string, AgendaItemComment[]>> {
  if (agendaItemIds.length === 0) return {};

  const { data, error } = await supabase
    .from("agenda_item_comments")
    .select("*")
    .in("agenda_item_id", agendaItemIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchCommentsByAgendaItems error:", error);
    return {};
  }

  const map: Record<string, AgendaItemComment[]> = {};
  for (const c of (data || []) as AgendaItemComment[]) {
    if (!map[c.agenda_item_id]) map[c.agenda_item_id] = [];
    map[c.agenda_item_id].push(c);
  }
  return map;
}

/** Добавить комментарий */
export async function addComment(params: {
  meeting_id: string;
  agenda_item_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  parent_comment_id?: string | null;
  content: string;
}): Promise<AgendaItemComment | null> {
  const { data, error } = await supabase
    .from("agenda_item_comments")
    .insert({
      meeting_id: params.meeting_id,
      agenda_item_id: params.agenda_item_id,
      user_id: params.user_id,
      user_name: params.user_name,
      user_role: params.user_role,
      parent_comment_id: params.parent_comment_id || null,
      content: params.content,
    })
    .select()
    .single();

  if (error) {
    console.error("addComment error:", error);
    return null;
  }
  return data as AgendaItemComment;
}

/** Редактирование комментария */
export async function editComment(commentId: string, content: string): Promise<AgendaItemComment | null> {
  const { data, error } = await supabase
    .from("agenda_item_comments")
    .update({ content })
    .eq("id", commentId)
    .select()
    .single();

  if (error) {
    console.error("editComment error:", error);
    return null;
  }
  return data as AgendaItemComment;
}

/** Мягкое удаление комментария (is_deleted = true) */
export async function softDeleteComment(commentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("agenda_item_comments")
    .update({ is_deleted: true, content: "" })
    .eq("id", commentId);

  if (error) {
    console.error("softDeleteComment error:", error);
    return false;
  }
  return true;
}
