import { supabase } from "./supabaseClient";

export interface ShareholderMeeting {
  id: string;
  organization_id: string;
  title: string;
  meeting_type: "annual" | "extraordinary";
  meeting_date: string;
  status: "scheduled" | "completed" | "cancelled";
  total_shares: number;
  voted_shares: number;
  created_by: string;
  created_at: string;
}

export interface ShareholderAgendaItem {
  id: string;
  meeting_id: string;
  order_index: number;
  title: string;
  created_at: string;
}

export interface ShareholderMaterial {
  id: string;
  meeting_id: string;
  title: string;
  status: "available" | "pending";
  file_url: string | null;
  created_at: string;
}

/** Загрузить все собрания акционеров организации */
export async function fetchShareholderMeetings(): Promise<ShareholderMeeting[]> {
  const { data, error } = await supabase
    .from("shareholder_meetings")
    .select("*")
    .order("meeting_date", { ascending: false });

  if (error) {
    console.error("fetchShareholderMeetings error:", error);
    return [];
  }

  return data as ShareholderMeeting[];
}

/** Создать собрание акционеров */
export async function createShareholderMeeting(
  orgId: string,
  profileId: string,
  title: string,
  meetingDate: string,
  meetingType: "annual" | "extraordinary" = "annual",
  totalShares: number = 1000000
): Promise<ShareholderMeeting> {
  const { data, error } = await supabase
    .from("shareholder_meetings")
    .insert({
      organization_id: orgId,
      created_by: profileId,
      title,
      meeting_date: meetingDate,
      meeting_type: meetingType,
      total_shares: totalShares,
    })
    .select()
    .single();

  if (error) {
    console.error("createShareholderMeeting error:", error);
    throw new Error(error.message);
  }

  return data as ShareholderMeeting;
}

/** Загрузить повестку дня собрания */
export async function fetchAgendaItems(meetingId: string): Promise<ShareholderAgendaItem[]> {
  const { data, error } = await supabase
    .from("shareholder_agenda_items")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("order_index", { ascending: true });

  if (error) {
    console.error("fetchAgendaItems error:", error);
    return [];
  }

  return data as ShareholderAgendaItem[];
}

/** Добавить пункт повестки дня */
export async function addAgendaItem(
  meetingId: string,
  title: string,
  orderIndex: number
): Promise<ShareholderAgendaItem> {
  const { data, error } = await supabase
    .from("shareholder_agenda_items")
    .insert({ meeting_id: meetingId, title, order_index: orderIndex })
    .select()
    .single();

  if (error) {
    console.error("addAgendaItem error:", error);
    throw new Error(error.message);
  }

  return data as ShareholderAgendaItem;
}

/** Загрузить материалы собрания */
export async function fetchMaterials(meetingId: string): Promise<ShareholderMaterial[]> {
  const { data, error } = await supabase
    .from("shareholder_materials")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchMaterials error:", error);
    return [];
  }

  return data as ShareholderMaterial[];
}

/** Завершить собрание — подсчитать проголосованные акции и сменить статус */
export async function completeMeeting(meetingId: string, votedShares: number): Promise<ShareholderMeeting | null> {
  const { data, error } = await supabase
    .from("shareholder_meetings")
    .update({ status: "completed", voted_shares: votedShares })
    .eq("id", meetingId)
    .select()
    .single();

  if (error) {
    console.error("completeMeeting error:", error);
    throw new Error(error.message);
  }

  return data as ShareholderMeeting;
}

/** Добавить материал */
export async function addMaterial(
  meetingId: string,
  title: string,
  fileUrl?: string
): Promise<ShareholderMaterial> {
  const { data, error } = await supabase
    .from("shareholder_materials")
    .insert({
      meeting_id: meetingId,
      title,
      file_url: fileUrl || null,
      status: fileUrl ? "available" : "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("addMaterial error:", error);
    throw new Error(error.message);
  }

  return data as ShareholderMaterial;
}
