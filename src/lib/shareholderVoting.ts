import { supabase } from "./supabaseClient";

export interface ShareholderVote {
  id: string;
  agenda_item_id: string;
  voter_id: string;
  choice: "for" | "against" | "abstain";
  shares_count: number;
  created_at: string;
}

/** Загрузить все голоса по пункту повестки */
export async function fetchVotesByAgendaItem(agendaItemId: string): Promise<ShareholderVote[]> {
  const { data, error } = await supabase
    .from("shareholder_votes")
    .select("*")
    .eq("agenda_item_id", agendaItemId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchVotesByAgendaItem error:", error);
    return [];
  }

  return data as ShareholderVote[];
}

/** Загрузить все голоса по всем пунктам собрания */
export async function fetchVotesByMeeting(agendaItemIds: string[]): Promise<ShareholderVote[]> {
  if (agendaItemIds.length === 0) return [];

  const { data, error } = await supabase
    .from("shareholder_votes")
    .select("*")
    .in("agenda_item_id", agendaItemIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchVotesByMeeting error:", error);
    return [];
  }

  return data as ShareholderVote[];
}

/** Отдать голос (upsert — перегосовать если уже голосовал) */
export async function castShareholderVote(
  agendaItemId: string,
  voterId: string,
  choice: "for" | "against" | "abstain",
  sharesCount: number = 0
): Promise<ShareholderVote | null> {
  const { data, error } = await supabase
    .from("shareholder_votes")
    .upsert(
      {
        agenda_item_id: agendaItemId,
        voter_id: voterId,
        choice,
        shares_count: sharesCount,
      },
      { onConflict: "agenda_item_id,voter_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("castShareholderVote error:", error);
    throw new Error(error.message);
  }

  return data as ShareholderVote;
}

/** Подсчёт голосов по пункту повестки (взвешенный по акциям) */
export function tallyVotes(votes: ShareholderVote[]) {
  let forShares = 0;
  let againstShares = 0;
  let abstainShares = 0;
  let forVoters = 0;
  let againstVoters = 0;
  let abstainVoters = 0;

  for (const v of votes) {
    if (v.choice === "for") {
      forShares += v.shares_count;
      forVoters++;
    } else if (v.choice === "against") {
      againstShares += v.shares_count;
      againstVoters++;
    } else {
      abstainShares += v.shares_count;
      abstainVoters++;
    }
  }

  const totalShares = forShares + againstShares + abstainShares;
  const totalVoters = forVoters + againstVoters + abstainVoters;

  return {
    forShares, againstShares, abstainShares, totalShares,
    forVoters, againstVoters, abstainVoters, totalVoters,
  };
}
