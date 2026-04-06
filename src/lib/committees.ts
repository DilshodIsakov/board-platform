import { supabase } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CommitteeType = "audit" | "strategy" | "nominations" | "anticorruption";

export interface Committee {
  id: string;
  org_id: string;
  name: string;
  name_uz: string | null;
  name_en: string | null;
  type: CommitteeType;
  description: string | null;
  description_en: string | null;
  description_uz: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CommitteeMember {
  id: string;
  committee_id: string;
  profile_id: string;
  role: "chair" | "member";
  added_at: string;
  profile?: {
    id: string;
    full_name: string | null;
    full_name_en: string | null;
    full_name_uz: string | null;
    avatar_url: string | null;
    role: string;
  };
}

export interface CommitteeMeeting {
  id: string;
  committee_id: string;
  org_id: string;
  title: string;
  title_uz: string | null;
  title_en: string | null;
  start_at: string;
  status: "scheduled" | "completed";
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CommitteeAgendaItem {
  id: string;
  meeting_id: string;
  committee_id: string;
  org_id: string;
  title: string;
  title_uz: string | null;
  title_en: string | null;
  presenter: string | null;
  order_index: number;
  created_at: string;
}

export interface CommitteeVoting {
  id: string;
  agenda_item_id: string;
  committee_id: string;
  org_id: string;
  title: string;
  status: "open" | "closed";
  total_members: number;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
  votes?: CommitteeVote[];
}

export interface CommitteeVote {
  id: string;
  voting_id: string;
  voter_id: string;
  choice: "for" | "against" | "abstain";
  created_at: string;
}

export interface CommitteeDocument {
  id: string;
  committee_meeting_id: string;
  org_id: string;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string;
  language: string | null;
  created_at: string;
}

// ─── Committees ───────────────────────────────────────────────────────────────

export async function fetchCommittees(): Promise<Committee[]> {
  const { data, error } = await supabase
    .from("committees")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchCommittees:", error); return []; }
  return data as Committee[];
}

export async function fetchCommitteeById(id: string): Promise<Committee | null> {
  const { data, error } = await supabase
    .from("committees")
    .select("*")
    .eq("id", id)
    .single();
  if (error) { console.error("fetchCommitteeById:", error); return null; }
  return data as Committee;
}

// ─── Committee Members ────────────────────────────────────────────────────────

export async function fetchCommitteeMembers(committeeId: string): Promise<CommitteeMember[]> {
  const { data, error } = await supabase
    .from("committee_members")
    .select(`
      *,
      profile:profiles(id, full_name, full_name_en, full_name_uz, avatar_url, role)
    `)
    .eq("committee_id", committeeId)
    .order("added_at", { ascending: true });
  if (error) { console.error("fetchCommitteeMembers:", error); return []; }
  return data as CommitteeMember[];
}

export async function addCommitteeMember(
  committeeId: string, profileId: string, role: "chair" | "member"
): Promise<boolean> {
  const { error } = await supabase
    .from("committee_members")
    .upsert({ committee_id: committeeId, profile_id: profileId, role }, { onConflict: "committee_id,profile_id" });
  if (error) { console.error("addCommitteeMember:", error); return false; }
  return true;
}

export async function updateCommitteeMemberRole(
  committeeId: string, profileId: string, role: "chair" | "member"
): Promise<boolean> {
  const { error } = await supabase
    .from("committee_members")
    .update({ role })
    .eq("committee_id", committeeId)
    .eq("profile_id", profileId);
  if (error) { console.error("updateCommitteeMemberRole:", error); return false; }
  return true;
}

export async function removeCommitteeMember(committeeId: string, profileId: string): Promise<boolean> {
  const { error } = await supabase
    .from("committee_members")
    .delete()
    .eq("committee_id", committeeId)
    .eq("profile_id", profileId);
  if (error) { console.error("removeCommitteeMember:", error); return false; }
  return true;
}

// ─── Committee Meetings ───────────────────────────────────────────────────────

export async function fetchCommitteeMeetings(committeeId: string): Promise<CommitteeMeeting[]> {
  const { data, error } = await supabase
    .from("committee_meetings")
    .select("*")
    .eq("committee_id", committeeId)
    .order("start_at", { ascending: false });
  if (error) { console.error("fetchCommitteeMeetings:", error); return []; }
  return data as CommitteeMeeting[];
}

export async function fetchCommitteeMeetingById(id: string): Promise<CommitteeMeeting | null> {
  const { data, error } = await supabase
    .from("committee_meetings")
    .select("*")
    .eq("id", id)
    .single();
  if (error) { console.error("fetchCommitteeMeetingById:", error); return null; }
  return data as CommitteeMeeting;
}

export async function createCommitteeMeeting(
  params: {
    committee_id: string;
    org_id: string;
    title: string;
    title_uz?: string;
    title_en?: string;
    start_at: string;
    location?: string;
    notes?: string;
    created_by: string;
  }
): Promise<CommitteeMeeting | null> {
  const { data, error } = await supabase
    .from("committee_meetings")
    .insert(params)
    .select()
    .single();
  if (error) { console.error("createCommitteeMeeting:", error); return null; }
  return data as CommitteeMeeting;
}

export async function updateCommitteeMeeting(
  id: string,
  updates: Partial<Pick<CommitteeMeeting, "title" | "title_uz" | "title_en" | "start_at" | "status" | "location" | "notes">>
): Promise<boolean> {
  const { error } = await supabase.from("committee_meetings").update(updates).eq("id", id);
  if (error) { console.error("updateCommitteeMeeting:", error); return false; }
  return true;
}

export async function deleteCommitteeMeeting(id: string): Promise<boolean> {
  const { error } = await supabase.from("committee_meetings").delete().eq("id", id);
  if (error) { console.error("deleteCommitteeMeeting:", error); return false; }
  return true;
}

// ─── Agenda Items ─────────────────────────────────────────────────────────────

export async function fetchCommitteeAgendaItems(meetingId: string): Promise<CommitteeAgendaItem[]> {
  const { data, error } = await supabase
    .from("committee_agenda_items")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("order_index", { ascending: true });
  if (error) { console.error("fetchCommitteeAgendaItems:", error); return []; }
  return data as CommitteeAgendaItem[];
}

export async function createCommitteeAgendaItem(
  params: {
    meeting_id: string;
    committee_id: string;
    org_id: string;
    title: string;
    title_uz?: string;
    title_en?: string;
    presenter?: string;
    order_index: number;
  }
): Promise<CommitteeAgendaItem | null> {
  const { data, error } = await supabase
    .from("committee_agenda_items")
    .insert(params)
    .select()
    .single();
  if (error) { console.error("createCommitteeAgendaItem:", error); return null; }
  return data as CommitteeAgendaItem;
}

export async function updateCommitteeAgendaItem(
  id: string,
  updates: Partial<Pick<CommitteeAgendaItem, "title" | "title_uz" | "title_en" | "presenter" | "order_index">>
): Promise<boolean> {
  const { error } = await supabase.from("committee_agenda_items").update(updates).eq("id", id);
  if (error) { console.error("updateCommitteeAgendaItem:", error); return false; }
  return true;
}

export async function deleteCommitteeAgendaItem(id: string): Promise<boolean> {
  const { error } = await supabase.from("committee_agenda_items").delete().eq("id", id);
  if (error) { console.error("deleteCommitteeAgendaItem:", error); return false; }
  return true;
}

// ─── Votings ──────────────────────────────────────────────────────────────────

export async function fetchCommitteeVotings(agendaItemId: string): Promise<CommitteeVoting[]> {
  const { data, error } = await supabase
    .from("committee_votings")
    .select("*, votes:committee_votes(*)")
    .eq("agenda_item_id", agendaItemId)
    .order("created_at", { ascending: true });
  if (error) { console.error("fetchCommitteeVotings:", error); return []; }
  return data as CommitteeVoting[];
}

export async function fetchCommitteeVotingsByMeeting(meetingId: string): Promise<CommitteeVoting[]> {
  // First get agenda item ids for this meeting
  const { data: items } = await supabase
    .from("committee_agenda_items")
    .select("id")
    .eq("meeting_id", meetingId);
  if (!items?.length) return [];
  const ids = items.map((i: { id: string }) => i.id);
  const { data, error } = await supabase
    .from("committee_votings")
    .select("*, votes:committee_votes(*)")
    .in("agenda_item_id", ids);
  if (error) { console.error("fetchCommitteeVotingsByMeeting:", error); return []; }
  return data as CommitteeVoting[];
}

export async function createCommitteeVoting(
  agendaItemId: string,
  committeeId: string,
  orgId: string,
  title: string,
  createdBy: string,
  totalMembers: number
): Promise<CommitteeVoting | null> {
  const { data, error } = await supabase
    .from("committee_votings")
    .insert({ agenda_item_id: agendaItemId, committee_id: committeeId, org_id: orgId, title, created_by: createdBy, total_members: totalMembers, status: "open" })
    .select()
    .single();
  if (error) { console.error("createCommitteeVoting:", error); return null; }
  return data as CommitteeVoting;
}

export async function closeCommitteeVoting(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("committee_votings")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) { console.error("closeCommitteeVoting:", error); return false; }
  return true;
}

export async function castCommitteeVote(
  votingId: string,
  orgId: string,
  voterId: string,
  choice: "for" | "against" | "abstain"
): Promise<boolean> {
  const { error } = await supabase
    .from("committee_votes")
    .upsert({ voting_id: votingId, org_id: orgId, voter_id: voterId, choice }, { onConflict: "voting_id,voter_id" });
  if (error) { console.error("castCommitteeVote:", error); return false; }
  return true;
}

// ─── Documents ────────────────────────────────────────────────────────────────

const BUCKET = "documents";

export async function fetchCommitteeDocuments(committeeMeetingId: string): Promise<CommitteeDocument[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("committee_meeting_id", committeeMeetingId)
    .order("created_at", { ascending: false });
  if (error) { console.error("fetchCommitteeDocuments:", error); return []; }
  return data as CommitteeDocument[];
}

export async function uploadCommitteeDocument(
  file: File,
  orgId: string,
  uploadedBy: string,
  committeeMeetingId: string,
  language?: string
): Promise<CommitteeDocument | null> {
  const storagePath = `${orgId}/committee/${committeeMeetingId}/${Date.now()}_${file.name.replace(/[^a-zA-Zа-яА-Я0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
  if (uploadError) { console.error("uploadCommitteeDocument storage:", uploadError); throw new Error(uploadError.message); }
  const { data, error } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      committee_meeting_id: committeeMeetingId,
      title: file.name,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: storagePath,
      uploaded_by: uploadedBy,
      language: language || null,
    })
    .select()
    .single();
  if (error) { console.error("uploadCommitteeDocument insert:", error); throw new Error(error.message); }
  return data as CommitteeDocument;
}

export async function deleteCommitteeDocument(doc: CommitteeDocument): Promise<void> {
  await supabase.storage.from(BUCKET).remove([doc.storage_path]);
  await supabase.from("documents").delete().eq("id", doc.id);
}

export async function getCommitteeDocumentUrl(storagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  return data?.signedUrl ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function committeeTypeIcon(type: CommitteeType): string {
  switch (type) {
    case "audit":         return "📊";
    case "strategy":      return "🎯";
    case "nominations":   return "👥";
    case "anticorruption": return "🛡";
  }
}

export function committeeTypeColor(type: CommitteeType): string {
  switch (type) {
    case "audit":         return "#2563EB";
    case "strategy":      return "#059669";
    case "nominations":   return "#7C3AED";
    case "anticorruption": return "#DC2626";
  }
}

export function tallyCommitteeVotes(votes: CommitteeVote[]) {
  const forVotes     = votes.filter((v) => v.choice === "for").length;
  const againstVotes = votes.filter((v) => v.choice === "against").length;
  const abstainVotes = votes.filter((v) => v.choice === "abstain").length;
  return { forVotes, againstVotes, abstainVotes, total: votes.length };
}
