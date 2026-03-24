import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getAllProfiles, type Profile, type Organization } from "../lib/profile";
import {
  fetchAuditLogs,
  auditLogsToCSV,
  downloadCSV,
  type AuditLogEntry,
  type AuditLogFilters,
} from "../lib/auditLog";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

const PAGE_SIZE = 30;

const ACTION_TYPES = [
  "login","logout","login_failed",
  "meeting_create","meeting_update","meeting_delete","meeting_view",
  "agenda_item_create","agenda_item_update","agenda_item_delete",
  "voting_create","voting_status_change","vote_cast","vote_change","vote_sign",
  "file_upload","file_download","file_delete","file_view",
  "user_create","user_role_change","user_profile_update",
  "work_plan_create","work_plan_update","work_plan_delete",
  "task_create","task_update","task_delete",
  "video_conf_create","video_conf_join",
];

const ENTITY_TYPES = ["meeting","agenda_item","voting","vote","file","user","work_plan","task","video_conference"];
const ROLES = ["admin","corp_secretary","chairman","board_member","management","executive","employee","auditor","department_head"];

function getActionColor(action: string): { bg: string; text: string } {
  if (action.includes("create") || action === "login" || action === "file_upload") return { bg: "#DCFCE7", text: "#166534" };
  if (action.includes("delete") || action === "logout" || action === "login_failed") return { bg: "#FEE2E2", text: "#991B1B" };
  if (action.includes("update") || action.includes("change")) return { bg: "#DBEAFE", text: "#1E40AF" };
  if (action.includes("vote") || action.includes("sign")) return { bg: "#F3E8FF", text: "#6B21A8" };
  if (action.includes("download") || action.includes("view")) return { bg: "#FEF9C3", text: "#854D0E" };
  return { bg: "#F3F4F6", text: "#374151" };
}

function getStatusColor(status: string): { bg: string; text: string } {
  if (status === "success") return { bg: "#DCFCE7", text: "#166534" };
  if (status === "failed") return { bg: "#FEE2E2", text: "#991B1B" };
  return { bg: "#F3F4F6", text: "#374151" };
}

function getEntityIcon(type: string | null): string {
  switch (type) {
    case "meeting": return "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z";
    case "agenda_item": return "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2";
    case "vote": case "voting": return "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4";
    case "file": return "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z";
    case "user": return "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z";
    case "task": return "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01";
    case "work_plan": return "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M12 3v4M9 3h6M7 13h4m-4 3h6";
    default: return "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z";
  }
}

export default function AuditLogPage({ profile }: Props) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState("");
  const [actionType, setActionType] = useState("");
  const [entityType, setEntityType] = useState("");
  const [userRole, setUserRole] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => { getAllProfiles().then(setAllUsers); }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const filters: AuditLogFilters = {
      search: search || undefined, userId: userId || undefined,
      actionType: actionType || undefined,
      entityType: entityType || undefined, userRole: userRole || undefined,
      status: status || undefined, dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined, page, pageSize: PAGE_SIZE,
    };
    const result = await fetchAuditLogs(filters);
    setLogs(result.data);
    setTotalCount(result.count);
    setLoading(false);
  }, [search, userId, actionType, entityType, userRole, status, dateFrom, dateTo, page]);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { setPage(1); }, [search, userId, actionType, entityType, userRole, status, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const handleExportCSV = async () => {
    setExporting(true);
    const all = await fetchAuditLogs({
      search: search || undefined, userId: userId || undefined,
      actionType: actionType || undefined,
      entityType: entityType || undefined, userRole: userRole || undefined,
      status: status || undefined, dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined, page: 1, pageSize: 5000,
    });
    const csv = auditLogsToCSV(all.data, t);
    downloadCSV(csv, `audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    setExporting(false);
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  if (profile?.role !== "admin" && profile?.role !== "corp_secretary") {
    return <div style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>{t("common.accessDenied") || "Access denied"}</div>;
  }

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: "#111827", margin: 0 }}>{t("auditLog.title")}</h1>
          <p style={{ fontSize: 14, color: "#6B7280", margin: "6px 0 0" }}>{t("auditLog.subtitle")}</p>
        </div>
        <button onClick={handleExportCSV} disabled={exporting} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10,
          background: "#111827", color: "#FFF", border: "none", cursor: "pointer", fontSize: 14,
          fontWeight: 600, opacity: exporting ? 0.6 : 1,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          {exporting ? t("common.loading") : t("auditLog.exportCSV")}
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: "0 1 220px" }}>
            <label style={labelStyle}>{t("auditLog.col.user")}</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} style={selectStyle}>
              <option value="">{t("auditLog.all")}</option>
              {allUsers.map((u) => {
                const uid = (u as Record<string, unknown>).user_id as string | undefined;
                return (
                  <option key={u.id} value={uid || u.id}>
                    {u.full_name || u.email}
                  </option>
                );
              })}
            </select>
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 160 }}>
            <label style={labelStyle}>{t("auditLog.search")}</label>
            <div style={{ position: "relative" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("auditLog.searchPlaceholder")} style={{ ...inputStyle, paddingLeft: 36 }} />
            </div>
          </div>
          <div style={{ flex: "0 1 180px" }}>
            <label style={labelStyle}>{t("auditLog.filterAction")}</label>
            <select value={actionType} onChange={(e) => setActionType(e.target.value)} style={selectStyle}>
              <option value="">{t("auditLog.all")}</option>
              {ACTION_TYPES.map((a) => <option key={a} value={a}>{t(`auditLog.actions.${a}`, a)}</option>)}
            </select>
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <label style={labelStyle}>{t("auditLog.filterEntity")}</label>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} style={selectStyle}>
              <option value="">{t("auditLog.all")}</option>
              {ENTITY_TYPES.map((e) => <option key={e} value={e}>{t(`auditLog.entities.${e}`, e)}</option>)}
            </select>
          </div>
          <div style={{ flex: "0 1 150px" }}>
            <label style={labelStyle}>{t("auditLog.filterRole")}</label>
            <select value={userRole} onChange={(e) => setUserRole(e.target.value)} style={selectStyle}>
              <option value="">{t("auditLog.all")}</option>
              {ROLES.map((r) => <option key={r} value={r}>{t(`roles.${r}`, r)}</option>)}
            </select>
          </div>
          <div style={{ flex: "0 1 130px" }}>
            <label style={labelStyle}>{t("auditLog.filterStatus")}</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
              <option value="">{t("auditLog.all")}</option>
              <option value="success">{t("auditLog.statusSuccess")}</option>
              <option value="failed">{t("auditLog.statusFailed")}</option>
            </select>
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <label style={labelStyle}>{t("auditLog.dateFrom")}</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: "0 1 160px" }}>
            <label style={labelStyle}>{t("auditLog.dateTo")}</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </div>
          {(search || userId || actionType || entityType || userRole || status || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(""); setUserId(""); setActionType(""); setEntityType(""); setUserRole(""); setStatus(""); setDateFrom(""); setDateTo(""); }}
              style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", cursor: "pointer", fontSize: 13, fontWeight: 500, alignSelf: "flex-end", marginBottom: 1 }}>
              {t("auditLog.resetFilters")}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 4px" }}>
        <span style={{ fontSize: 13, color: "#6B7280" }}>{t("auditLog.totalRecords", { count: totalCount })}</span>
        <span style={{ fontSize: 13, color: "#9CA3AF" }}>{t("auditLog.pageInfo", { page, total: totalPages })}</span>
      </div>

      {/* Table */}
      <div style={{ background: "#FFF", borderRadius: 16, border: "1px solid #E5E7EB", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#F9FAFB", borderBottom: "1px solid #E5E7EB" }}>
                <th style={thStyle}>{t("auditLog.col.date")}</th>
                <th style={thStyle}>{t("auditLog.col.user")}</th>
                <th style={thStyle}>{t("auditLog.col.role")}</th>
                <th style={thStyle}>{t("auditLog.col.action")}</th>
                <th style={thStyle}>{t("auditLog.col.entityType")}</th>
                <th style={thStyle}>{t("auditLog.col.entityTitle")}</th>
                <th style={thStyle}>{t("auditLog.col.status")}</th>
                <th style={{ ...thStyle, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>{t("common.loading")}</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#9CA3AF" }}>{t("auditLog.noRecords")}</td></tr>
              ) : logs.map((log) => {
                const ac = getActionColor(log.action_type);
                const sc = getStatusColor(log.status);
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid #F3F4F6", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    onClick={() => setSelectedLog(log)}>
                    <td style={tdStyle}><span style={{ whiteSpace: "nowrap", fontSize: 13, color: "#374151" }}>{fmt(log.created_at)}</span></td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 500, color: "#111827" }}>{log.user_name || "—"}</div>
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{log.user_email || ""}</div>
                    </td>
                    <td style={tdStyle}><span style={{ fontSize: 12, color: "#6B7280" }}>{t(`roles.${log.user_role}`, log.user_role || "")}</span></td>
                    <td style={tdStyle}>
                      <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: ac.bg, color: ac.text }}>
                        {t(`auditLog.actions.${log.action_type}`, log.action_label || log.action_type)}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={getEntityIcon(log.entity_type)} /></svg>
                        <span style={{ fontSize: 13, color: "#6B7280" }}>{log.entity_type ? t(`auditLog.entities.${log.entity_type}`, log.entity_type) : "—"}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 220 }}>
                      <span style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{log.entity_title || "—"}</span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.text }}>
                        {log.status === "success" ? t("auditLog.statusSuccess") : t("auditLog.statusFailed")}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <button onClick={(e) => { e.stopPropagation(); setSelectedLog(log); }}
                        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#FFF", color: "#6B7280", cursor: "pointer", fontSize: 12 }}>
                        {t("auditLog.details")}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 24px", borderTop: "1px solid #F3F4F6" }}>
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} style={pgBtn(page <= 1)}>&larr;</button>
            {genPages(page, totalPages).map((p, i) =>
              p === "..." ? <span key={`d${i}`} style={{ padding: "4px 2px", color: "#9CA3AF" }}>...</span> : (
                <button key={p} onClick={() => setPage(p as number)} style={{ ...pgBtn(false), background: page === p ? "#3B82F6" : "#FFF", color: page === p ? "#FFF" : "#374151", fontWeight: page === p ? 600 : 400 }}>{p}</button>
              )
            )}
            <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} style={pgBtn(page >= totalPages)}>&rarr;</button>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setSelectedLog(null)}>
          <div style={{ background: "#FFF", borderRadius: 20, width: "100%", maxWidth: 600, maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid #F3F4F6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#111827" }}>{t("auditLog.detailTitle")}</h2>
              <button onClick={() => setSelectedLog(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9CA3AF", fontSize: 20 }}>&times;</button>
            </div>
            <div style={{ padding: "20px 28px 28px" }}>
              <div style={{ marginBottom: 20 }}>
                {(() => { const ac = getActionColor(selectedLog.action_type); return (
                  <span style={{ display: "inline-block", padding: "6px 16px", borderRadius: 8, fontSize: 14, fontWeight: 600, background: ac.bg, color: ac.text }}>
                    {t(`auditLog.actions.${selectedLog.action_type}`, selectedLog.action_label || selectedLog.action_type)}
                  </span>
                ); })()}
                <span style={{ marginLeft: 12, fontSize: 13, color: "#9CA3AF" }}>{fmt(selectedLog.created_at)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "12px 16px", fontSize: 14 }}>
                <DRow label={t("auditLog.col.user")} value={selectedLog.user_name || "—"} />
                <DRow label="Email" value={selectedLog.user_email || "—"} />
                <DRow label={t("auditLog.col.role")} value={t(`roles.${selectedLog.user_role}`, selectedLog.user_role || "—")} />
                <DRow label={t("auditLog.col.status")} value={
                  <span style={{ padding: "2px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: getStatusColor(selectedLog.status).bg, color: getStatusColor(selectedLog.status).text }}>
                    {selectedLog.status === "success" ? t("auditLog.statusSuccess") : t("auditLog.statusFailed")}
                  </span>
                } />
                <DRow label={t("auditLog.col.entityType")} value={selectedLog.entity_type ? t(`auditLog.entities.${selectedLog.entity_type}`, selectedLog.entity_type) : "—"} />
                <DRow label={t("auditLog.col.entityTitle")} value={selectedLog.entity_title || "—"} />
                {selectedLog.file_language && <DRow label={t("auditLog.fileLanguage")} value={selectedLog.file_language.toUpperCase()} />}
                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                  <>
                    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #F3F4F6", margin: "4px 0" }} />
                    <div style={{ gridColumn: "1 / -1", fontWeight: 600, color: "#374151", marginBottom: -4 }}>{t("auditLog.additionalDetails")}</div>
                    {Object.entries(selectedLog.metadata).map(([key, val]) => <DRow key={key} label={t(`auditLog.meta.${key}`, key)} value={String(val ?? "")} />)}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <><div style={{ color: "#6B7280", fontWeight: 500 }}>{label}</div><div style={{ color: "#111827" }}>{value}</div></>;
}

function genPages(cur: number, tot: number): (number | "...")[] {
  if (tot <= 7) return Array.from({ length: tot }, (_, i) => i + 1);
  const p: (number | "...")[] = [1];
  if (cur > 3) p.push("...");
  for (let i = Math.max(2, cur - 1); i <= Math.min(tot - 1, cur + 1); i++) p.push(i);
  if (cur < tot - 2) p.push("...");
  p.push(tot);
  return p;
}

const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#6B7280", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, color: "#374151", outline: "none", boxSizing: "border-box" };
const selectStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E5E7EB", fontSize: 13, color: "#374151", background: "#FFF", cursor: "pointer", outline: "none" };
const thStyle: React.CSSProperties = { padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle: React.CSSProperties = { padding: "12px 16px", verticalAlign: "middle" };
const pgBtn = (disabled: boolean): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 8, border: "1px solid #E5E7EB", background: "#FFF", color: disabled ? "#D1D5DB" : "#374151", cursor: disabled ? "default" : "pointer", fontSize: 13, fontWeight: 500, opacity: disabled ? 0.5 : 1 });
