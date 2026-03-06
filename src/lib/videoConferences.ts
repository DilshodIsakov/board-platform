import { supabase } from "./supabaseClient";

export interface VideoConference {
  id: string;
  organization_id: string;
  title: string;
  scheduled_at: string;
  meeting_url: string | null;
  created_by: string;
  created_at: string;
}

export async function fetchVideoConferences(): Promise<VideoConference[]> {
  const { data, error } = await supabase
    .from("video_conferences")
    .select("*")
    .order("scheduled_at", { ascending: true });

  if (error) {
    console.error("fetchVideoConferences error:", error);
    return [];
  }
  return data as VideoConference[];
}

export async function createVideoConference(
  orgId: string,
  createdBy: string,
  title: string,
  scheduledAt: string,
  meetingUrl: string | null
): Promise<VideoConference | null> {
  const { data, error } = await supabase
    .from("video_conferences")
    .insert({
      organization_id: orgId,
      title,
      scheduled_at: scheduledAt,
      meeting_url: meetingUrl || null,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error) {
    console.error("createVideoConference error:", error);
    throw new Error(error.message);
  }
  return data as VideoConference;
}

export async function deleteVideoConference(id: string): Promise<void> {
  const { error } = await supabase
    .from("video_conferences")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("deleteVideoConference error:", error);
    throw new Error(error.message);
  }
}
