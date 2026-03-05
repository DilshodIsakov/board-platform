import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchNSMeetings,
  createNSMeeting,
  updateNSMeeting,
  deleteNSMeeting,
  fetchAgendaItems,
  createAgendaItem,
  deleteAgendaItem,
  fetchMaterialsByAgenda,
  uploadMaterial,
  deleteMaterial,
  getMaterialUrl,
  formatFileSize,
  getFileTypeLabel,
  fetchBriefsForMeeting,
  generateBrief,
  type NSMeeting,
  type AgendaItem,
  type Material,
  type AgendaBrief,
  type BriefLang,
} from "../lib/nsMeetings";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function NSMeetingsPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const isAdmin = profile?.role === "admin";

  const [meetings, setMeetings] = useState<NSMeeting[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Meeting form
  const [showMeetingForm, setShowMeetingForm] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<NSMeeting | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formStatus, setFormStatus] = useState<string>("scheduled");
  const [saving, setSaving] = useState(false);

  // Agenda
  const [agendaItems, setAgendaItems] = useState<AgendaItem[]>([]);
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [agendaTitle, setAgendaTitle] = useState("");
  const [agendaSpeaker, setAgendaSpeaker] = useState("");

  // Materials per agenda item
  const [materialsMap, setMaterialsMap] = useState<Record<string, Material[]>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // AI Briefs — keyed by `${agendaId}_${lang}`
  const [briefsMap, setBriefsMap] = useState<Record<string, AgendaBrief>>({});
  const [briefLoading, setBriefLoading] = useState<Record<string, boolean>>({});
  const [briefError, setBriefError] = useState<Record<string, string>>({});
  const [briefCopied, setBriefCopied] = useState<Record<string, boolean>>({});
  const [briefLang, setBriefLang] = useState<Record<string, BriefLang>>({});

  const LANG_OPTIONS: { value: BriefLang; label: string }[] = [
    { value: "ru", label: "Русский" },
    { value: "uz_cyrl", label: "Ўзбекча (кириллица)" },
    { value: "en", label: "English" },
  ];

  const briefKey = (agendaId: string, lang: BriefLang) => `${agendaId}_${lang}`;
  const getCurrentLang = (agendaId: string): BriefLang => briefLang[agendaId] || "ru";

  const selected = meetings.find((m) => m.id === selectedId) || null;

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    loadMeetings();
  }, [profile]);

  useEffect(() => {
    if (selectedId) {
      loadAgenda(selectedId);
    } else {
      setAgendaItems([]);
      setMaterialsMap({});
    }
  }, [selectedId]);

  const loadMeetings = async () => {
    setLoading(true);
    const data = await fetchNSMeetings();
    setMeetings(data);
    setLoading(false);
  };

  const loadAgenda = async (meetingId: string) => {
    const items = await fetchAgendaItems(meetingId);
    setAgendaItems(items);
    // Load materials for all agenda items
    const mMap: Record<string, Material[]> = {};
    await Promise.all(
      items.map(async (item) => {
        mMap[item.id] = await fetchMaterialsByAgenda(item.id);
      })
    );
    setMaterialsMap(mMap);
    // Load saved briefs (all languages)
    if (items.length > 0) {
      const briefsByAgenda = await fetchBriefsForMeeting(items.map((i) => i.id));
      const newMap: Record<string, AgendaBrief> = {};
      for (const [agId, arr] of Object.entries(briefsByAgenda)) {
        for (const b of arr) {
          newMap[`${agId}_${b.lang}`] = b;
        }
      }
      setBriefsMap(newMap);
    }
  };

  // ---------- Meeting CRUD ----------

  const openCreateForm = () => {
    setEditingMeeting(null);
    setFormTitle("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormStatus("scheduled");
    setShowMeetingForm(true);
  };

  const openEditForm = (m: NSMeeting) => {
    setEditingMeeting(m);
    setFormTitle(m.title);
    setFormDate(m.start_at.slice(0, 10));
    setFormStatus(m.status);
    setShowMeetingForm(true);
  };

  const handleSaveMeeting = async () => {
    if (!formTitle.trim() || !formDate || !org || !profile) return;
    setSaving(true);
    try {
      if (editingMeeting) {
        await updateNSMeeting(editingMeeting.id, {
          title: formTitle.trim(),
          start_at: new Date(formDate).toISOString(),
          status: formStatus,
        });
      } else {
        await createNSMeeting(
          org.id,
          profile.id,
          formTitle.trim(),
          new Date(formDate).toISOString(),
          formStatus
        );
      }
      setShowMeetingForm(false);
      await loadMeetings();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const handleDeleteMeeting = async () => {
    if (!selected) return;
    if (!window.confirm(t("nsMeetings.confirmDelete"))) return;
    try {
      await deleteNSMeeting(selected.id);
      setSelectedId(null);
      await loadMeetings();
    } catch (e) {
      console.error(e);
    }
  };

  // ---------- Agenda CRUD ----------

  const handleAddAgenda = async () => {
    if (!agendaTitle.trim() || !selected || !org) return;
    try {
      await createAgendaItem(
        selected.id,
        org.id,
        agendaTitle.trim(),
        agendaSpeaker.trim() || null,
        agendaItems.length + 1
      );
      setAgendaTitle("");
      setAgendaSpeaker("");
      setShowAgendaForm(false);
      await loadAgenda(selected.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAgenda = async (itemId: string) => {
    try {
      await deleteAgendaItem(itemId);
      if (selected) await loadAgenda(selected.id);
    } catch (e) {
      console.error(e);
    }
  };

  // ---------- Materials ----------

  const handleUploadFile = async (agendaItemId: string, file: File) => {
    if (!org || !profile || !selected) return;
    try {
      await uploadMaterial(file, org.id, profile.id, selected.id, agendaItemId, file.name);
      await loadAgenda(selected.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteMaterial = async (mat: Material) => {
    try {
      await deleteMaterial(mat);
      if (selected) await loadAgenda(selected.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = async (mat: Material) => {
    const url = await getMaterialUrl(mat.storage_path);
    if (url) window.open(url, "_blank");
  };

  // ---------- AI Brief ----------

  const handleGenerateBrief = async (agendaId: string) => {
    const lang = getCurrentLang(agendaId);
    const key = briefKey(agendaId, lang);
    setBriefLoading((prev) => ({ ...prev, [key]: true }));
    setBriefError((prev) => ({ ...prev, [key]: "" }));
    try {
      const result = await generateBrief(agendaId, lang);
      setBriefsMap((prev) => ({
        ...prev,
        [key]: {
          id: "",
          agenda_id: agendaId,
          lang,
          brief_text: result.brief,
          files_used: result.files_used,
          docx_path: null,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id || "",
        },
      }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("nsMeetings.briefError");
      setBriefError((prev) => ({ ...prev, [key]: msg }));
    }
    setBriefLoading((prev) => ({ ...prev, [key]: false }));
  };

  const handleCopyBrief = (agendaId: string) => {
    const key = briefKey(agendaId, getCurrentLang(agendaId));
    const brief = briefsMap[key];
    if (!brief) return;
    navigator.clipboard.writeText(brief.brief_text);
    setBriefCopied((prev) => ({ ...prev, [key]: true }));
    setTimeout(() => setBriefCopied((prev) => ({ ...prev, [key]: false })), 2000);
  };

  const handleDownloadDocx = (agendaId: string) => {
    const lang = getCurrentLang(agendaId);
    const key = briefKey(agendaId, lang);
    const brief = briefsMap[key];
    if (!brief) return;

    // Find the agenda item for title/presenter
    const item = agendaItems.find((a) => a.id === agendaId);
    const title = item?.title || "";
    const presenter = item?.presenter || "";

    const docxBlob = buildDocxBlob(title, presenter, brief.brief_text, lang);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(docxBlob);
    a.download = `AI-Brief_${title.slice(0, 30).replace(/[^a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9]/g, "_")}_${lang}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  // ---------- Status helpers ----------

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

  const fileTypeIcon = (mime: string) => {
    const label = getFileTypeLabel(mime);
    const colors: Record<string, string> = { PDF: "#DC2626", Word: "#2563EB", Excel: "#16A34A", PowerPoint: "#EA580C" };
    return { label, color: colors[label] || "#6B7280" };
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

      <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 20, alignItems: "start" }}>
        {/* ===== LEFT COLUMN — Meeting List ===== */}
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
              const active = m.id === selectedId;
              const sc = statusColor(m.status);
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  style={{
                    ...meetingCardStyle,
                    borderColor: active ? "#3B82F6" : "#E5E7EB",
                    background: active ? "#EFF6FF" : "#FFFFFF",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#111827", marginBottom: 4 }}>
                    {m.title}
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

        {/* ===== RIGHT COLUMN — Meeting Details ===== */}
        <div style={panelStyle}>
          {!selected ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, color: "#9CA3AF" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                {t("nsMeetings.noMeetingSelected")}
              </div>
              <p style={{ fontSize: 13, textAlign: "center", maxWidth: 320 }}>
                {t("nsMeetings.noMeetingSelectedHint")}
              </p>
            </div>
          ) : (
            <div>
              {/* Meeting Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20 }}>{selected.title}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
                    <span style={{ fontSize: 14, color: "#6B7280" }}>
                      {new Date(selected.start_at).toLocaleDateString(getIntlLocale(), {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </span>
                    {(() => { const sc = statusColor(selected.status); return (
                      <span style={{ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10, background: sc.bg, color: sc.color }}>
                        {statusLabel(selected.status)}
                      </span>
                    ); })()}
                  </div>
                </div>
                {isAdmin && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEditForm(selected)} style={smallBtnStyle}>
                      {t("nsMeetings.editMeeting")}
                    </button>
                    <button onClick={handleDeleteMeeting} style={{ ...smallBtnStyle, color: "#DC2626", borderColor: "#FECACA" }}>
                      {t("nsMeetings.deleteMeeting")}
                    </button>
                  </div>
                )}
              </div>

              {/* Agenda Section */}
              <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16 }}>{t("nsMeetings.agenda")}</h3>
                  {isAdmin && (
                    <button onClick={() => setShowAgendaForm(!showAgendaForm)} style={smallBtnStyle}>
                      + {t("nsMeetings.addAgendaItem")}
                    </button>
                  )}
                </div>

                {/* Add agenda form */}
                {showAgendaForm && (
                  <div style={inlineFormStyle}>
                    <input
                      value={agendaTitle}
                      onChange={(e) => setAgendaTitle(e.target.value)}
                      placeholder={t("nsMeetings.agendaTitle")}
                      style={inputStyle}
                    />
                    <input
                      value={agendaSpeaker}
                      onChange={(e) => setAgendaSpeaker(e.target.value)}
                      placeholder={t("nsMeetings.speakerPlaceholder")}
                      style={inputStyle}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={handleAddAgenda} disabled={!agendaTitle.trim()} style={{
                        ...primaryBtnSmallStyle,
                        opacity: agendaTitle.trim() ? 1 : 0.5,
                      }}>
                        {t("nsMeetings.save")}
                      </button>
                      <button onClick={() => setShowAgendaForm(false)} style={smallBtnStyle}>
                        {t("nsMeetings.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {agendaItems.length === 0 && !showAgendaForm && (
                  <p style={{ color: "#9CA3AF", fontSize: 14 }}>{t("nsMeetings.noAgenda")}</p>
                )}

                {/* Agenda list */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {agendaItems.map((item, idx) => {
                    const mats = materialsMap[item.id] || [];
                    return (
                      <div key={item.id} style={agendaItemStyle}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>
                              {idx + 1}. {item.title}
                            </div>
                            {item.presenter && (
                              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
                                <span style={{ fontWeight: 500 }}>{t("nsMeetings.speaker")}:</span>{" "}
                                {item.presenter}
                              </div>
                            )}
                          </div>
                          {isAdmin && (
                            <button
                              onClick={() => handleDeleteAgenda(item.id)}
                              style={{ ...deleteBtnStyle }}
                              title={t("common.delete")}
                            >
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Materials for this agenda item */}
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
                              {t("nsMeetings.materials")}
                            </span>
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => fileInputRefs.current[item.id]?.click()}
                                  style={uploadBtnStyle}
                                >
                                  + {t("nsMeetings.uploadFile")}
                                </button>
                                <input
                                  ref={(el) => { fileInputRefs.current[item.id] = el; }}
                                  type="file"
                                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                                  style={{ display: "none" }}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadFile(item.id, f);
                                    e.target.value = "";
                                  }}
                                />
                              </>
                            )}
                          </div>

                          {mats.length === 0 && (
                            <p style={{ color: "#D1D5DB", fontSize: 13, margin: 0 }}>
                              {t("nsMeetings.noMaterials")}
                            </p>
                          )}

                          {mats.map((mat) => {
                            const ft = fileTypeIcon(mat.mime_type);
                            return (
                              <div key={mat.id} style={materialCardStyle}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    width: 36, height: 36, borderRadius: 8, display: "flex",
                                    alignItems: "center", justifyContent: "center",
                                    background: ft.color + "18", color: ft.color,
                                    fontSize: 11, fontWeight: 700, flexShrink: 0,
                                  }}>
                                    {ft.label}
                                  </div>
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 14, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {mat.file_name}
                                    </div>
                                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                                      {formatFileSize(mat.file_size)} · {new Date(mat.created_at).toLocaleDateString(getIntlLocale())}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                  <button onClick={() => handleDownload(mat)} style={downloadBtnStyle}>
                                    ↓ {t("nsMeetings.download")}
                                  </button>
                                  {isAdmin && (
                                    <button onClick={() => handleDeleteMaterial(mat)} style={{ ...deleteBtnStyle, fontSize: 12 }}>
                                      ✕
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* AI-Brief Section */}
                        <div style={{ marginTop: 14 }}>
                          {(() => {
                            const lang = getCurrentLang(item.id);
                            const key = briefKey(item.id, lang);
                            const brief = briefsMap[key];
                            const isLoading = briefLoading[key];
                            const error = briefError[key];
                            return (
                              <>
                                {/* Language selector + Generate button */}
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <select
                                    value={lang}
                                    onChange={(e) => setBriefLang((prev) => ({ ...prev, [item.id]: e.target.value as BriefLang }))}
                                    style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #D1D5DB", background: "#fff" }}
                                  >
                                    {LANG_OPTIONS.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                  {!isLoading && (
                                    <button
                                      onClick={() => handleGenerateBrief(item.id)}
                                      disabled={mats.length === 0}
                                      style={{
                                        ...aiBriefBtnStyle,
                                        opacity: mats.length === 0 ? 0.5 : 1,
                                        cursor: mats.length === 0 ? "not-allowed" : "pointer",
                                      }}
                                      title={mats.length === 0 ? t("nsMeetings.noMaterialsForBrief") : ""}
                                    >
                                      {brief ? "↻ " + t("nsMeetings.refreshBrief") : "✨ " + t("nsMeetings.generateBrief")}
                                    </button>
                                  )}
                                </div>

                                {isLoading && (
                                  <div style={{ fontSize: 13, color: "#6B7280", padding: "8px 0" }}>
                                    ⏳ {t("nsMeetings.briefLoading")}
                                  </div>
                                )}

                                {error && (
                                  <div style={{ fontSize: 13, color: "#DC2626", padding: "4px 0" }}>
                                    {error}
                                  </div>
                                )}

                                {brief && !isLoading && (
                                  <div style={briefBlockStyle}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: "#7C3AED" }}>
                                        ✨ {t("nsMeetings.aiBrief")} ({LANG_OPTIONS.find((o) => o.value === lang)?.label})
                                      </span>
                                      <div style={{ display: "flex", gap: 6 }}>
                                        <button onClick={() => handleCopyBrief(item.id)} style={briefActionBtnStyle}>
                                          {briefCopied[key] ? t("nsMeetings.briefCopied") : t("nsMeetings.copyBrief")}
                                        </button>
                                        <button onClick={() => handleDownloadDocx(item.id)} style={{ ...briefActionBtnStyle, color: "#2563EB" }}>
                                          ↓ {t("nsMeetings.downloadDocx")}
                                        </button>
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 13, lineHeight: 1.6, color: "#374151", whiteSpace: "pre-wrap" }}>
                                      {brief.brief_text}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 8 }}>
                                      {t("nsMeetings.briefFilesUsed")}: {brief.files_used}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Create/Edit Meeting Modal ===== */}
      {showMeetingForm && (
        <div style={overlayStyle} onClick={() => setShowMeetingForm(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 16px" }}>
              {editingMeeting ? t("nsMeetings.editMeeting") : t("nsMeetings.createMeeting")}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={labelStyle}>{t("nsMeetings.meetingTitle")}</label>
                <input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} style={inputStyle} />
              </div>
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
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={handleSaveMeeting}
                  disabled={saving || !formTitle.trim() || !formDate}
                  style={{ ...primaryBtnStyle, opacity: saving || !formTitle.trim() || !formDate ? 0.5 : 1 }}
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

const primaryBtnSmallStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
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

const uploadBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 6,
  border: "1px solid #D1D5DB",
  background: "#F9FAFB",
  color: "#374151",
  cursor: "pointer",
};

const downloadBtnStyle: React.CSSProperties = {
  padding: "4px 12px",
  fontSize: 12,
  fontWeight: 500,
  borderRadius: 6,
  border: "1px solid #DBEAFE",
  background: "#EFF6FF",
  color: "#1E40AF",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const agendaItemStyle: React.CSSProperties = {
  padding: 16,
  background: "#F9FAFB",
  borderRadius: 10,
  border: "1px solid #F3F4F6",
};

const materialCardStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  marginBottom: 6,
};

const inlineFormStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 16,
  background: "#F9FAFB",
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  marginBottom: 16,
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

const aiBriefBtnStyle: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  border: "1px solid #DDD6FE",
  background: "#F5F3FF",
  color: "#7C3AED",
  cursor: "pointer",
};

const briefBlockStyle: React.CSSProperties = {
  padding: 16,
  background: "#FAFAFE",
  borderRadius: 10,
  border: "1px solid #E9E5F5",
};

const briefActionBtnStyle: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 6,
  border: "1px solid #DDD6FE",
  background: "#FFFFFF",
  color: "#7C3AED",
  cursor: "pointer",
};

// ========== Client-side DOCX builder ==========

const DOCX_TITLES: Record<string, string> = {
  ru: "AI-Brief по вопросу повестки дня",
  uz_cyrl: "Кун тартиби масаласи бўйича AI-Brief",
  en: "AI-Brief for Agenda Item",
};

const DOCX_PRESENTER: Record<string, string> = {
  ru: "Докладчик",
  uz_cyrl: "Маърузачи",
  en: "Presenter",
};

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildDocxBlob(agendaTitle: string, presenter: string, briefText: string, lang: string): Blob {
  let body = "";
  body += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escXml(DOCX_TITLES[lang] || DOCX_TITLES.ru)}</w:t></w:r></w:p>`;
  body += `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escXml(agendaTitle)}</w:t></w:r></w:p>`;
  if (presenter) {
    body += `<w:p><w:r><w:rPr><w:i/><w:sz w:val="24"/></w:rPr><w:t>${escXml((DOCX_PRESENTER[lang] || DOCX_PRESENTER.ru) + ": " + presenter)}</w:t></w:r></w:p>`;
  }
  body += `<w:p/>`;
  for (const line of briefText.split("\n")) {
    if (!line.trim()) { body += `<w:p/>`; }
    else { body += `<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`; }
  }

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

  const enc = new TextEncoder();
  const zipBytes = buildZipClient([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(docRels) },
    { name: "word/document.xml", data: enc.encode(docXml) },
  ]);
  return new Blob([zipBytes.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i];
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZipClient(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const cds: Uint8Array[] = [];
  let off = 0;
  for (const f of files) {
    const nb = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + nb.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true);
    lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true); lv.setUint16(26, nb.length, true);
    lv.setUint16(28, 0, true); lh.set(nb, 30);
    const cd = new Uint8Array(46 + nb.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true); cv.setUint16(28, nb.length, true);
    cv.setUint32(42, off, true); cd.set(nb, 46);
    parts.push(lh, f.data); cds.push(cd);
    off += lh.length + f.data.length;
  }
  const cdOff = off;
  let cdSz = 0;
  for (const c of cds) { parts.push(c); cdSz += c.length; }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSz, true); ev.setUint32(16, cdOff, true);
  parts.push(eocd);
  const tot = parts.reduce((s, p) => s + p.length, 0);
  const res = new Uint8Array(tot);
  let p = 0;
  for (const b of parts) { res.set(b, p); p += b.length; }
  return res;
}
