import { supabase } from "./supabaseClient";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Voting {
  id: string;
  agenda_item_id: string;
  org_id: string;
  title: string;
  description: string;
  status: "draft" | "open" | "closed";
  deadline: string | null;
  total_members: number;
  created_by: string;
  created_at: string;
  activated_at: string | null;
  activated_by: string | null;
  closed_at: string | null;
  votes?: Vote[];
}

export interface Vote {
  id: string;
  voting_id: string;
  org_id: string;
  voter_id: string;
  choice: "for" | "against" | "abstain";
  created_at: string;
}

export interface MeetingVoteSignature {
  id: string;
  meeting_id: string;
  user_id: string;
  org_id: string;
  signed_at: string;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** Загрузить все голосования организации (с голосами) */
export async function fetchAllVotings(): Promise<Voting[]> {
  const { data, error } = await supabase
    .from("votings")
    .select("*, votes(*)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchAllVotings error:", error);
    return [];
  }
  return data as Voting[];
}

/** Загрузить голосования по набору agenda_item_id (для заседания) */
export async function fetchVotingsByAgendaItems(agendaItemIds: string[]): Promise<Voting[]> {
  if (!agendaItemIds.length) return [];
  const { data, error } = await supabase
    .from("votings")
    .select("*, votes(*)")
    .in("agenda_item_id", agendaItemIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchVotingsByAgendaItems error:", error);
    return [];
  }
  return data as Voting[];
}

/** Загрузить голосования по пункту повестки (с голосами) */
export async function fetchVotingsByAgendaItem(agendaItemId: string): Promise<Voting[]> {
  const { data, error } = await supabase
    .from("votings")
    .select("*, votes(*)")
    .eq("agenda_item_id", agendaItemId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchVotingsByAgendaItem error:", error);
    return [];
  }
  return data as Voting[];
}

/** Загрузить все голосования заседания через agenda_items join */
export async function fetchVotingsByMeeting(meetingId: string): Promise<Voting[]> {
  const { data, error } = await supabase
    .from("votings")
    .select("*, votes(*), agenda_items!inner(meeting_id)")
    .eq("agenda_items.meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchVotingsByMeeting error:", error);
    return [];
  }
  return data as Voting[];
}

/** Загрузить все голосования с meeting_id из agenda_items (для дашборда) */
export interface VotingWithMeeting extends Voting {
  meeting_id: string;
}

export async function fetchAllVotingsWithMeeting(): Promise<VotingWithMeeting[]> {
  const { data, error } = await supabase
    .from("votings")
    .select("*, votes(*), agenda_items!inner(meeting_id)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchAllVotingsWithMeeting error:", error);
    return [];
  }

  return (data || []).map((row: Record<string, unknown>) => ({
    ...(row as unknown as Voting),
    meeting_id: (row.agenda_items as { meeting_id: string } | null)?.meeting_id ?? "",
    agenda_items: undefined,
  })) as VotingWithMeeting[];
}

// ─── Voting lifecycle ─────────────────────────────────────────────────────────

/** Создать голосование сразу активным (status = 'open') */
export async function createAndActivateVoting(
  agendaItemId: string,
  orgId: string,
  profileId: string,
  title: string
): Promise<Voting> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("votings")
    .insert({
      agenda_item_id: agendaItemId,
      org_id: orgId,
      created_by: profileId,
      title,
      description: "",
      status: "open",
      activated_at: now,
      activated_by: profileId,
    })
    .select("*, votes(*)")
    .single();

  if (error) {
    console.error("createAndActivateVoting error:", error);
    throw new Error(error.message);
  }
  return { ...(data as Voting), votes: [] };
}

/** Создать голосование (legacy — для обратной совместимости) */
export async function createVoting(
  agendaItemId: string,
  orgId: string,
  profileId: string,
  title: string,
  description: string = "",
  deadline: string | null = null,
  totalMembers: number = 8
): Promise<Voting | null> {
  const { data, error } = await supabase
    .from("votings")
    .insert({
      agenda_item_id: agendaItemId,
      org_id: orgId,
      created_by: profileId,
      title,
      description,
      deadline,
      total_members: totalMembers,
      status: "open",
      activated_at: new Date().toISOString(),
      activated_by: profileId,
    })
    .select()
    .single();

  if (error) {
    console.error("createVoting error:", error);
    throw new Error(error.message);
  }
  return data as Voting;
}

/** Активировать существующий черновик голосования */
export async function activateVoting(votingId: string, profileId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("votings")
    .update({ status: "open", activated_at: now, activated_by: profileId })
    .eq("id", votingId);

  if (error) {
    console.error("activateVoting error:", error);
    throw new Error(error.message);
  }
}

/** Завершить голосование по вопросу */
export async function closeVotingItem(votingId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("votings")
    .update({ status: "closed", closed_at: now })
    .eq("id", votingId);

  if (error) {
    console.error("closeVotingItem error:", error);
    throw new Error(error.message);
  }
}

/** Закрыть голосование (legacy alias) */
export async function closeVoting(votingId: string): Promise<void> {
  return closeVotingItem(votingId);
}

// ─── Votes ────────────────────────────────────────────────────────────────────

/** Отдать голос (upsert — перегосовать если уже голосовал) */
export async function castVote(
  votingId: string,
  orgId: string,
  voterId: string,
  choice: "for" | "against" | "abstain"
): Promise<Vote | null> {
  const { data, error } = await supabase
    .from("votes")
    .upsert(
      { voting_id: votingId, org_id: orgId, voter_id: voterId, choice },
      { onConflict: "voting_id,voter_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("castVote error:", error);
    throw new Error(error.message);
  }
  return data as Vote;
}

/** Подсчёт голосов */
export function tallyBoardVotes(votes: Vote[]) {
  let forCount = 0;
  let againstCount = 0;
  let abstainCount = 0;

  for (const v of votes) {
    if (v.choice === "for") forCount++;
    else if (v.choice === "against") againstCount++;
    else abstainCount++;
  }

  return { forCount, againstCount, abstainCount, total: forCount + againstCount + abstainCount };
}

// ─── Meeting-level signature ──────────────────────────────────────────────────

/** Подписать пакет голосов по заседанию (одна подпись на члена на заседание) */
export async function signMeetingVotes(
  meetingId: string,
  userId: string,
  orgId: string
): Promise<void> {
  const { error } = await supabase
    .from("meeting_vote_signatures")
    .insert({ meeting_id: meetingId, user_id: userId, org_id: orgId });

  if (error) {
    console.error("signMeetingVotes error:", error);
    throw new Error(error.message);
  }
}

/** Проверить, подписал ли пользователь голоса по заседанию */
export async function fetchMeetingSignature(
  meetingId: string,
  userId: string
): Promise<MeetingVoteSignature | null> {
  const { data, error } = await supabase
    .from("meeting_vote_signatures")
    .select("*")
    .eq("meeting_id", meetingId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("fetchMeetingSignature error:", error);
    return null;
  }
  return data as MeetingVoteSignature | null;
}

/** Загрузить все подписи по заседанию (для отображения прогресса) */
export async function fetchMeetingSignatures(
  meetingId: string
): Promise<MeetingVoteSignature[]> {
  const { data, error } = await supabase
    .from("meeting_vote_signatures")
    .select("*")
    .eq("meeting_id", meetingId);

  if (error) {
    console.error("fetchMeetingSignatures error:", error);
    return [];
  }
  return (data || []) as MeetingVoteSignature[];
}

/** Загрузить все подписи пользователя (meeting_id -> signature) */
export async function fetchMySignatures(
  userId: string
): Promise<Record<string, MeetingVoteSignature>> {
  const { data, error } = await supabase
    .from("meeting_vote_signatures")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    console.error("fetchMySignatures error:", error);
    return {};
  }

  const map: Record<string, MeetingVoteSignature> = {};
  for (const row of (data || []) as MeetingVoteSignature[]) {
    map[row.meeting_id] = row;
  }
  return map;
}
