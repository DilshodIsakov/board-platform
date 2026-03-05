import { supabase } from "./supabaseClient";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "corp_secretary" | "board_member" | "management";
  created_at: string;
  updated_at?: string;
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
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("getMyProfile error:", error);
    return null;
  }

  return data as Profile;
}

/**
 * Получить список всех профилей (для админ-панели).
 */
export async function getAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getAllProfiles error:", error);
    return [];
  }

  return data as Profile[];
}

/**
 * Обновить роль пользователя (только для админов).
 */
export async function updateUserRole(userId: string, role: Profile["role"]): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    console.error("updateUserRole error:", error);
    return false;
  }

  return true;
}

/**
 * Обновить свой профиль (имя, фото и т.д., но не роль).
 */
export async function updateMyProfile(updates: { full_name?: string }): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;

  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", session.user.id);

  if (error) {
    console.error("updateMyProfile error:", error);
    return false;
  }

  return true;
}

/**
 * Запросить повторно письмо с подтверждением.
 */
export async function resendConfirmationEmail(email: string): Promise<boolean> {
  try {
    await supabase.auth.resend({
      type: "signup",
      email,
    });
    return true;
  } catch (error) {
    console.error("resendConfirmationEmail error:", error);
    return false;
  }
}

/**
 * Загрузить организацию текущего пользователя (оставлена для совместимости, возвращает null).
 */
export async function getMyOrg(): Promise<Organization | null> {
  return null;
}

/**
 * Сохранить выбранный язык в профиль (оставлена для совместимости, ничего не делает).
 */
export async function updateProfileLocale(_locale: string): Promise<void> {
  // В однокомпанийной системе на данный момент не используется
}