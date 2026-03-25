import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import { getLocalizedName } from "../lib/profile";
import { fetchNSMeetings, fetchAgendaItems, type NSMeeting } from "../lib/nsMeetings";
import { fetchAllVotingsWithMeeting, type VotingWithMeeting } from "../lib/voting";
import { getLocalizedField } from "../lib/i18nHelpers";
import { getIntlLocale } from "../i18n";
import { supabase } from "../lib/supabaseClient";
import { StatusBadge, SkeletonCard, EmptyState, RoleBadge } from "../components/ui";

interface DashTask {
  id: string;
  title: string;
  title_ru?: string | null;
  title_uz?: string | null;
  title_en?: string | null;
  status: string;
  due_date: string | null;
  priority: string;
}

interface Props {
  user: User;
  profile: Profile | null;
  org: Organization | null;
}

export default function DashboardPage({ profile, org }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language;
  const isAdmin = profile?.role === "admin" || profile?.role === "corp_secretary";

  const [nextMeeting, setNextMeeting] = useState<NSMeeting | null>(null);
  const [allMeetings, setAllMeetings] = useState<NSMeeting[]>([]);
  const [agendaCount, setAgendaCount] = useState<number>(0);
  const [myTasks, setMyTasks] = useState<DashTask[]>([]);
  const [openVotings, setOpenVotings] = useState<VotingWithMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile || !org) { setLoading(false); return; }
    loadAll();
  }, [profile?.id]);

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadMeeting(), loadTasks(), loadVotings()]);
    setLoading(false);
  };

  const loadMeeting = async () => {
    const all = await fetchNSMeetings();
    setAllMeetings(all);
    const now = new Date();
    // 1. Prefer a meeting happening right now (scheduled, started ≤ 3h ago)
    const ongoing = all.find((m) => {
      if (m.status !== "scheduled") return false;
      const diff = now.getTime() - new Date(m.start_at).getTime();
      return diff >= 0 && diff < 3 * 3600 * 1000;
    });
    // 2. Next upcoming scheduled
    const upcoming = [...all]
      .filter((m) => m.status === "scheduled" && new Date(m.start_at) > now)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0];
    // 3. Most recent completed
    const recent = all.find((m) => m.status === "completed");

    const chosen = ongoing || upcoming || recent || null;
    setNextMeeting(chosen);

    if (chosen) {
      const items = await fetchAgendaItems(chosen.id);
      setAgendaCount(items.length);
    }
  };

  const loadTasks = async () => {
    if (!profile || !org) return;
    // Fetch task IDs assigned to this profile
    const { data: assignments } = await supabase
      .from("board_task_assignees")
      .select("task_id")
      .eq("assignee_profile_id", profile.id);

    if (!assignments?.length) { setMyTasks([]); return; }

    const taskIds = assignments.map((a: { task_id: string }) => a.task_id);
    const { data } = await supabase
      .from("board_tasks")
      .select("id, title, title_ru, title_uz, title_en, status, due_date, priority")
      .in("id", taskIds)
      .eq("organization_id", org!.id)
      .not("status", "in", '("done","canceled")')
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5);

    setMyTasks((data || []) as DashTask[]);
  };

  const loadVotings = async () => {
    const all = await fetchAllVotingsWithMeeting();
    setOpenVotings(all.filter((v) => v.status === "open"));
  };

  // ── Meeting helpers ──────────────────────────────────────────────────────────

  const getMeetingState = (m: NSMeeting): "now" | "soon" | "upcoming" | "completed" => {
    if (m.status === "completed") return "completed";
    const now = new Date();
    const start = new Date(m.start_at);
    const diffMs = start.getTime() - now.getTime();
    const diffPastMs = now.getTime() - start.getTime();
    if (diffPastMs >= 0 && diffPastMs < 3 * 3600 * 1000) return "now";
    if (diffMs > 0 && diffMs < 3600 * 1000) return "soon"; // < 1 hour away
    return "upcoming";
  };

  const formatMeetingDate = (iso: string) =>
    new Date(iso).toLocaleDateString(getIntlLocale(), {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

  const formatMeetingTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" });

  const formatRelativeTime = (iso: string) => {
    const diff = new Date(iso).getTime() - Date.now();
    const mins = Math.round(diff / 60000);
    if (mins < 60) return `${mins} мин`;
    return `${Math.floor(mins / 60)} ч ${mins % 60} мин`;
  };

  // ── Task helpers ─────────────────────────────────────────────────────────────

  const getTaskTitle = (task: DashTask) => {
    if (lang === "uz-Cyrl" || lang === "uz") return task.title_uz || task.title_ru || task.title;
    if (lang === "en") return task.title_en || task.title_ru || task.title;
    return task.title_ru || task.title;
  };

  const getTaskStatusStyle = (status: string, dueDate: string | null): React.CSSProperties => {
    const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== "done" && status !== "canceled";
    if (isOverdue || status === "overdue") return { background: "#FEE2E2", color: "#991B1B" };
    if (status === "in_progress") return { background: "#DBEAFE", color: "#1E40AF" };
    if (status === "done") return { background: "#DCFCE7", color: "#166534" };
    return { background: "#F3F4F6", color: "#6B7280" };
  };

  const getTaskStatusLabel = (status: string, dueDate: string | null) => {
    const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== "done";
    if (isOverdue || status === "overdue") return t("dashboard.taskOverdue");
    if (status === "in_progress") return t("tasks.statusInProgress", "В работе");
    if (status === "done") return t("tasks.statusDone", "Выполнено");
    return t("tasks.statusOpen", "Открыто");
  };

  // ── Today string ─────────────────────────────────────────────────────────────

  const todayStr = new Date().toLocaleDateString(getIntlLocale(), {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  // Capitalize first letter
  const todayCap = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  if (loading) {
    return (
      <div style={{ width: "100%", boxSizing: "border-box" as const }}>
        <div style={{ height: 72, background: "#F1F5F9", borderRadius: 12, marginBottom: 24 }} className="skeleton" />
        <div style={{ height: 160, background: "#F1F5F9", borderRadius: 16, marginBottom: 24 }} className="skeleton" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      </div>
    );
  }

  const meetingState = nextMeeting ? getMeetingState(nextMeeting) : null;
  const meetingTitle = nextMeeting
    ? getLocalizedField(nextMeeting as unknown as Record<string, unknown>, "title")
    : "";

  const nextMeetingBg = meetingState === "now"
    ? "linear-gradient(135deg, #064E3B 0%, #065F46 100%)"
    : meetingState === "soon"
    ? "linear-gradient(135deg, #78350F 0%, #92400E 100%)"
    : "linear-gradient(135deg, #1E3A5F 0%, #1E40AF 100%)";

  return (
    <div style={{ width: "100%", boxSizing: "border-box" as const }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 700, color: "#111827", margin: 0 }}>
              {t("dashboard.greeting")} {profile ? getLocalizedName(profile, i18n.language) : ""}!
            </h1>
            <p style={{ color: "#6B7280", fontSize: 14, margin: "4px 0 0" }}>
              {todayCap}
            </p>
          </div>
          {profile && (
            <div style={{ alignSelf: "center" }}>
              <RoleBadge role={profile.role} label={t(`roles.${profile.role}`, { defaultValue: profile.role })} />
            </div>
          )}
        </div>
      </div>

      {/* ── Next Meeting — full width ── */}
      <div style={{
        background: nextMeeting ? nextMeetingBg : "#F9FAFB",
        borderRadius: 16,
        padding: nextMeeting ? "28px 32px" : "24px 28px",
        marginBottom: 24,
        border: nextMeeting ? "none" : "1px solid #E5E7EB",
        boxShadow: nextMeeting ? "0 4px 24px rgba(0,0,0,0.12)" : "none",
        color: nextMeeting ? "#FFFFFF" : "#374151",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Label row */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.7 }}>
                {t("dashboard.nextMeeting")}
              </span>
              {meetingState === "now" && (
                <StatusBadge variant="success" dot pulse style={{ background: "rgba(16,185,129,0.25)", color: "#6EE7B7" }}>
                  {t("dashboard.meetingGoingNow")}
                </StatusBadge>
              )}
              {meetingState === "soon" && (
                <StatusBadge variant="warning" style={{ background: "rgba(245,158,11,0.25)", color: "#FCD34D" }}>
                  {t("dashboard.meetingSoon")} — {formatRelativeTime(nextMeeting!.start_at)}
                </StatusBadge>
              )}
              {meetingState === "completed" && (
                <StatusBadge variant="neutral" style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)" }}>
                  {t("nsMeetings.statusCompleted")}
                </StatusBadge>
              )}
            </div>

            {/* Title */}
            {nextMeeting ? (
              <>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {meetingTitle}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", opacity: 0.85, fontSize: 14 }}>
                  <span>📅 {formatMeetingDate(nextMeeting.start_at)}</span>
                  <span>🕐 {formatMeetingTime(nextMeeting.start_at)}</span>
                  {agendaCount > 0 && (
                    <span>📋 {t("dashboard.agendaItems_other", { count: agendaCount })}</span>
                  )}
                  {nextMeeting.video_conference_provider && (
                    <span style={{ opacity: 0.7, fontSize: 13 }}>
                      📹 {nextMeeting.video_conference_provider.replace("_", " ")}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 16, color: "#9CA3AF" }}>{t("dashboard.noNextMeeting")}</div>
            )}
          </div>

          {/* Action button */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
            {nextMeeting ? (
              <>
                {nextMeeting.video_conference_enabled && nextMeeting.video_conference_url ? (
                  <a
                    href={nextMeeting.video_conference_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={meetingJoinBtnStyle}
                  >
                    {t("dashboard.joinVideoConf")}
                  </a>
                ) : meetingState === "completed" ? (
                  <button onClick={() => navigate(`/ns-meetings/${nextMeeting.id}`)} style={meetingBtnStyle}>
                    {t("dashboard.openMaterials")}
                  </button>
                ) : (
                  <button onClick={() => navigate(`/ns-meetings/${nextMeeting.id}`)} style={meetingBtnStyle}>
                    {t("dashboard.viewDetails")}
                  </button>
                )}
              </>
            ) : isAdmin ? (
              <button onClick={() => navigate("/ns-meetings")} style={meetingBtnOutlineStyle}>
                {t("dashboard.createFirstMeeting")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── 3-column grid ── */}
      <div style={gridStyle}>

        {/* ── My Tasks ── */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <span style={cardTitleStyle}>📋 {t("dashboard.myTasks")}</span>
            <Link to="/tasks" style={linkStyle}>{t("dashboard.allTasks")}</Link>
          </div>

          {myTasks.length === 0 ? (
            <EmptyState icon="✅" title={t("dashboard.noMyTasks")} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {myTasks.map((task) => {
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";
                const statusStyle = getTaskStatusStyle(task.status, task.due_date);
                return (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    style={taskItemStyle}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 500, color: "#111827",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        marginBottom: 4,
                      }}>
                        {getTaskTitle(task)}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "1px 8px",
                          borderRadius: 8, ...statusStyle,
                        }}>
                          {getTaskStatusLabel(task.status, task.due_date)}
                        </span>
                        {task.due_date && (
                          <span style={{ fontSize: 11, color: isOverdue ? "#DC2626" : "#9CA3AF" }}>
                            {t("dashboard.taskDue")} {new Date(task.due_date).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M9 5l7 7-7 7" /></svg>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Votings ── */}
        {(() => {
          const pendingVotings = openVotings.filter(
            (v) => !(v.votes || []).some((vote) => vote.voter_id === profile?.id)
          );
          const displayList = isAdmin ? openVotings : pendingVotings;
          const shown = displayList.slice(0, 3);
          const extraCount = displayList.length - 3;
          const hasPending = pendingVotings.length > 0;
          const isUrgent = (v: VotingWithMeeting) =>
            !!v.deadline && new Date(v.deadline).getTime() - Date.now() < 24 * 3600 * 1000;
          const cardBorder = !isAdmin && hasPending
            ? "1px solid #FDE68A"
            : "1px solid #E5E7EB";
          const cardBg = !isAdmin && hasPending ? "#FFFBEB" : "#FFFFFF";

          return (
            <div style={{ ...cardStyle, border: cardBorder, background: cardBg }}>
              <div style={cardHeaderStyle}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={cardTitleStyle}>
                    🗳{" "}
                    {!isAdmin && hasPending
                      ? t("dashboard.votingPendingTitle", { count: pendingVotings.length })
                      : t("dashboard.activeVotings")}
                  </span>
                  {isAdmin && openVotings.length > 0 && (
                    <span style={{ fontSize: 11, color: "#6B7280" }}>
                      {t("dashboard.votingAdminCount", { count: openVotings.length })}
                    </span>
                  )}
                </div>
                <Link to="/voting" style={linkStyle}>{t("dashboard.goToVoting")}</Link>
              </div>

              {displayList.length === 0 ? (
                <div style={{ ...emptyStyle, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 28 }}>✅</span>
                  <span>{t("dashboard.noActiveVotings")}</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {shown.map((v) => {
                    const voted = (v.votes || []).some((vote) => vote.voter_id === profile?.id);
                    const urgent = isUrgent(v);
                    const meeting = allMeetings.find((m) => m.id === v.meeting_id);
                    return (
                      <div
                        key={v.id}
                        onClick={() => navigate(`/ns-meetings/${v.meeting_id}`)}
                        style={{
                          ...votingItemStyle,
                          border: urgent ? "1px solid #FCA5A5" : "1px solid #EDE9FE",
                          background: urgent ? "#FFF5F5" : "#FAFAFE",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                            {urgent && (
                              <span style={{ fontSize: 10, fontWeight: 700, background: "#DC2626", color: "#fff", borderRadius: 6, padding: "1px 6px" }}>
                                {t("dashboard.votingUrgent")}
                              </span>
                            )}
                            {voted ? (
                              <span style={{ fontSize: 10, fontWeight: 600, background: "#DCFCE7", color: "#166534", borderRadius: 6, padding: "1px 6px" }}>
                                ✓ {t("dashboard.votingVoted")}
                              </span>
                            ) : (
                              <span style={{ fontSize: 10, fontWeight: 600, background: "#FEF3C7", color: "#92400E", borderRadius: 6, padding: "1px 6px" }}>
                                ⚠ {t("dashboard.votingAwaitingVote")}
                              </span>
                            )}
                          </div>
                          <div style={{
                            fontSize: 13, fontWeight: 500, color: "#111827",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 3,
                          }}>
                            {v.title}
                          </div>
                          {meeting && (
                            <div style={{ fontSize: 11, color: "#9CA3AF" }}>
                              📅 {new Date(meeting.start_at).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "short", year: "numeric" })}
                            </div>
                          )}
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" style={{ flexShrink: 0, marginLeft: 8 }}><path d="M9 5l7 7-7 7" /></svg>
                      </div>
                    );
                  })}
                  {extraCount > 0 && (
                    <Link to="/voting" style={{ fontSize: 12, color: "#3B82F6", fontWeight: 500, textDecoration: "none", paddingLeft: 4 }}>
                      {t("dashboard.votingMoreItems", { count: extraCount })}
                    </Link>
                  )}
                  <button
                    onClick={() => navigate("/voting")}
                    style={votingGoBtn}
                  >
                    {t("dashboard.goToVoting")}
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Admin quick actions ── */}
      {isAdmin && (
        <div style={{ ...cardStyle, marginTop: 24 }}>
          <div style={cardHeaderStyle}>
            <span style={cardTitleStyle}>⚡ {t("dashboard.quickActions")}</span>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => navigate("/ns-meetings")}
              style={quickActionBtnStyle}
            >
              <span style={{ fontSize: 18 }}>📅</span>
              {t("dashboard.createNSMeeting")}
            </button>
            <Link to="/ns-meetings" style={{ ...quickActionBtnStyle, textDecoration: "none", color: "#374151" }}>
              <span style={{ fontSize: 18 }}>📋</span>
              {t("dashboard.goToNSMeetings")}
            </Link>
            <Link to="/tasks" style={{ ...quickActionBtnStyle, textDecoration: "none", color: "#374151" }}>
              <span style={{ fontSize: 18 }}>✅</span>
              {t("tasks.create", "+ Создать поручение")}
            </Link>
            <Link to="/notifications" style={{ ...quickActionBtnStyle, textDecoration: "none", color: "#374151" }}>
              <span style={{ fontSize: 18 }}>🔔</span>
              {t("dashboard.allNotifications")}
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 20,
};

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  padding: "20px 20px 16px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 16,
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#111827",
};

const linkStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#3B82F6",
  fontWeight: 500,
  textDecoration: "none",
};

const emptyStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#9CA3AF",
  textAlign: "center",
  padding: "24px 0",
};

const taskItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #F3F4F6",
  background: "#FAFAFA",
  textDecoration: "none",
  color: "inherit",
  transition: "border-color 0.15s",
};

const votingItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid #EDE9FE",
  background: "#FAFAFE",
  textDecoration: "none",
  color: "inherit",
  transition: "border-color 0.15s",
};

const votingGoBtn: React.CSSProperties = {
  marginTop: 4,
  padding: "8px 0",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid #C4B5FD",
  background: "#EDE9FE",
  color: "#5B21B6",
  cursor: "pointer",
  width: "100%",
};

const meetingBtnStyle: React.CSSProperties = {
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 10,
  border: "2px solid rgba(255,255,255,0.4)",
  background: "rgba(255,255,255,0.15)",
  color: "#FFFFFF",
  cursor: "pointer",
  backdropFilter: "blur(4px)",
  whiteSpace: "nowrap",
};

const meetingJoinBtnStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 700,
  borderRadius: 10,
  border: "none",
  background: "#10B981",
  color: "#FFFFFF",
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  boxShadow: "0 4px 12px rgba(16,185,129,0.35)",
};

const meetingBtnOutlineStyle: React.CSSProperties = {
  padding: "10px 22px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 10,
  border: "2px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#374151",
  cursor: "pointer",
};

const quickActionBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 18px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  background: "#F9FAFB",
  color: "#374151",
  cursor: "pointer",
  textDecoration: "none",
  transition: "border-color 0.15s, background 0.15s",
};
