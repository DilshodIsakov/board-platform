import { supabase } from "./supabaseClient";

export interface Voting {
  id: string;
  agenda_item_id: string;
  org_id: string;
  title: string;
  description: string;
  status: "open" | "closed";
  deadline: string | null;
  total_members: number;
  created_by: string;
  created_at: string;
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

/** Загрузить все голосования заседания (через agenda_items) */
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

/** Создать голосование */
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
    })
    .select()
    .single();

  if (error) {
    console.error("createVoting error:", error);
    throw new Error(error.message);
  }

  return data as Voting;
}

/** Закрыть голосование */
export async function closeVoting(votingId: string): Promise<void> {
  const { error } = await supabase
    .from("votings")
    .update({ status: "closed" })
    .eq("id", votingId);

  if (error) {
    console.error("closeVoting error:", error);
    throw new Error(error.message);
  }
}

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
