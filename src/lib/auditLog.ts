import { supabase } from "./supabaseClient";

export interface AuditLogEntry {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  organization_id: string | null;
  action_type: string;
  action_label: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_title: string | null;
  meeting_id: string | null;
  agenda_item_id: string | null;
  file_id: string | null;
  file_language: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
}

export interface AuditLogFilters {
  search?: string;
  actionType?: string;
  entityType?: string;
  userRole?: string;
  userId?: string;
  meetingId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogResult {
  data: AuditLogEntry[];
  count: number;
}

export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<AuditLogResult> {
  const {
    search, actionType, entityType, userRole, userId,
    meetingId, status, dateFrom, dateTo,
    page = 1, pageSize = 50,
  } = filters;

  let query = supabase
    .from("audit_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (search) {
    query = query.or(`user_name.ilike.%${search}%,user_email.ilike.%${search}%,entity_title.ilike.%${search}%,action_label.ilike.%${search}%`);
  }
  if (actionType) query = query.eq("action_type", actionType);
  if (entityType) query = query.eq("entity_type", entityType);
  if (userRole) query = query.eq("user_role", userRole);
  if (userId) query = query.eq("user_id", userId);
  if (meetingId) query = query.eq("meeting_id", meetingId);
  if (status) query = query.eq("status", status);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", dateTo + "T23:59:59.999Z");

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error("fetchAuditLogs error:", error);
    return { data: [], count: 0 };
  }
  return { data: (data ?? []) as AuditLogEntry[], count: count ?? 0 };
}

export async function logAuditEvent(params: {
  actionType: string;
  actionLabel?: string;
  entityType?: string;
  entityId?: string;
  entityTitle?: string;
  meetingId?: string;
  agendaItemId?: string;
  fileId?: string;
  fileLanguage?: string;
  metadata?: Record<string, unknown>;
  status?: string;
}): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.rpc("log_audit_event", {
      p_action_type: params.actionType,
      p_action_label: params.actionLabel ?? null,
      p_entity_type: params.entityType ?? null,
      p_entity_id: params.entityId ?? null,
      p_entity_title: params.entityTitle ?? null,
      p_meeting_id: params.meetingId ?? null,
      p_agenda_item_id: params.agendaItemId ?? null,
      p_file_id: params.fileId ?? null,
      p_file_language: params.fileLanguage ?? null,
      p_metadata: params.metadata ?? {},
      p_status: params.status ?? "success",
    });
    if (error) console.error("logAuditEvent error:", error);
  } catch (e) {
    console.error("logAuditEvent exception:", e);
  }
}

export function auditLogsToCSV(logs: AuditLogEntry[], t: (key: string) => string): string {
  const headers = [
    t("auditLog.col.date"), t("auditLog.col.user"), t("auditLog.col.email"),
    t("auditLog.col.role"), t("auditLog.col.action"), t("auditLog.col.entityType"),
    t("auditLog.col.entityTitle"), t("auditLog.col.status"), t("auditLog.col.details"),
  ];

  const esc = (v: string | null | undefined) => {
    if (!v) return "";
    const s = String(v).replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
  };

  const rows = logs.map((l) => [
    new Date(l.created_at).toLocaleString(),
    esc(l.user_name), esc(l.user_email), esc(l.user_role),
    esc(l.action_label || l.action_type), esc(l.entity_type),
    esc(l.entity_title), esc(l.status), esc(JSON.stringify(l.metadata)),
  ].join(","));

  return "\uFEFF" + [headers.join(","), ...rows].join("\n");
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const AUDIT_ACTIONS = {
  LOGIN: "login",
  LOGOUT: "logout",
  LOGIN_FAILED: "login_failed",
  MEETING_CREATE: "meeting_create",
  MEETING_UPDATE: "meeting_update",
  MEETING_DELETE: "meeting_delete",
  MEETING_VIEW: "meeting_view",
  AGENDA_ITEM_CREATE: "agenda_item_create",
  AGENDA_ITEM_UPDATE: "agenda_item_update",
  AGENDA_ITEM_DELETE: "agenda_item_delete",
  VOTING_CREATE: "voting_create",
  VOTING_STATUS_CHANGE: "voting_status_change",
  VOTE_CAST: "vote_cast",
  VOTE_CHANGE: "vote_change",
  VOTE_SIGN: "vote_sign",
  FILE_UPLOAD: "file_upload",
  FILE_DOWNLOAD: "file_download",
  FILE_DELETE: "file_delete",
  FILE_VIEW: "file_view",
  USER_CREATE: "user_create",
  USER_ROLE_CHANGE: "user_role_change",
  USER_PROFILE_UPDATE: "user_profile_update",
  WORK_PLAN_CREATE: "work_plan_create",
  WORK_PLAN_UPDATE: "work_plan_update",
  WORK_PLAN_DELETE: "work_plan_delete",
  TASK_CREATE: "task_create",
  TASK_UPDATE: "task_update",
  TASK_DELETE: "task_delete",
  VIDEO_CONF_CREATE: "video_conf_create",
  VIDEO_CONF_JOIN: "video_conf_join",
} as const;
