import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import { getLocalizedName } from "../lib/profile";
import { fetchNSMeetings, fetchAgendaItems, type NSMeeting, type AgendaItem } from "../lib/nsMeetings";
import { fetchAllVotingsWithMeeting, type VotingWithMeeting } from "../lib/voting";
import { getLocalizedField } from "../lib/i18nHelpers";
import { getIntlLocale } from "../i18n";
import { supabase } from "../lib/supabaseClient";
import { StatusBadge, SkeletonCard, EmptyState } from "../components/ui";

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
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
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
      setAgenda([...items].sort((a, b) => a.order_index - b.order_index));
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

  const getTaskStatus = (status: string, dueDate: string | null): { variant: "danger" | "primary" | "success" | "neutral"; label: string } => {
    const isOverdue = dueDate && new Date(dueDate) < new Date() && status !== "done" && status !== "canceled";
    if (isOverdue || status === "overdue") return { variant: "danger", label: t("dashboard.taskOverdue") };
    if (status === "in_progress") return { variant: "primary", label: t("tasks.statusInProgress", "В работе") };
    if (status === "done") return { variant: "success", label: t("tasks.statusDone", "Выполнено") };
    return { variant: "neutral", label: t("tasks.statusOpen", "Открыто") };
  };

  // ── Today string ─────────────────────────────────────────────────────────────

  const todayStr = new Date().toLocaleDateString(getIntlLocale(), {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const todayCap = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);

  if (loading) {
    return (
      <div style={{ width: "100%" }}>
        <div style={{ height: 32, marginBottom: 8, width: 360 }} className="skeleton" />
        <div style={{ height: 18, marginBottom: 24, width: 220 }} className="skeleton" />
        <div style={{ height: 200, marginBottom: 16, borderRadius: 14 }} className="skeleton" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
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
  const meetingDate = nextMeeting ? new Date(nextMeeting.start_at) : null;
  const daysUntil = meetingDate ? Math.ceil((meetingDate.getTime() - Date.now()) / 86400000) : 0;
  const agendaCount = agenda.length;

  const pendingVotings = openVotings.filter(
    (v) => !(v.votes || []).some((vote) => vote.voter_id === profile?.id)
  );
  const hasPending = !isAdmin && pendingVotings.length > 0;
  const shownVotings = openVotings.slice(0, 3);
  const extraVotings = openVotings.length - 3;
  const isUrgent = (v: VotingWithMeeting) =>
    !!v.deadline && new Date(v.deadline).getTime() - Date.now() < 24 * 3600 * 1000;

  const stateChip = () => {
    if (meetingState === "now") return <StatusBadge variant="success" dot pulse>{t("dashboard.meetingGoingNow")}</StatusBadge>;
    if (meetingState === "soon" && nextMeeting) return <StatusBadge variant="warning" dot>{t("dashboard.meetingSoon")}, {formatRelativeTime(nextMeeting.start_at)}</StatusBadge>;
    if (meetingState === "completed") return <StatusBadge variant="neutral">{t("nsMeetings.statusCompleted")}</StatusBadge>;
    return <StatusBadge variant="primary">{t("nsMeetings.statusScheduled", "Запланировано")}</StatusBadge>;
  };

  return (
    <div style={{ width: "100%" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.01em", color: "#1a1f2b" }}>
          {t("dashboard.greeting")} {profile ? getLocalizedName(profile, i18n.language) : ""}
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: "#6b7384" }}>{todayCap}</p>
      </div>

      {/* ── Next meeting ── */}
      <section style={heroStyle} aria-label={t("dashboard.nextMeeting")}>
        {nextMeeting && meetingDate ? (
          <div style={heroGridStyle}>
            {/* Calendar leaf: the one large element on the page */}
            <div style={leafStyle}>
              <div style={leafMonthStyle}>
                {meetingDate.toLocaleDateString(getIntlLocale(), { month: "long" })}
              </div>
              <div style={leafDayStyle}>{meetingDate.getDate()}</div>
              <div style={leafWeekStyle}>
                {meetingDate.toLocaleDateString(getIntlLocale(), { weekday: "short" })} · {formatMeetingTime(nextMeeting.start_at)}
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: "#6b7384", marginBottom: 8 }}>
                {t("dashboard.nextMeeting")}
                {meetingState === "upcoming" && daysUntil >= 0 && (
                  <> · {daysUntil === 0 ? t("dashboard.today") : t("dashboard.inDays", { count: daysUntil })}</>
                )}
              </div>
              <h2 style={{ margin: "0 0 10px", fontSize: 20, fontWeight: 600, lineHeight: 1.35, letterSpacing: "-0.01em", color: "#1a1f2b" }}>
                {meetingTitle}
              </h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {stateChip()}
                {agendaCount > 0 && <StatusBadge variant="neutral">{t("dashboard.agendaItems_other", { count: agendaCount })}</StatusBadge>}
                {nextMeeting.video_conference_provider && (
                  <StatusBadge variant="neutral">{nextMeeting.video_conference_provider.replace("_", " ")}</StatusBadge>
                )}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {nextMeeting.video_conference_enabled && nextMeeting.video_conference_url ? (
                  <>
                    <a href={nextMeeting.video_conference_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                      {t("dashboard.joinVideoConf")}
                    </a>
                    <button onClick={() => navigate(`/ns-meetings/${nextMeeting.id}`)} className="btn btn-secondary">
                      {t("dashboard.openMaterials")}
                    </button>
                  </>
                ) : (
                  <button onClick={() => navigate(`/ns-meetings/${nextMeeting.id}`)} className="btn btn-primary">
                    {meetingState === "completed" ? t("dashboard.openMaterials") : t("dashboard.viewDetails")}
                  </button>
                )}
              </div>
            </div>

            {/* Agenda preview on a soft inset — no card inside a card */}
            <div style={insetStyle}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7384", marginBottom: 8 }}>{t("dashboard.agendaTitle")}</div>
              {agenda.length === 0 ? (
                <div style={{ fontSize: 13.5, color: "#9ba3b4" }}>{t("dashboard.noAgenda")}</div>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.45, color: "#2a3040" }}>
                  {agenda.slice(0, 4).map((item) => (
                    <li key={item.id} style={{ padding: "3px 0" }}>
                      {getLocalizedField(item as unknown as Record<string, unknown>, "title")}
                    </li>
                  ))}
                  {agenda.length > 4 && (
                    <li style={{ padding: "3px 0", color: "#6b7384", listStyle: "none", marginLeft: -20 }}>
                      {t("dashboard.votingMoreItems", { count: agenda.length - 4 })}
                    </li>
                  )}
                </ol>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13.5, color: "#6b7384", marginBottom: 6 }}>{t("dashboard.nextMeeting")}</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: "#1a1f2b" }}>{t("dashboard.noNextMeeting")}</div>
            </div>
            {isAdmin && (
              <button onClick={() => navigate("/ns-meetings")} className="btn btn-primary">
                {t("dashboard.createFirstMeeting")}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Two columns ── */}
      <div style={gridStyle}>

        {/* ── Votings ── */}
        <section style={{ ...cardStyle, borderColor: hasPending ? "#f4e2a8" : "#e3e7ee" }}>
          <div style={cardHeadStyle}>
            <div>
              <h2 style={cardTitleStyle}>
                {hasPending
                  ? t("dashboard.votingPendingTitle", { count: pendingVotings.length })
                  : t("dashboard.activeVotings")}
              </h2>
              {isAdmin && openVotings.length > 0 && (
                <div style={{ fontSize: 12.5, color: "#6b7384", marginTop: 2 }}>
                  {t("dashboard.votingAdminCount", { count: openVotings.length })}
                </div>
              )}
            </div>
            <Link to="/voting" style={linkStyle}>{t("dashboard.goToVoting")}</Link>
          </div>

          {openVotings.length === 0 ? (
            <div style={{ padding: "0 20px 20px" }}><EmptyState title={t("dashboard.noActiveVotings")} /></div>
          ) : (
            <div>
              {shownVotings.map((v) => {
                const voted = (v.votes || []).some((vote) => vote.voter_id === profile?.id);
                const urgent = isUrgent(v);
                const meeting = allMeetings.find((m) => m.id === v.meeting_id);
                const dot = voted ? "#2e9e5b" : urgent ? "#d14343" : "#e0a520";
                return (
                  <div
                    key={v.id}
                    onClick={() => navigate(`/ns-meetings/${v.meeting_id}`)}
                    role="link"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/ns-meetings/${v.meeting_id}`); }}
                    style={{ ...rowStyle, cursor: "pointer" }}
                  >
                    <span style={{ ...dotStyle, background: dot }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={rowTitleStyle}>
                        {getLocalizedField(v as unknown as Record<string, unknown>, "agenda_title") || v.title}
                      </div>
                      {meeting && (
                        <div style={rowCaptionStyle}>
                          {new Date(meeting.start_at).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "long" })}
                          {v.deadline && <> · {t("dashboard.taskDue")} {new Date(v.deadline).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "short" })}</>}
                        </div>
                      )}
                    </div>
                    {voted ? (
                      <StatusBadge variant="success">{t("dashboard.votingVoted")}</StatusBadge>
                    ) : (
                      <StatusBadge variant={urgent ? "danger" : "warning"}>
                        {urgent ? t("dashboard.votingUrgent") : t("dashboard.votingAwaitingVote")}
                      </StatusBadge>
                    )}
                  </div>
                );
              })}
              {extraVotings > 0 && (
                <Link to="/voting" style={{ ...linkStyle, display: "block", padding: "12px 20px", borderTop: "1px solid #eef1f6" }}>
                  {t("dashboard.votingMoreItems", { count: extraVotings })}
                </Link>
              )}
            </div>
          )}
        </section>

        {/* ── My tasks ── */}
        <section style={cardStyle}>
          <div style={cardHeadStyle}>
            <h2 style={cardTitleStyle}>{t("dashboard.myTasks")}</h2>
            <Link to="/tasks" style={linkStyle}>{t("dashboard.allTasks")}</Link>
          </div>

          {myTasks.length === 0 ? (
            <div style={{ padding: "0 20px 20px" }}><EmptyState title={t("dashboard.noMyTasks")} /></div>
          ) : (
            <div>
              {myTasks.map((task) => {
                const status = getTaskStatus(task.status, task.due_date);
                const dot = status.variant === "danger" ? "#d14343" : status.variant === "primary" ? "#3557d6" : status.variant === "success" ? "#2e9e5b" : "#9ba3b4";
                return (
                  <Link key={task.id} to={`/tasks/${task.id}`} style={rowStyle}>
                    <span style={{ ...dotStyle, background: dot }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={rowTitleStyle}>{getTaskTitle(task)}</div>
                      {task.due_date && (
                        <div style={{ ...rowCaptionStyle, color: status.variant === "danger" ? "#a12b2b" : "#6b7384" }}>
                          {t("dashboard.taskDue")} {new Date(task.due_date).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "long" })}
                        </div>
                      )}
                    </div>
                    <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Admin quick actions ── */}
      {isAdmin && (
        <section style={{ marginTop: 20 }}>
          <h2 style={{ ...cardTitleStyle, marginBottom: 10 }}>{t("dashboard.quickActions")}</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => navigate("/ns-meetings")} className="btn btn-secondary">
              {t("dashboard.createNSMeeting")}
            </button>
            <Link to="/tasks" className="btn btn-secondary">
              {t("tasks.create", "Создать поручение")}
            </Link>
            <Link to="/ns-meetings" className="btn btn-ghost">
              {t("dashboard.goToNSMeetings")}
            </Link>
            <Link to="/notifications" className="btn btn-ghost">
              {t("dashboard.allNotifications")}
            </Link>
          </div>
        </section>
      )}

    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e3e7ee",
  borderRadius: 14,
  boxShadow: "var(--shadow-card)",
  overflow: "hidden",
};

const heroStyle: React.CSSProperties = {
  ...cardStyle,
  padding: "24px 28px",
  marginBottom: 16,
  overflow: "visible",
};

const heroGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "96px minmax(0, 1fr) 300px",
  gap: 28,
  alignItems: "start",
};

const leafStyle: React.CSSProperties = {
  border: "1px solid #e3e7ee",
  borderRadius: 12,
  overflow: "hidden",
  textAlign: "center",
  boxShadow: "var(--shadow-leaf)",
  background: "#ffffff",
};

const leafMonthStyle: React.CSSProperties = {
  background: "#3557d6",
  color: "#ffffff",
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  padding: "5px 4px",
};

const leafDayStyle: React.CSSProperties = {
  fontSize: 40,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "-0.02em",
  padding: "12px 0 4px",
  color: "#1a1f2b",
  fontVariantNumeric: "tabular-nums",
};

const leafWeekStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7384",
  paddingBottom: 10,
};

const insetStyle: React.CSSProperties = {
  background: "#f5f7fa",
  borderRadius: 12,
  padding: 16,
  minWidth: 0,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
  gap: 16,
};

const cardHeadStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  padding: "18px 20px 10px",
};

const cardTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.3,
  color: "#1a1f2b",
};

const linkStyle: React.CSSProperties = {
  fontSize: 13.5,
  fontWeight: 500,
  color: "#3557d6",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 20px",
  borderTop: "1px solid #eef1f6",
  textDecoration: "none",
  color: "inherit",
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const rowTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: "#1a1f2b",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const rowCaptionStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "#6b7384",
  marginTop: 2,
};
