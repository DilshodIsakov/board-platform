import { supabase } from "./supabaseClient";

export interface CommitteeAgendaComment {
  id: string;
  created_at: string;
  updated_at: string;
  meeting_id: string;
  agenda_item_id: string;
  org_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  parent_comment_id: string | null;
  content: string;
  is_deleted: boolean;
}

export async function fetchCommitteeCommentsByAgendaItems(
  agendaItemIds: string[]
): Promise<Record<string, CommitteeAgendaComment[]>> {
  if (agendaItemIds.length === 0) return {};
  const { data, error } = await supabase
    .from("committee_agenda_comments")
    .select("*")
    .in("agenda_item_id", agendaItemIds)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchCommitteeComments error:", error); return {}; }
  const map: Record<string, CommitteeAgendaComment[]> = {};
  for (const c of (data || []) as CommitteeAgendaComment[]) {
    if (!map[c.agenda_item_id]) map[c.agenda_item_id] = [];
    map[c.agenda_item_id].push(c);
  }
  return map;
}

export async function addCommitteeComment(params: {
  meeting_id: string;
  agenda_item_id: string;
  org_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  parent_comment_id?: string | null;
  content: string;
}): Promise<CommitteeAgendaComment | null> {
  const { data, error } = await supabase
    .from("committee_agenda_comments")
    .insert({
      meeting_id: params.meeting_id,
      agenda_item_id: params.agenda_item_id,
      org_id: params.org_id,
      user_id: params.user_id,
      user_name: params.user_name,
      user_role: params.user_role,
      parent_comment_id: params.parent_comment_id || null,
      content: params.content,
    })
    .select()
    .single();
  if (error) { console.error("addCommitteeComment error:", error); return null; }
  return data as CommitteeAgendaComment;
}

export async function editCommitteeComment(commentId: string, content: string): Promise<CommitteeAgendaComment | null> {
  const { data, error } = await supabase
    .from("committee_agenda_comments")
    .update({ content })
    .eq("id", commentId)
    .select()
    .single();
  if (error) { console.error("editCommitteeComment error:", error); return null; }
  return data as CommitteeAgendaComment;
}

export async function softDeleteCommitteeComment(commentId: string): Promise<boolean> {
  const { error } = await supabase
    .from("committee_agenda_comments")
    .update({ is_deleted: true, content: "" })
    .eq("id", commentId);
  if (error) { console.error("softDeleteCommitteeComment error:", error); return false; }
  return true;
}
