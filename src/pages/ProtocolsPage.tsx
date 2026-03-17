import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import { fetchMeetings, type Meeting } from "../lib/meetings";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function ProtocolsPage({ profile }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    (async () => {
      const data = await fetchMeetings();
      setMeetings(data);
      setLoading(false);
    })();
  }, [profile?.id]);

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>{t("common.loading")}</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>{t("protocols.title")}</h1>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>
        {t("protocols.subtitle")}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20 }}>
        {/* Left panel — meeting selection */}
        <div style={panelStyle}>
          <h3 style={{ marginBottom: 12 }}>{t("protocols.createProtocol")}</h3>
          <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>
            {t("protocols.selectMeeting")}
          </p>

          <label style={{ fontSize: 13, color: "#6B7280", fontWeight: 500, display: "block", marginBottom: 4 }}>
            {t("protocols.selectMeetingPlaceholder")}
          </label>
          <select
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            style={selectStyle}
          >
            <option value="">{t("protocols.selectMeetingPlaceholder")}</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>{m.title}</option>
            ))}
          </select>

          <button
            onClick={() => selectedId && navigate(`/meetings/${selectedId}/protocol`)}
            disabled={!selectedId}
            style={{
              ...btnStyle,
              background: selectedId ? "#3B82F6" : "#D1D5DB",
              color: selectedId ? "#FFFFFF" : "#9CA3AF",
              marginTop: 16,
              width: "100%",
            }}
          >
            {t("protocols.generateAI")}
          </button>

          {meetings.length > 0 && (
            <>
              <h3 style={{ marginTop: 24, marginBottom: 8 }}>{t("protocols.recentProtocols")}</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {meetings.slice(0, 5).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => navigate(`/meetings/${m.id}/protocol`)}
                    style={recentItemStyle}
                  >
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{m.title}</div>
                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                      {new Date(m.start_at).toLocaleDateString(getIntlLocale())}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right panel — preview placeholder */}
        <div style={{
          ...panelStyle,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
          color: "#9CA3AF",
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
            {t("protocols.preview")}
          </div>
          <p style={{ fontSize: 13, textAlign: "center", maxWidth: 320 }}>
            {t("protocols.previewHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 24,
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  outline: "none",
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
};

const recentItemStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #F3F4F6",
  background: "transparent",
  cursor: "pointer",
  transition: "background 0.1s",
};
