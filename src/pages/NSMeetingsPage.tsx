import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchNSMeetings,
  createNSMeeting,
  type NSMeeting,
} from "../lib/nsMeetings";
import { getLocalizedField, getStatusBadgeStyle } from "../lib/i18nHelpers";
import {
  generateMeetingTranslations,
  type SupportedLang,
  type TranslationStatus,
} from "../lib/translationService";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function NSMeetingsPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin" || profile?.role === "corp_secretary";

  const [meetings, setMeetings] = useState<NSMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [formSourceLang, setFormSourceLang] = useState<SupportedLang>("ru");
  const [formLangTab, setFormLangTab] = useState<SupportedLang>("ru");
  const [formTitleRu, setFormTitleRu] = useState("");
  const [formTitleUz, setFormTitleUz] = useState("");
  const [formTitleEn, setFormTitleEn] = useState("");
  const [formStatusRu, setFormStatusRu] = useState<TranslationStatus>("original");
  const [formStatusUz, setFormStatusUz] = useState<TranslationStatus>("missing");
  const [formStatusEn, setFormStatusEn] = useState<TranslationStatus>("missing");
  const [formDate, setFormDate] = useState("");
  const [formStatus, setFormStatus] = useState<string>("scheduled");
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    loadMeetings();
  }, [profile?.id]);

  const loadMeetings = async () => {
    setLoading(true);
    const data = await fetchNSMeetings();
    setMeetings(data);
    setLoading(false);
  };

  const getSourceTitle = (src: SupportedLang = formSourceLang) =>
    src === "ru" ? formTitleRu : src === "uz" ? formTitleUz : formTitleEn;

  const openCreateForm = () => {
    setFormSourceLang("ru");
    setFormLangTab("ru");
    setFormTitleRu(""); setFormTitleUz(""); setFormTitleEn("");
    setFormStatusRu("original"); setFormStatusUz("missing"); setFormStatusEn("missing");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormStatus("scheduled");
    setTranslationError("");
    setSaveError("");
    setShowMeetingForm(true);
  };

  const handleGenerateTranslations = async () => {
    const sourceText = getSourceTitle();
    if (!sourceText.trim()) return;
    setTranslating(true);
    setTranslationError("");
    try {
      const draft = await generateMeetingTranslations(formSourceLang, sourceText.trim());
      setFormTitleRu(draft.title_ru);
      setFormTitleUz(draft.title_uz);
      setFormTitleEn(draft.title_en);
      setFormStatusRu(draft.status_ru);
      setFormStatusUz(draft.status_uz);
      setFormStatusEn(draft.status_en);
    } catch (e) {
      console.error("[translate] error:", e);
      setTranslationError(e instanceof Error ? e.message : t("nsMeetings.translationError"));
    } finally {
      setTranslating(false);
    }
  };

  const handleSourceTitleChange = (val: string, lang: SupportedLang) => {
    if (lang === "ru") setFormTitleRu(val);
    else if (lang === "uz") setFormTitleUz(val);
    else setFormTitleEn(val);

    if (lang !== formSourceLang) {
      const newStatus: TranslationStatus = val.trim() ? "reviewed" : "missing";
      if (lang === "ru") setFormStatusRu(newStatus);
      else if (lang === "uz") setFormStatusUz(newStatus);
      else setFormStatusEn(newStatus);
    }
  };

  const handleSaveMeeting = async () => {
    const sourceText = getSourceTitle();
    if (!sourceText.trim() || !formDate || !org || !profile) return;
    setSaving(true);

    const getFieldValue = (lang: SupportedLang) =>
      lang === "ru" ? formTitleRu : lang === "uz" ? formTitleUz : formTitleEn;
    const markReviewed = (status: TranslationStatus, lang: SupportedLang): TranslationStatus => {
      if (lang !== formSourceLang && status === "missing" && getFieldValue(lang).trim()) {
        return "reviewed";
      }
      return status;
    };

    const payload = {
      title: sourceText.trim(),
      title_ru: formTitleRu.trim() || null,
      title_uz: formTitleUz.trim() || null,
      title_en: formTitleEn.trim() || null,
      source_language: formSourceLang,
      translation_status_ru: markReviewed(formStatusRu, "ru"),
      translation_status_uz: markReviewed(formStatusUz, "uz"),
      translation_status_en: markReviewed(formStatusEn, "en"),
      start_at: new Date(formDate).toISOString(),
      status: formStatus,
    };

    try {
      const created = await createNSMeeting(org.id, profile.id, payload);
      setShowMeetingForm(false);
      if (created) {
        navigate(`/ns-meetings/${created.id}`);
      } else {
        await loadMeetings();
      }
    } catch (e) {
      console.error(e);
      setSaveError(e instanceof Error ? e.message : t("common.saveFailed", "Не удалось сохранить. Попробуйте ещё раз."));
    }
    setSaving(false);
  };

  const statusLabel = (s: string) => {
    if (s === "draft") return t("nsMeetings.statusDraft");
    if (s === "scheduled") return t("nsMeetings.statusScheduled");
    return t("nsMeetings.statusCompleted");
  };

  const statusColor = (s: string) => {
    if (s === "completed") return { bg: "#DCFCE7", color: "#166534" };
    if (s === "scheduled") return { bg: "#DBEAFE", color: "#1E40AF" };
    return { bg: "#F3F4F6", color: "#6B7280" };
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>{t("nsMeetings.title")}</h1>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>
        {t("nsMeetings.subtitle")}
      </p>

      <div style={panelStyle}>
        {isAdmin && (
          <button onClick={openCreateForm} style={primaryBtnStyle}>
            + {t("nsMeetings.createMeeting")}
          </button>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: isAdmin ? 16 : 0 }}>
          {meetings.length === 0 && (
            <p style={{ color: "#9CA3AF", fontSize: 14, textAlign: "center", padding: 20 }}>
              {t("nsMeetings.noMeetingSelected")}
            </p>
          )}
          {meetings.map((m) => {
            const sc = statusColor(m.status);
            return (
              <button
                key={m.id}
                onClick={() => navigate(`/ns-meetings/${m.id}`)}
                style={{
                  ...meetingCardStyle,
                  borderColor: m.materials_ready ? "#16A34A" : "#E5E7EB",
                  background: m.materials_ready ? "#F0FDF4" : "#FFFFFF",
                  borderLeft: m.materials_ready ? "4px solid #16A34A" : undefined,
                  boxShadow: m.materials_ready ? "0 0 0 1px #BBF7D0" : undefined,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", marginBottom: 4 }}>
                  {getLocalizedField(m as unknown as Record<string, unknown>, "title")}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: "#6B7280" }}>
                    {new Date(m.start_at).toLocaleDateString(getIntlLocale(), {
                      day: "2-digit", month: "2-digit", year: "numeric",
                    })}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                    background: sc.bg, color: sc.color,
                  }}>
                    {statusLabel(m.status)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Create Meeting Modal ===== */}
      {showMeetingForm && (
        <div style={overlayStyle}>
          <div style={{ ...modalStyle, maxWidth: 540 }}>
            <h3 style={{ margin: "0 0 16px" }}>
              {t("nsMeetings.createMeeting")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

              <div>
                <label style={labelStyle}>{t("nsMeetings.sourceLanguage")}</label>
                <select
                  value={formSourceLang}
                  onChange={(e) => {
                    const l = e.target.value as SupportedLang;
                    setFormSourceLang(l);
                    setFormLangTab(l);
                    setFormStatusRu(l === "ru" ? "original" : formStatusRu === "original" ? "reviewed" : formStatusRu);
                    setFormStatusUz(l === "uz" ? "original" : formStatusUz === "original" ? "reviewed" : formStatusUz);
                    setFormStatusEn(l === "en" ? "original" : formStatusEn === "original" ? "reviewed" : formStatusEn);
                  }}
                  style={inputStyle}
                >
                  <option value="ru">Русский</option>
                  <option value="uz">Ўзбекча</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingTitle")}</label>
                <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #E5E7EB", marginBottom: 8 }}>
                  {(["ru", "uz", "en"] as SupportedLang[]).map((lang) => {
                    const status = lang === "ru" ? formStatusRu : lang === "uz" ? formStatusUz : formStatusEn;
                    const isSource = lang === formSourceLang;
                    const isActive = lang === formLangTab;
                    const isEmpty = (lang === "ru" ? formTitleRu : lang === "uz" ? formTitleUz : formTitleEn).trim() === "";
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setFormLangTab(lang)}
                        style={{
                          padding: "6px 16px", fontSize: 13, cursor: "pointer",
                          borderBottom: isActive ? "2px solid #3B82F6" : "2px solid transparent",
                          background: "none", fontWeight: isActive ? 600 : 400,
                          color: isActive ? "#3B82F6" : "#6B7280",
                          display: "flex", alignItems: "center", gap: 6,
                        }}
                      >
                        {lang.toUpperCase()}
                        {isSource && <span style={{ fontSize: 10, background: "#D1FAE5", color: "#065F46", borderRadius: 4, padding: "1px 5px" }}>src</span>}
                        {!isSource && isEmpty && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#D1D5DB", display: "inline-block" }} />}
                        {!isSource && !isEmpty && <span style={getStatusBadgeStyle(status)}>{status === "auto_translated" ? "✦" : "✓"}</span>}
                      </button>
                    );
                  })}
                </div>
                {(["ru", "uz", "en"] as SupportedLang[]).map((lang) => (
                  formLangTab === lang && (
                    <input
                      key={lang}
                      value={lang === "ru" ? formTitleRu : lang === "uz" ? formTitleUz : formTitleEn}
                      onChange={(e) => handleSourceTitleChange(e.target.value, lang)}
                      placeholder={lang === formSourceLang ? t("nsMeetings.meetingTitle") : t("nsMeetings.translationPlaceholder")}
                      style={inputStyle}
                    />
                  )
                ))}
              </div>

              <button
                type="button"
                onClick={handleGenerateTranslations}
                disabled={translating || !getSourceTitle().trim()}
                style={{
                  ...smallBtnStyle,
                  opacity: translating || !getSourceTitle().trim() ? 0.5 : 1,
                  fontSize: 13, display: "flex", alignItems: "center", gap: 6,
                }}
              >
                ✦ {translating ? t("nsMeetings.generating") : t("nsMeetings.generateTranslations")}
              </button>
              {!translating && !translationError && (
                <p style={{ fontSize: 11, color: "#7C3AED", margin: "-4px 0 0" }}>
                  {t("nsMeetings.translationProviderNote")}
                </p>
              )}
              {translationError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: "-4px 0 0", background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
                  ⚠ {translationError}
                </p>
              )}

              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingDate")}</label>
                <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingStatus")}</label>
                <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)} style={inputStyle}>
                  <option value="draft">{t("nsMeetings.statusDraft")}</option>
                  <option value="scheduled">{t("nsMeetings.statusScheduled")}</option>
                  <option value="completed">{t("nsMeetings.statusCompleted")}</option>
                </select>
              </div>

              {saveError && (
                <p style={{ fontSize: 12, color: "#DC2626", margin: 0, background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
                  ⚠ {saveError}
                </p>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => { setSaveError(""); handleSaveMeeting(); }}
                  disabled={saving || !getSourceTitle().trim() || !formDate}
                  style={{ ...primaryBtnStyle, width: "auto", opacity: saving || !getSourceTitle().trim() || !formDate ? 0.5 : 1 }}
                >
                  {saving ? t("common.saving") : t("nsMeetings.save")}
                </button>
                <button onClick={() => setShowMeetingForm(false)} style={smallBtnStyle}>
                  {t("nsMeetings.cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Styles ----------

const panelStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 24,
  maxWidth: 560,
};

const meetingCardStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  borderRadius: 10,
  border: "2px solid #E5E7EB",
  background: "#FFFFFF",
  cursor: "pointer",
  transition: "all 0.15s",
  width: "100%",
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 8,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  cursor: "pointer",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#374151",
  cursor: "pointer",
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

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#6B7280",
  fontWeight: 500,
  display: "block",
  marginBottom: 4,
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
  width: 440,
  maxWidth: "90vw",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};
