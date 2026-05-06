import { supabase } from "./supabaseClient";

export interface AgendaItem {
  id: string;
  meeting_id: string;
  org_id: string;
  title: string;
  title_ru: string | null;
  title_en: string | null;
  title_uz: string | null;
  order_index: number;
  presenter: string | null;
  presenter_ru: string | null;
  presenter_en: string | null;
  presenter_uz: string | null;
  decisions?: Decision[];
}

export interface Decision {
  id: string;
  agenda_item_id: string;
  org_id: string;
  decision_text: string;
  status: "proposed" | "approved" | "rejected";
  created_at: string;
}

/** Загрузить пункты повестки с решениями */
export async function fetchAgendaItems(meetingId: string): Promise<AgendaItem[]> {
  const { data, error } = await supabase
    .from("agenda_items")
    .select("*, decisions(*)")
    .eq("meeting_id", meetingId)
    .order("order_index", { ascending: true });

  if (error) {
    console.error("fetchAgendaItems error:", error);
    return [];
  }

  return data as AgendaItem[];
}

/** Добавить пункт повестки */
export async function createAgendaItem(
  meetingId: string,
  orgId: string,
  title: string,
  orderIndex: number,
  presenter?: string
): Promise<AgendaItem | null> {
  const { data, error } = await supabase
    .from("agenda_items")
    .insert({
      meeting_id: meetingId,
      org_id: orgId,
      title,
      order_index: orderIndex,
      presenter: presenter || null,
    })
    .select()
    .single();

  if (error) {
    console.error("createAgendaItem error:", error);
    throw new Error(error.message);
  }

  return data as AgendaItem;
}

/** Добавить решение к пункту повестки */
export async function createDecision(
  agendaItemId: string,
  orgId: string,
  decisionText: string
): Promise<Decision | null> {
  const { data, error } = await supabase
    .from("decisions")
    .insert({
      agenda_item_id: agendaItemId,
      org_id: orgId,
      decision_text: decisionText,
      status: "proposed",
    })
    .select()
    .single();

  if (error) {
    console.error("createDecision error:", error);
    throw new Error(error.message);
  }

  return data as Decision;
}
