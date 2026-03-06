import { supabase, supabaseAnonKey } from "./supabaseClient";

export type UserRole = "admin" | "corp_secretary" | "board_member" | "management" | "executive" | "employee" | "auditor";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  role_details?: string | null;
  created_at: string;
  updated_at?: string;
}

export const ROLE_OPTIONS: UserRole[] = [
  "admin",
  "board_member",
  "executive",
  "employee",
  "corp_secretary",
  "auditor",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  board_member: "Член НС",
  executive: "Член Правления",
  employee: "Сотрудник",
  corp_secretary: "Секретарь",
  auditor: "Внутренний аудитор",
  management: "Менеджмент",
};

export interface Organization {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

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

export async function updateUserProfile(
  userId: string,
  updates: { full_name?: string; role?: UserRole; role_details?: string | null }
): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.error("updateUserProfile error:", error);
    return false;
  }
  return true;
}

// Legacy alias
export async function updateUserRole(userId: string, role: Profile["role"]): Promise<boolean> {
  return updateUserProfile(userId, { role });
}

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

// ============================================================
// Admin user management via Edge Function (uses service_role)
// ============================================================

async function callAdminUsersFunction(body: Record<string, unknown>): Promise<{ success?: boolean; error?: string; user_id?: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const url = `${(import.meta.env.VITE_SUPABASE_URL as string)}/functions/v1/admin-users`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "apikey": supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
  return result;
}

export async function adminCreateUser(
  email: string,
  password: string,
  fullName: string,
  role: UserRole,
  roleDetails: string | null
): Promise<string> {
  const result = await callAdminUsersFunction({
    action: "create",
    email,
    password,
    full_name: fullName,
    role,
    role_details: role === "admin" ? null : roleDetails,
  });
  return result.user_id!;
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await callAdminUsersFunction({ action: "delete", user_id: userId });
}

export async function resendConfirmationEmail(email: string): Promise<boolean> {
  try {
    await supabase.auth.resend({ type: "signup", email });
    return true;
  } catch (error) {
    console.error("resendConfirmationEmail error:", error);
    return false;
  }
}

export async function getMyOrg(): Promise<Organization | null> {
  return null;
}

export async function updateProfileLocale(_locale: string): Promise<void> {}
