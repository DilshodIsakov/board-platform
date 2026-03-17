import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import { fetchMeetings, type Meeting } from "../lib/meetings";
import {
  fetchVideoConferences,
  createVideoConference,
  deleteVideoConference,
  type VideoConference,
} from "../lib/videoConferences";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function VideoConferencePage({ profile, org }: Props) {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [conferences, setConferences] = useState<VideoConference[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("10:00");
  const [formUrl, setFormUrl] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    Promise.all([fetchMeetings(), fetchVideoConferences()]).then(([m, vc]) => {
      setMeetings(m);
      setConferences(vc);
      setLoading(false);
    });
  }, [profile?.id]);

  const scheduledMeetings = meetings.filter((m) => m.status === "scheduled");
  const now = new Date();
  const upcomingConferences = conferences.filter((c) => new Date(c.scheduled_at) >= now);
  const pastConferences = conferences.filter((c) => new Date(c.scheduled_at) < now);

  const handleCreate = async () => {
    if (!formTitle.trim() || !formDate || !org || !profile) return;
    setSaving(true);
    try {
      const scheduledAt = new Date(`${formDate}T${formTime}`).toISOString();
      const vc = await createVideoConference(
        org.id, profile.id, formTitle.trim(), scheduledAt, formUrl.trim() || null
      );
      if (vc) setConferences((prev) => [...prev, vc]);
      setShowForm(false);
      setFormTitle("");
      setFormDate("");
      setFormTime("10:00");
      setFormUrl("");
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("video.confirmDelete"))) return;
    try {
      await deleteVideoConference(id);
      setConferences((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const canDelete = (vc: VideoConference) =>
    profile && (vc.created_by === profile.id || profile.role === "admin");

  const formatDt = (iso: string) =>
    new Date(iso).toLocaleString(getIntlLocale(), {
      day: "numeric", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>{t("common.loading")}</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>{t("video.title")}</h1>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 32 }}>
        {t("video.subtitle")}
      </p>

      {/* Hero card */}
      <div style={heroCardStyle}>
        <div style={heroIconStyle}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 style={{ marginBottom: 4, marginTop: 16 }}>{t("video.readyToStart")}</h2>
        <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 20 }}>
          {t("video.connectDescription")}
        </p>
        <button onClick={() => setShowForm(true)} style={startBtnStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {t("video.startVideoconference")}
        </button>
      </div>

      {/* ===== Create Conference Form ===== */}
      {showForm && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <h3 style={{ margin: "0 0 16px" }}>{t("video.createConference")}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={labelStyle}>{t("video.confTitle")}</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={t("video.confTitlePlaceholder")}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t("video.confDate")}</label>
                  <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>{t("video.confTime")}</label>
                  <input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>{t("video.confUrl")}</label>
                <input
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder={t("video.confUrlPlaceholder")}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={handleCreate}
                  disabled={saving || !formTitle.trim() || !formDate}
                  style={{ ...primaryBtnStyle, opacity: saving || !formTitle.trim() || !formDate ? 0.5 : 1 }}
                >
                  {saving ? t("common.saving") : t("video.create")}
                </button>
                <button onClick={() => setShowForm(false)} style={cancelBtnStyle}>
                  {t("video.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== Upcoming Video Conferences ===== */}
      <h2 style={{ marginTop: 32, marginBottom: 16 }}>{t("video.upcomingConferences")}</h2>
      {upcomingConferences.length === 0 ? (
        <p style={{ color: "#9CA3AF", fontSize: 13 }}>{t("video.noUpcomingConferences")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {upcomingConferences.map((vc) => (
            <div key={vc.id} style={vcRowStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14, color: "#111827" }}>{vc.title}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>{formatDt(vc.scheduled_at)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {vc.meeting_url ? (
                  <a
                    href={vc.meeting_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={joinBtnStyle}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t("video.join")}
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: "#9CA3AF" }}>{t("video.noUrlAdded")}</span>
                )}
                {canDelete(vc) && (
                  <button onClick={() => handleDelete(vc.id)} style={deleteBtnStyle} title={t("video.delete")}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== Past Conferences (collapsed) ===== */}
      {pastConferences.length > 0 && (
        <>
          <h3 style={{ marginTop: 28, marginBottom: 12, color: "#6B7280", fontSize: 15 }}>
            {t("video.pastConferences")} ({pastConferences.length})
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {pastConferences.slice(0, 10).map((vc) => (
              <div key={vc.id} style={{ ...vcRowStyle, opacity: 0.7 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, color: "#111827" }}>{vc.title}</div>
                  <div style={{ fontSize: 12, color: "#9CA3AF" }}>{formatDt(vc.scheduled_at)}</div>
                </div>
                {canDelete(vc) && (
                  <button onClick={() => handleDelete(vc.id)} style={deleteBtnStyle} title={t("video.delete")}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ===== NS Meetings with video links ===== */}
      <h2 style={{ marginTop: 32, marginBottom: 16 }}>{t("video.upcomingMeetings")}</h2>
      {scheduledMeetings.length === 0 ? (
        <p style={{ color: "#9CA3AF", fontSize: 13 }}>{t("video.noScheduledMeetings")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scheduledMeetings.map((m) => (
            <Link key={m.id} to={`/meetings/${m.id}`} style={meetingRowStyle}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, color: "#111827" }}>{m.title}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>{formatDt(m.start_at)}</div>
              </div>
              {m.meet_url ? (
                <span style={{ fontSize: 12, color: "#059669", fontWeight: 500 }}>{t("video.linkAdded")}</span>
              ) : (
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>{t("video.noLink")}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const heroCardStyle: React.CSSProperties = {
  background: "#F9FAFB",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: "48px 32px",
  textAlign: "center",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

const heroIconStyle: React.CSSProperties = {
  width: 80,
  height: 80,
  borderRadius: "50%",
  background: "#EFF6FF",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const startBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "12px 28px",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 10,
  border: "none",
  background: "#111827",
  color: "#FFFFFF",
  cursor: "pointer",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 14,
  padding: 28,
  width: 460,
  maxWidth: "90vw",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6B7280",
  fontWeight: 500,
  display: "block",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 24px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#374151",
  cursor: "pointer",
};

const vcRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 10,
};

const joinBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: "none",
  background: "#059669",
  color: "#FFFFFF",
  cursor: "pointer",
  textDecoration: "none",
};

const deleteBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: "1px solid #FECACA",
  background: "#FEF2F2",
  color: "#DC2626",
  cursor: "pointer",
  fontSize: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const meetingRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  textDecoration: "none",
  color: "inherit",
};
