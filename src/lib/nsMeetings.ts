import { supabase, supabaseAnonKey } from "./supabaseClient";

// ---------- Types ----------

export interface NSMeeting {
  id: string;
  organization_id: string;
  title: string; // backward compat — mirrors source language
  title_ru: string | null;
  title_uz: string | null;
  title_en: string | null;
  source_language: string;
  translation_status_ru: string;
  translation_status_uz: string;
  translation_status_en: string;
  translation_updated_at: string | null;
  start_at: string;
  location: string | null;
  meet_url: string | null;
  status: "draft" | "scheduled" | "completed";
  created_by: string;
  created_at: string;
  materials_ready: boolean;
  // Video conference
  video_conference_url: string | null;
  video_conference_provider: string | null;
  video_conference_enabled: boolean;
  video_conference_started_at: string | null;
  video_conference_started_by: string | null;
  video_conference_title: string | null;
  video_conference_notes: string | null;
}

export interface AgendaItem {
  id: string;
  meeting_id: string;
  org_id: string;
  title: string; // backward compat — mirrors source language
  title_ru: string | null;
  title_uz: string | null;
  title_en: string | null;
  order_index: number;
  presenter: string | null; // backward compat
  presenter_ru: string | null;
  presenter_uz: string | null;
  presenter_en: string | null;
  source_language: string;
  translation_status_ru: string;
  translation_status_uz: string;
  translation_status_en: string;
  ai_brief_enabled: boolean;
  translation_updated_at: string | null;
}

export interface AgendaItemPayload {
  title: string;
  title_ru?: string | null;
  title_uz?: string | null;
  title_en?: string | null;
  presenter?: string | null;
  presenter_ru?: string | null;
  presenter_uz?: string | null;
  presenter_en?: string | null;
  source_language?: string;
  translation_status_ru?: string;
  translation_status_uz?: string;
  translation_status_en?: string;
  ai_brief_enabled?: boolean;
}

export type MaterialLang = "ru" | "uz" | "en";

export interface Material {
  id: string;
  org_id: string;
  meeting_id: string | null;
  agenda_item_id: string | null;
  title: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  storage_path: string;
  uploaded_by: string;
  created_at: string;
  language: MaterialLang | null;
}

// ---------- Meetings ----------

export async function fetchNSMeetingById(id: string): Promise<NSMeeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .single();
  if (error) { console.error("fetchNSMeetingById error:", error); return null; }
  return data as NSMeeting;
}

export async function fetchNSMeetings(): Promise<NSMeeting[]> {
  const { data, error } = await supabase
    .from("meetings")
    .select("*")
    .order("start_at", { ascending: true });

  if (error) {
    console.error("fetchNSMeetings error:", error);
    return [];
  }
  return data as NSMeeting[];
}

export interface NSMeetingPayload {
  title: string;
  title_ru?: string | null;
  title_uz?: string | null;
  title_en?: string | null;
  source_language?: string;
  translation_status_ru?: string;
  translation_status_uz?: string;
  translation_status_en?: string;
  start_at: string;
  status: string;
}

export async function createNSMeeting(
  orgId: string,
  createdBy: string,
  payload: NSMeetingPayload
): Promise<NSMeeting | null> {
  const { data, error } = await supabase
    .from("meetings")
    .insert({
      organization_id: orgId,
      created_by: createdBy,
      ...payload,
      translation_updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("createNSMeeting error:", error);
    throw new Error(error.message);
  }
  return data as NSMeeting;
}

export async function updateNSMeeting(
  id: string,
  fields: Partial<NSMeetingPayload>
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({ ...fields, translation_updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("updateNSMeeting error:", error);
    throw new Error(error.message);
  }
}

export async function deleteNSMeeting(id: string): Promise<void> {
  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) {
    console.error("deleteNSMeeting error:", error);
    throw new Error(error.message);
  }
}

// ---------- Agenda Items ----------

export async function fetchAgendaItems(meetingId: string): Promise<AgendaItem[]> {
  const { data, error } = await supabase
    .from("agenda_items")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("order_index", { ascending: true });

  if (error) {
    console.error("fetchAgendaItems error:", error);
    return [];
  }
  return data as AgendaItem[];
}

export async function createAgendaItem(
  meetingId: string,
  orgId: string,
  orderIndex: number,
  payload: AgendaItemPayload
): Promise<AgendaItem | null> {
  const { data, error } = await supabase
    .from("agenda_items")
    .insert({
      meeting_id: meetingId,
      org_id: orgId,
      order_index: orderIndex,
      ...payload,
      translation_updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("createAgendaItem error:", error);
    throw new Error(error.message);
  }
  return data as AgendaItem;
}

export async function updateAgendaItem(
  id: string,
  fields: Partial<AgendaItemPayload> & { order_index?: number }
): Promise<void> {
  const { error } = await supabase
    .from("agenda_items")
    .update({ ...fields, translation_updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("updateAgendaItem error:", error);
    throw new Error(error.message);
  }
}

export async function deleteAgendaItem(id: string): Promise<void> {
  const { error } = await supabase.from("agenda_items").delete().eq("id", id);
  if (error) {
    console.error("deleteAgendaItem error:", error);
    throw new Error(error.message);
  }
}

// ---------- Materials (documents) ----------

export async function fetchMaterialsByAgenda(agendaItemId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("agenda_item_id", agendaItemId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchMaterialsByAgenda error:", error);
    return [];
  }
  return data as Material[];
}

export async function fetchMaterialsByMeeting(meetingId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("fetchMaterialsByMeeting error:", error);
    return [];
  }
  return data as Material[];
}

const BUCKET = "documents";

function sanitizeFileName(name: string): string {
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : "";
  const base = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const map: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"y",к:"k",л:"l",м:"m",
    н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"sch",
    ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"Yo",Ж:"Zh",З:"Z",И:"I",Й:"Y",К:"K",Л:"L",М:"M",
    Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Sch",
    Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
  };
  const transliterated = base.split("").map((c) => map[c] ?? c).join("");
  const safe = transliterated.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return (safe || "file") + ext;
}

export async function uploadMaterial(
  file: File,
  orgId: string,
  uploadedBy: string,
  meetingId: string,
  agendaItemId: string | null,
  title: string,
  language?: MaterialLang
): Promise<Material | null> {
  const agendaSegment = agendaItemId ? `${agendaItemId}/` : "meeting/";
  const langSegment = language ? `${language}/` : "";
  const storagePath = `${orgId}/${meetingId}/${agendaSegment}${langSegment}${Date.now()}_${sanitizeFileName(file.name)}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file);
  if (uploadError) {
    console.error("uploadMaterial storage error:", uploadError);
    throw new Error(uploadError.message);
  }

  const { data, error } = await supabase
    .from("documents")
    .insert({
      org_id: orgId,
      meeting_id: meetingId,
      agenda_item_id: agendaItemId || null,
      title,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || "application/octet-stream",
      storage_path: storagePath,
      uploaded_by: uploadedBy,
      language: language || null,
    })
    .select()
    .single();

  if (error) {
    console.error("uploadMaterial insert error:", error);
    throw new Error(error.message);
  }
  return data as Material;
}

export async function deleteMaterial(mat: Material): Promise<void> {
  await supabase.storage.from(BUCKET).remove([mat.storage_path]);
  const { error } = await supabase.from("documents").delete().eq("id", mat.id);
  if (error) {
    console.error("deleteMaterial error:", error);
    throw new Error(error.message);
  }
}

export async function getMaterialUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error) {
    console.error("getMaterialUrl error:", error);
    return null;
  }
  return data.signedUrl;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " Б";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " КБ";
  return (bytes / (1024 * 1024)).toFixed(1) + " МБ";
}

export function getFileTypeLabel(mime: string): string {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("word") || mime.includes(".document")) return "Word";
  if (mime.includes("excel") || mime.includes("spreadsheet")) return "Excel";
  if (mime.includes("powerpoint") || mime.includes("presentation")) return "PowerPoint";
  return "Файл";
}

// ---------- AI Brief ----------

export type BriefLang = "ru" | "uz_cyrl" | "en";

export interface AgendaBrief {
  id: string;
  agenda_id: string;
  lang: BriefLang;
  brief_text: string;
  files_used: number;
  docx_path: string | null;
  updated_at: string;
  updated_by: string;
}

/** Fetch all briefs (all languages) for a list of agenda items */
export async function fetchBriefsForMeeting(agendaIds: string[]): Promise<Record<string, AgendaBrief[]>> {
  if (agendaIds.length === 0) return {};
  const { data, error } = await supabase
    .from("agenda_briefs")
    .select("*")
    .in("agenda_id", agendaIds);

  if (error) {
    console.error("fetchBriefsForMeeting error:", error);
    return {};
  }
  const map: Record<string, AgendaBrief[]> = {};
  for (const b of (data || [])) {
    const brief = b as AgendaBrief;
    if (!map[brief.agenda_id]) map[brief.agenda_id] = [];
    map[brief.agenda_id].push(brief);
  }
  return map;
}

/** Get signed URL for a stored DOCX brief */
export async function getBriefDocxUrl(docxPath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("briefs")
    .createSignedUrl(docxPath, 600);
  if (error) {
    console.error("getBriefDocxUrl error:", error);
    return null;
  }
  return data.signedUrl;
}

export interface GenerateBriefResult {
  brief: string;
  lang: BriefLang;
  docx_url: string;
  files_used: number;
}

export async function generateBrief(agendaId: string, lang: BriefLang = "ru"): Promise<GenerateBriefResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Not authenticated — please log in again");
  }

  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const response = await fetch(`${url}/functions/v1/agenda-brief`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agenda_id: agendaId, lang }),
  });

  const text = await response.text();
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(`Server returned ${response.status}: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const parts = [String(result.error || `HTTP ${response.status}`)];
    if (result.step) parts.push(`[${result.step}]`);
    if (result.details) parts.push(String(result.details));
    throw new Error(parts.join(" — "));
  }

  return result as unknown as GenerateBriefResult;
}

// ---------- Video Conference ----------

export interface VideoConferencePayload {
  video_conference_url?: string | null;
  video_conference_provider?: string | null;
  video_conference_title?: string | null;
  video_conference_notes?: string | null;
  video_conference_enabled?: boolean;
  video_conference_started_at?: string | null;
  video_conference_started_by?: string | null;
}

export async function updateMeetingVideoConference(
  meetingId: string,
  fields: VideoConferencePayload
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update(fields)
    .eq("id", meetingId);
  if (error) {
    console.error("updateMeetingVideoConference error:", error);
    throw new Error(error.message);
  }
}

export async function activateMeetingVideoConference(
  meetingId: string,
  startedBy: string
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({
      video_conference_enabled: true,
      video_conference_started_at: new Date().toISOString(),
      video_conference_started_by: startedBy,
    })
    .eq("id", meetingId);
  if (error) {
    console.error("activateMeetingVideoConference error:", error);
    throw new Error(error.message);
  }
}

export async function deactivateMeetingVideoConference(
  meetingId: string
): Promise<void> {
  const { error } = await supabase
    .from("meetings")
    .update({
      video_conference_enabled: false,
      video_conference_started_at: null,
      video_conference_started_by: null,
    })
    .eq("id", meetingId);
  if (error) {
    console.error("deactivateMeetingVideoConference error:", error);
    throw new Error(error.message);
  }
}
