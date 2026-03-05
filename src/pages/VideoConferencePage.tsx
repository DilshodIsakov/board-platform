import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import { fetchMeetings, type Meeting } from "../lib/meetings";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function VideoConferencePage({ profile }: Props) {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    (async () => {
      const data = await fetchMeetings();
      setMeetings(data);
      setLoading(false);
    })();
  }, [profile]);

  const scheduledMeetings = meetings.filter((m) => m.status === "scheduled");

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
        <button style={startBtnStyle}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {t("video.startVideoconference")}
        </button>
      </div>

      {/* Upcoming meetings with Meet links */}
      <h2 style={{ marginTop: 32, marginBottom: 16 }}>{t("video.upcomingMeetings")}</h2>
      {scheduledMeetings.length === 0 ? (
        <p style={{ color: "#9CA3AF", fontSize: 13 }}>{t("video.noScheduledMeetings")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {scheduledMeetings.map((m) => (
            <Link key={m.id} to={`/meetings/${m.id}`} style={meetingRowStyle}>
              <div>
                <div style={{ fontWeight: 500, fontSize: 14, color: "#111827" }}>{m.title}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                  {new Date(m.start_at).toLocaleString(getIntlLocale(), {
                    day: "numeric", month: "long", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </div>
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
