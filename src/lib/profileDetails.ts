import { supabase } from "./supabaseClient";
import i18n from "../i18n";

export type BoardStatus = "independent" | "executive" | "non_executive" | "employee";

export interface EducationEntry {
  degree_ru?: string;
  degree_en?: string;
  degree_uz?: string;
  specialty_ru?: string;
  specialty_en?: string;
  specialty_uz?: string;
  institution_ru?: string;
  institution_en?: string;
  institution_uz?: string;
  year_start?: string;
  year_end?: string;
}

export interface ProfileDetails {
  id: string;
  profile_id: string;
  board_status: BoardStatus | null;
  current_position_ru: string | null;
  current_position_en: string | null;
  current_position_uz: string | null;
  current_company_ru: string | null;
  current_company_en: string | null;
  current_company_uz: string | null;
  department_ru: string | null;
  department_en: string | null;
  department_uz: string | null;
  short_bio_ru: string | null;
  short_bio_en: string | null;
  short_bio_uz: string | null;
  education_ru: string | null;
  education_en: string | null;
  education_uz: string | null;
  education_entries: EducationEntry[] | null;
  work_experience_ru: string | null;
  work_experience_en: string | null;
  work_experience_uz: string | null;
  phone: string | null;
  contact_email: string | null;
  linkedin: string | null;
  telegram: string | null;
  is_profile_public: boolean;
  show_contacts: boolean;
  updated_at: string;
}

/** Get localized field value with fallback to RU then any */
export function getDetailField(
  details: ProfileDetails | null,
  fieldBase: string,
  lang?: string
): string {
  if (!details) return "";
  const currentLang = lang || i18n.language;
  const suffix = currentLang === "uz-Cyrl" ? "uz" : currentLang === "en" ? "en" : "ru";

  const key = `${fieldBase}_${suffix}` as keyof ProfileDetails;
  const val = details[key];
  if (typeof val === "string" && val.trim()) return val;

  // Fallback to RU
  if (suffix !== "ru") {
    const ruKey = `${fieldBase}_ru` as keyof ProfileDetails;
    const ruVal = details[ruKey];
    if (typeof ruVal === "string" && ruVal.trim()) return ruVal;
  }

  // Fallback to any available
  for (const s of ["ru", "en", "uz"]) {
    if (s === suffix) continue;
    const k = `${fieldBase}_${s}` as keyof ProfileDetails;
    const v = details[k];
    if (typeof v === "string" && v.trim()) return v;
  }

  return "";
}

/** Fetch profile details by profile ID */
export async function fetchProfileDetails(profileId: string): Promise<ProfileDetails | null> {
  const { data, error } = await supabase
    .from("profile_details")
    .select("*")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    console.error("fetchProfileDetails error:", error);
    return null;
  }
  return data as ProfileDetails | null;
}

/** Fetch my own profile details */
export async function fetchMyProfileDetails(): Promise<ProfileDetails | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return fetchProfileDetails(session.user.id);
}

/** Upsert profile details (create or update) */
export async function upsertProfileDetails(
  profileId: string,
  updates: Partial<Omit<ProfileDetails, "id" | "profile_id" | "updated_at">>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("profile_details")
    .upsert(
      { profile_id: profileId, ...updates, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" }
    );

  if (error) {
    console.error("upsertProfileDetails error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ── Avatar ──────────────────────────────────────────────────────────

const AVATAR_BUCKET = "profile-photos";
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Upload avatar photo and update profile */
export async function uploadAvatar(
  profileId: string,
  file: File
): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "Допустимые форматы: JPG, PNG, WebP" };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "Максимальный размер файла: 5 МБ" };
  }

  const ext = file.name.split(".").pop() || "jpg";
  const storagePath = `${profileId}/avatar_${Date.now()}.${ext}`;

  // Upload file
  const { error: uploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(storagePath, file, { upsert: true });

  if (uploadErr) {
    console.error("uploadAvatar error:", uploadErr);
    return { ok: false, error: uploadErr.message };
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(AVATAR_BUCKET)
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // Update profile
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", profileId);

  if (updateErr) {
    console.error("updateAvatar error:", updateErr);
    return { ok: false, error: updateErr.message };
  }

  return { ok: true, url: publicUrl };
}

/** Remove avatar */
export async function removeAvatar(profileId: string): Promise<{ ok: boolean; error?: string }> {
  // Clear avatar_url in profile
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", profileId);

  if (error) {
    console.error("removeAvatar error:", error);
    return { ok: false, error: error.message };
  }

  // Try to delete old files from storage (best effort)
  const { data: files } = await supabase.storage
    .from(AVATAR_BUCKET)
    .list(profileId);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${profileId}/${f.name}`);
    await supabase.storage.from(AVATAR_BUCKET).remove(paths);
  }

  return { ok: true };
}
