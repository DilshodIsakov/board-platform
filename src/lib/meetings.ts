import { supabase } from "./supabaseClient";

export interface Meeting {
  id: string;
  organization_id: string;
  title: string; // backward compat
  title_ru: string | null;
  title_uz: string | null;
  title_en: string | null;
  source_language: string;
  start_at: string;
  location: string | null;
  meet_url: string | null;
  status: "draft" | "scheduled" | "completed";
  source?: string;
  plan_meeting_id?: string;
  created_by: string;
  created_at: string;
}

/** Загрузить все meetings текущей организации (новые сверху) */
export async function fetchMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("start_at", { ascending: false });

  if (error) {
    console.error("fetchMeetings error:", error);
    return [];
  }

  return data as Meeting[];
}

/** Создать новое заседание (быстрая форма Dashboard — сохраняет title_ru) */
export async function createMeeting(
  orgId: string,
  profileId: string,
  title: string,
  startAt: string,
  meetUrl?: string
): Promise<Meeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      organization_id: orgId,
      title,
      title_ru: title,
      source_language: "ru",
      translation_status_ru: "original",
      translation_status_uz: "missing",
      translation_status_en: "missing",
      start_at: startAt,
      status: "scheduled",
      created_by: profileId,
      ...(meetUrl ? { meet_url: meetUrl } : {}),
    })
    .select()
    .single();

  if (error) {
    console.error("createMeeting error:", error);
    throw new Error(error.message);
  }

  return data as Meeting;
}

/** Обновить ссылку на видеоконференцию */
export async function updateMeetUrl(meetingId: string, meetUrl: string | null): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({ meet_url: meetUrl || null })
    .eq("id", meetingId);

  if (error) {
    console.error("updateMeetUrl error:", error);
    throw new Error(error.message);
  }
}
