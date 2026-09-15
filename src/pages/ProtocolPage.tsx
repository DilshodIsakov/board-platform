import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import {
  collectProtocolData,
  generateProtocolText,
  generateProtocolAI,
  type ProtocolData,
} from "../lib/protocol";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function ProtocolPage({ profile, org: _org }: Props) {
  const { t } = useTranslation();
  const { id: meetingId } = useParams<{ id: string }>();

  const [protocolData, setProtocolData] = useState<ProtocolData | null>(null);
  const [protocolText, setProtocolText] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [mode, setMode] = useState<"template" | "ai">("template");

  useEffect(() => {
    if (!meetingId || !profile) return;
    (async () => {
      const data = await collectProtocolData(meetingId);
      setProtocolData(data);
      if (data) {
        setProtocolText(generateProtocolText(data));
      }
      setLoading(false);
    })();
  }, [meetingId, profile]);

  const handleGenerateAI = async () => {
    if (!protocolData) return;
    setGeneratingAI(true);
    try {
      const text = await generateProtocolAI(protocolData);
      setProtocolText(text);
      setMode("ai");
    } catch (err) {
      console.error("AI generation error:", err);
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleGenerateTemplate = () => {
    if (!protocolData) return;
    setProtocolText(generateProtocolText(protocolData));
    setMode("template");
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([protocolText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `protocol_${meetingId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(protocolText);
  };

  if (loading) {
    return (
      <div style={{ color: "#8d8d8d" }}>{t("common.loading")}</div>
    );
  }

  if (!protocolData) {
    return (
      <div>
        <p style={{ color: "#da1e28" }}>{t("protocol.meetingNotFound")}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, marginBottom: 4 }}>{t("protocol.title")}</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleCopy} style={btnOutlineStyle}>
            {t("protocol.copy")}
          </button>
          <button onClick={handleDownloadTxt} style={btnOutlineStyle}>
            {t("protocol.downloadTxt")}
          </button>
        </div>
      </div>

      <p style={{ color: "#525252", fontSize: 14, margin: "4px 0 20px" }}>
        {protocolData.meeting.title}
      </p>

      {/* Переключатель режимов генерации */}
      <div style={modeBarStyle}>
        <button
          onClick={handleGenerateTemplate}
          style={{
            ...modeTabStyle,
            background: mode === "template" ? "#0f62fe" : "transparent",
            color: mode === "template" ? "#fff" : "#393939",
          }}
        >
          {t("protocol.template")}
        </button>
        <button
          onClick={handleGenerateAI}
          disabled={generatingAI}
          style={{
            ...modeTabStyle,
            background: mode === "ai" ? "#525252" : "transparent",
            color: mode === "ai" ? "#fff" : "#393939",
          }}
        >
          {generatingAI ? t("protocol.generating") : t("protocol.aiGenerate")}
        </button>
        <span style={{ fontSize: 12, color: "#8d8d8d", marginLeft: 8 }}>
          {mode === "ai"
            ? t("protocol.aiNote")
            : t("protocol.templateGeneration")}
        </span>
      </div>

      {/* Текст протокола */}
      <textarea
        value={protocolText}
        onChange={(e) => setProtocolText(e.target.value)}
        style={textareaStyle}
        rows={30}
      />

      {/* Инфо-блок про AI */}
      <div style={aiInfoStyle}>
        <strong>{t("protocol.aiTitle")}</strong>
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5 }}>
          {t("protocol.aiDescription")}
        </p>
        <p style={{ margin: "8px 0 0", fontSize: 13, color: "#525252" }}>
          {t("protocol.aiArchitecture")}
        </p>
      </div>
    </div>
  );
}

// --- Стили ---

const btnOutlineStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 13,
  borderRadius: 0,
  border: "1px solid #c6c6c6",
  background: "transparent",
  cursor: "pointer",
};

const modeBarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginBottom: 12,
  padding: 4,
  background: "#f4f4f4",
  borderRadius: 0,
  width: "fit-content",
};

const modeTabStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 0,
  border: "none",
  cursor: "pointer",
  transition: "all 0.15s",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  fontFamily: "monospace",
  fontSize: 13,
  lineHeight: 1.6,
  padding: 16,
  border: "1px solid #e0e0e0",
  borderRadius: 0,
  resize: "vertical",
  boxSizing: "border-box",
};

const aiInfoStyle: React.CSSProperties = {
  marginTop: 20,
  padding: 16,
  background: "#f4f4f4",
  border: "1px solid #e0e0e0",
  borderRadius: 0,
  fontSize: 14,
  color: "#393939",
};
