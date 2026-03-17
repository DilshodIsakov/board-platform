import { supabase, supabaseAnonKey } from "./supabaseClient";

export type UserRole = "admin" | "corp_secretary" | "board_member" | "management" | "executive" | "employee" | "auditor" | "department_head" | "chairman";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  full_name_en?: string | null;
  full_name_uz?: string | null;
  role: UserRole;
  role_details?: string | null;
  role_details_en?: string | null;
  role_details_uz?: string | null;
  approval_status: ApprovalStatus;
  created_at: string;
}

/** Returns localized full_name based on current language */
export function getLocalizedName(profile: { full_name: string | null; full_name_en?: string | null; full_name_uz?: string | null }, lang: string): string {
  if (lang === "en" && profile.full_name_en) return profile.full_name_en;
  if (lang === "uz-Cyrl" && profile.full_name_uz) return profile.full_name_uz;
  return profile.full_name || "";
}

/** Returns localized role_details based on current language */
export function getLocalizedRoleDetails(profile: { role_details?: string | null; role_details_en?: string | null; role_details_uz?: string | null }, lang: string): string | null {
  if (lang === "en" && profile.role_details_en) return profile.role_details_en;
  if (lang === "uz-Cyrl" && profile.role_details_uz) return profile.role_details_uz;
  return profile.role_details || null;
}

export const ROLE_OPTIONS: UserRole[] = [
  "admin",
  "board_member",
  "management",
  "executive",
  "employee",
  "corp_secretary",
  "auditor",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Администратор",
  board_member: "Член НС",
  management: "Менеджмент",
  executive: "Член Правления",
  employee: "Сотрудник",
  corp_secretary: "Секретарь",
  auditor: "Внутренний аудитор",
  department_head: "Рук. подразделения",
  chairman: "Председатель",
};

export interface Organization {
  id: string;
  name: string;
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
  updates: {
    full_name?: string; full_name_en?: string | null; full_name_uz?: string | null;
    role?: UserRole;
    role_details?: string | null; role_details_en?: string | null; role_details_uz?: string | null;
  }
): Promise<{ ok: boolean; errorMessage?: string }> {
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("updateUserProfile error:", error);
    return { ok: false, errorMessage: error.message || error.code || "Unknown error" };
  }
  return { ok: true };
}

// Legacy alias
export async function updateUserRole(userId: string, role: Profile["role"]): Promise<boolean> {
  const result = await updateUserProfile(userId, { role });
  return result.ok;
}

export async function updateMyProfile(updates: { full_name?: string }): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;

  const { error } = await supabase
    .from("profiles")
    .update(updates)
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

export interface MultilingualUserData {
  full_name: string;
  full_name_en?: string;
  full_name_uz?: string;
  role: UserRole;
  role_details?: string | null;
  role_details_en?: string | null;
  role_details_uz?: string | null;
}

export async function adminCreateUser(
  email: string,
  password: string,
  data: MultilingualUserData
): Promise<string> {
  const result = await callAdminUsersFunction({
    action: "create",
    email,
    password,
    ...data,
  });
  return result.user_id!;
}

export async function adminInviteUser(
  email: string,
  data: MultilingualUserData
): Promise<{ user_id: string }> {
  const result = await callAdminUsersFunction({
    action: "invite",
    email,
    ...data,
  });
  return { user_id: result.user_id! };
}

export async function adminApproveUser(
  userId: string,
  role: UserRole,
  roleDetails?: string | null
): Promise<void> {
  await callAdminUsersFunction({ action: "approve", user_id: userId, role, role_details: roleDetails });
}

export async function adminRejectUser(userId: string): Promise<void> {
  await callAdminUsersFunction({ action: "reject", user_id: userId });
}

export async function adminResetPassword(userId: string): Promise<string | null> {
  const result = await callAdminUsersFunction({ action: "reset_password", user_id: userId });
  return (result as Record<string, unknown>).recovery_link as string | null;
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await callAdminUsersFunction({ action: "delete", user_id: userId });
}

// Public action — no auth needed. Changes password only if admin has set the reset flag.
export async function changePasswordAfterReset(email: string, newPassword: string): Promise<void> {
  const url = `${(import.meta.env.VITE_SUPABASE_URL as string)}/functions/v1/admin-users`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "apikey": supabaseAnonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "change_password_after_reset", email, new_password: newPassword }),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
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
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, created_at")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getMyOrg error:", error);
    return null;
  }
  return data as Organization | null;
}

export async function updateProfileLocale(_locale: string): Promise<void> {}
