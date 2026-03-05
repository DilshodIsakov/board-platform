import { supabase } from "./supabaseClient";

export interface Meeting {
  id: string;
  organization_id: string;
  title: string;
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

/** Создать новое заседание */
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
