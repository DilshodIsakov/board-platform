import { supabase } from "./supabaseClient";

export interface Profile {
  id: string;
  organization_id: string;
  role: string;
  full_name: string;
  shares_count: number;
  locale: string;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

/**
 * Загрузить профиль текущего пользователя.
 */
export async function getMyProfile(): Promise<Profile | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id) // ВАЖНО: id, а не user_id
    .single();

  if (error) {
    console.error("getMyProfile error:", error);
    return null;
  }

  return data as Profile;
}

/**
 * Загрузить организацию текущего пользователя.
 */
export async function getMyOrg(): Promise<Organization | null> {
  const profile = await getMyProfile();
  if (!profile) return null;

  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.organization_id)
    .single();

  if (error) {
    console.error("getMyOrg error:", error);
    return null;
  }

  return data as Organization;
}

/**
 * Сохранить выбранный язык в профиль.
 */
export async function updateProfileLocale(locale: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return;

  const { error } = await supabase
    .from("profiles")
    .update({ locale })
    .eq("id", session.user.id);

  if (error) {
    console.error("updateProfileLocale error:", error);
  }
}