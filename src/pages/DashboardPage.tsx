import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import type { Profile, Organization } from "../lib/profile";
import { fetchMeetings, createMeeting, type Meeting } from "../lib/meetings";
import {
  fetchShareholderMeetings,
  fetchAgendaItems,
  type ShareholderMeeting,
} from "../lib/shareholderMeetings";
import {
  fetchVotesByMeeting,
  tallyVotes,
  type ShareholderVote,
} from "../lib/shareholderVoting";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../lib/format";
import { getIntlLocale } from "../i18n";

const CAN_CREATE_MEETING = ["admin", "corp_secretary"];

interface Props {
  user: User;
  profile: Profile | null;
  org: Organization | null;
}

export default function DashboardPage({ user, profile, org }: Props) {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);

  // Shareholder meetings
  const [shMeetings, setShMeetings] = useState<ShareholderMeeting[]>([]);
  const [shVoteSummary, setShVoteSummary] = useState<{
    meetingTitle: string;
    items: { title: string; forShares: number; againstShares: number; abstainShares: number; totalShares: number }[];
  } | null>(null);

  // Форма создания
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [meetUrl, setMeetUrl] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const canCreate = profile && CAN_CREATE_MEETING.includes(profile.role);

  const loadMeetings = async () => {
    setLoadingMeetings(true);
    try {
      const data = await fetchMeetings();
      setMeetings(data);
    } catch (err) {
      console.error("fetchMeetings failed:", err);
      setMeetings([]);
    } finally {
      setLoadingMeetings(false);
    }
  };

  useEffect(() => {
    if (!profile) {
      setLoadingMeetings(false);
      return;
    }
    loadMeetings();
    loadShareholderData();
  }, [profile]);

  const loadShareholderData = async () => {
    const shData = await fetchShareholderMeetings();
    setShMeetings(shData);

    // Load vote summary for the latest scheduled meeting
    const scheduled = shData.filter((m) => m.status === "scheduled");
    if (scheduled.length > 0) {
      const latest = scheduled[0];
      const agenda = await fetchAgendaItems(latest.id);
      if (agenda.length > 0) {
        const votes = await fetchVotesByMeeting(agenda.map((a) => a.id));
        const grouped: Record<string, ShareholderVote[]> = {};
        for (const v of votes) {
          if (!grouped[v.agenda_item_id]) grouped[v.agenda_item_id] = [];
          grouped[v.agenda_item_id].push(v);
        }
        const items = agenda.map((a) => {
          const tally = tallyVotes(grouped[a.id] || []);
          return { title: a.title, ...tally };
        });
        setShVoteSummary({ meetingTitle: latest.title, items });
      }
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !org) return;

    setCreating(true);
    setFormError("");

    try {
      await createMeeting(org.id, profile.id, title, new Date(date).toISOString(), meetUrl || undefined);
      setTitle("");
      setDate("");
      setMeetUrl("");
      await loadMeetings();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("meeting.createError"));
    } finally {
      setCreating(false);
    }
  };

  const scheduledMeetings = meetings.filter((m) => m.status === "scheduled");
  const recentMeetings = meetings.slice(0, 5);

  return (
    <div>
      {/* Page Title */}
      <h1 style={{ marginBottom: 8 }}>{t("dashboard.title")}</h1>
      <p style={{ color: "#6B7280", fontSize: 16, marginBottom: 28 }}>
        {t("dashboard.welcome")}
      </p>

      {profile && (
        <p style={{ color: "#6B7280", fontSize: 15, marginBottom: 28 }}>
          {profile.full_name || user.email} — {t(`roles.${profile.role}`) || profile.role}
        </p>
      )}

      {!profile && (
        <div style={alertStyle}>
          {t("dashboard.profileNotFound")}
        </div>
      )}

      {/* KPI row */}
      <div style={{ ...kpiRowStyle, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div style={kpiCardStyle}>
          <div style={{ ...kpiIconStyle, background: "#DBEAFE" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{scheduledMeetings.length}</div>
            <div style={{ fontSize: 14, color: "#6B7280" }}>{t("dashboard.scheduledMeetings")}</div>
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ ...kpiIconStyle, background: "#D1FAE5" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{meetings.filter((m) => m.status === "completed").length}</div>
            <div style={{ fontSize: 14, color: "#6B7280" }}>{t("dashboard.completedMeetings")}</div>
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ ...kpiIconStyle, background: "#FEF3C7" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{shMeetings.filter((m) => m.status === "scheduled").length}</div>
            <div style={{ fontSize: 14, color: "#6B7280" }}>{t("dashboard.shareholderMeetings")}</div>
          </div>
        </div>
        <div style={kpiCardStyle}>
          <div style={{ ...kpiIconStyle, background: "#F3E8FF" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{meetings.length + shMeetings.length}</div>
            <div style={{ fontSize: 14, color: "#6B7280" }}>{t("dashboard.totalEvents")}</div>
          </div>
        </div>
      </div>

      {/* Two columns: Meetings + Create form */}
      <div style={{ display: "grid", gridTemplateColumns: canCreate ? "1fr 1fr" : "1fr", gap: 20, marginBottom: 28 }}>
        {/* Scheduled meetings */}
        <div style={cardStyle}>
          <h3 style={{ marginBottom: 18 }}>{t("dashboard.upcomingMeetings")}</h3>
          {loadingMeetings ? (
            <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("common.loading")}</p>
          ) : scheduledMeetings.length === 0 ? (
            <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("dashboard.noScheduledMeetings")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {scheduledMeetings.slice(0, 5).map((m) => (
                <Link key={m.id} to={`/meetings/${m.id}`} style={meetingItemStyle}>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 15, color: "#111827" }}>{m.title}</div>
                    <div style={{ fontSize: 13, color: "#9CA3AF" }}>
                      {formatDateTime(m.start_at)}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
                </Link>
              ))}
            </div>
          )}
          <Link to="/calendar" style={{ display: "block", marginTop: 18, fontSize: 14, color: "#3B82F6", fontWeight: 500 }}>
            {t("dashboard.goToCalendar")}
          </Link>
        </div>

        {/* Create meeting form */}
        {canCreate && (
          <div style={cardStyle}>
            <h3 style={{ marginBottom: 18 }}>{t("dashboard.newMeeting")}</h3>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={labelStyle}>{t("dashboard.meetingTitle")}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder={t("dashboard.meetingTitlePlaceholder")}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("dashboard.dateTime")}</label>
                <input
                  type="datetime-local"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("dashboard.googleMeet")}</label>
                <input
                  type="url"
                  value={meetUrl}
                  onChange={(e) => setMeetUrl(e.target.value)}
                  placeholder="https://meet.google.com/xxx-xxxx-xxx"
                  style={inputStyle}
                />
              </div>
              <button type="submit" disabled={creating} style={btnPrimaryStyle}>
                {creating ? t("common.creating") : t("dashboard.createMeeting")}
              </button>
            </form>
            {formError && <p style={{ color: "#DC2626", fontSize: 13, marginTop: 8 }}>{formError}</p>}
          </div>
        )}
      </div>

      {/* Recent meetings table */}
      <div style={cardStyle}>
        <h3 style={{ marginBottom: 18 }}>{t("dashboard.recentMeetings")}</h3>
        {loadingMeetings ? (
          <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("common.loading")}</p>
        ) : recentMeetings.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("dashboard.noMeetingsYet")}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                <th style={thStyle}>{t("dashboard.meetingTitle")}</th>
                <th style={thStyle}>{t("dashboard.date")}</th>
                <th style={thStyle}>{t("dashboard.status")}</th>
              </tr>
            </thead>
            <tbody>
              {recentMeetings.map((m) => (
                <tr key={m.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={tdStyle}>
                    <Link to={`/meetings/${m.id}`} style={{ color: "#3B82F6" }}>
                      {m.title}
                    </Link>
                  </td>
                  <td style={{ ...tdStyle, color: "#6B7280" }}>
                    {new Date(m.start_at).toLocaleString(getIntlLocale(), {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      ...badgeStyle,
                      background: m.status === "completed" ? "#DCFCE7" : m.status === "scheduled" ? "#DBEAFE" : "#F3F4F6",
                      color: m.status === "completed" ? "#166534" : m.status === "scheduled" ? "#1E40AF" : "#374151",
                    }}>
                      {t(`meetingStatus.${m.status}`, m.status)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Shareholder meetings widgets */}
      {shMeetings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: shVoteSummary ? "1fr 1fr" : "1fr", gap: 20, marginTop: 24 }}>
          {/* Upcoming shareholder meetings */}
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ ...kpiIconStyle, width: 36, height: 36, borderRadius: 10, background: "#FEF3C7" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 style={{ margin: 0 }}>{t("dashboard.shareholderMeetingsTitle")}</h3>
            </div>
            {shMeetings.filter((m) => m.status === "scheduled").length === 0 ? (
              <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("dashboard.noUpcomingShareholder")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {shMeetings.filter((m) => m.status === "scheduled").slice(0, 3).map((m) => (
                  <Link key={m.id} to="/shareholder-meeting" style={meetingItemStyle}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 15, color: "#111827" }}>{m.title}</div>
                      <div style={{ fontSize: 13, color: "#9CA3AF" }}>
                        {new Date(m.meeting_date).toLocaleDateString(getIntlLocale(), {
                          day: "numeric", month: "long", year: "numeric",
                        })}
                      </div>
                    </div>
                    <span style={{
                      ...badgeStyle,
                      background: "#D1FAE5",
                      color: "#065F46",
                    }}>
                      {m.total_shares.toLocaleString(getIntlLocale())} {t("dashboard.shares")}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <Link to="/shareholder-meeting" style={{ display: "block", marginTop: 18, fontSize: 14, color: "#3B82F6", fontWeight: 500 }}>
              {t("dashboard.goToShareholder")}
            </Link>
          </div>

          {/* Latest vote summary */}
          {shVoteSummary && (
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                <div style={{ ...kpiIconStyle, width: 36, height: 36, borderRadius: 10, background: "#EDE9FE" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <h3 style={{ margin: 0 }}>{t("dashboard.votingFor", { title: shVoteSummary.meetingTitle })}</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {shVoteSummary.items.map((item, i) => (
                  <div key={i} style={{ padding: "10px 14px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #F3F4F6" }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 6 }}>
                      {i + 1}. {item.title}
                    </div>
                    {item.totalShares > 0 ? (
                      <>
                        <div style={{ display: "flex", gap: 3, height: 5, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                          {item.forShares > 0 && <div style={{ flex: item.forShares, background: "#059669", borderRadius: 3 }} />}
                          {item.againstShares > 0 && <div style={{ flex: item.againstShares, background: "#DC2626", borderRadius: 3 }} />}
                          {item.abstainShares > 0 && <div style={{ flex: item.abstainShares, background: "#9CA3AF", borderRadius: 3 }} />}
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6B7280" }}>
                          <span style={{ color: "#059669" }}>{t("dashboard.for")} {item.forShares.toLocaleString(getIntlLocale())}</span>
                          <span style={{ color: "#DC2626" }}>{t("dashboard.against")} {item.againstShares.toLocaleString(getIntlLocale())}</span>
                          <span style={{ color: "#9CA3AF" }}>{t("dashboard.abstain")} {item.abstainShares.toLocaleString(getIntlLocale())}</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{t("dashboard.noVotesYet")}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick action cards (like Figma bottom row) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 24 }}>
        <QuickActionCard to="/videoconference" icon="video" color="#3B82F6" bgColor="#DBEAFE" label={t("dashboard.startVideoconference")} />
        <QuickActionCard to="/protocols" icon="protocol" color="#F59E0B" bgColor="#FEF3C7" label={t("dashboard.createProtocol")} />
        <QuickActionCard to="/chat" icon="chat" color="#059669" bgColor="#D1FAE5" label={t("dashboard.writeToManager")} />
        <QuickActionCard to="/stats" icon="stats" color="#7C3AED" bgColor="#F3E8FF" label={t("dashboard.viewStats")} />
      </div>
    </div>
  );
}

// --- Quick Action Card ---

const ACTION_ICONS: Record<string, string> = {
  video: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  protocol: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  stats: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
};

function QuickActionCard({ to, icon, color, bgColor, label }: {
  to: string; icon: string; color: string; bgColor: string; label: string;
}) {
  return (
    <Link to={to} style={quickCardStyle}>
      <div style={{ ...quickIconStyle, background: bgColor }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={ACTION_ICONS[icon] || ""} />
        </svg>
      </div>
      <div style={{ fontSize: 14, color: "#374151", fontWeight: 500, textAlign: "center", lineHeight: 1.4 }}>
        {label}
      </div>
    </Link>
  );
}

// --- Styles ---

const kpiRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 20,
  marginBottom: 28,
};

const kpiCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 18,
  padding: "22px 24px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
};

const kpiIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  padding: 24,
};

const meetingItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #F3F4F6",
  textDecoration: "none",
  color: "inherit",
  transition: "background 0.1s",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  color: "#6B7280",
  marginBottom: 6,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 15,
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  outline: "none",
  boxSizing: "border-box",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "11px 24px",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 10,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  cursor: "pointer",
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontWeight: 600,
  textAlign: "left",
  color: "#6B7280",
  fontSize: 13,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 12px",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 500,
};

const alertStyle: React.CSSProperties = {
  padding: "14px 18px",
  background: "#FEE2E2",
  color: "#991B1B",
  borderRadius: 10,
  fontSize: 14,
  marginBottom: 24,
};

const quickCardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  padding: "24px 16px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  textDecoration: "none",
  transition: "box-shadow 0.15s",
  cursor: "pointer",
};

const quickIconStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
