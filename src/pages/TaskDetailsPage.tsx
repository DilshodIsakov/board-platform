import { useEffect, useState, useRef, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  getTask,
  updateTask,
  setTaskStatus,
  addAssignee,
  removeAssignee,
  listComments,
  addComment,
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  getAttachmentUrl,
  listOrgProfiles,
  formatFileSize,
  type BoardTask,
  type BoardTaskComment,
  type BoardTaskAttachment,
} from "../lib/tasks";
import { getLocalizedField } from "../lib/i18nHelpers";
import {
  generateTaskTranslations,
  translationStatusColor,
  translationStatusLabel,
  type SupportedLang,
} from "../lib/translationService";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

const STATUS_KEYS = ["open", "in_progress", "done", "canceled", "overdue"];

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: "#DBEAFE", color: "#1E40AF" },
  in_progress: { bg: "#FEF3C7", color: "#92400E" },
  done: { bg: "#D1FAE5", color: "#065F46" },
  canceled: { bg: "#F3F4F6", color: "#6B7280" },
  overdue: { bg: "#FEE2E2", color: "#991B1B" },
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  low: { bg: "#F3F4F6", color: "#6B7280" },
  medium: { bg: "#FEF3C7", color: "#92400E" },
  high: { bg: "#FEE2E2", color: "#991B1B" },
};

const MANAGE_ROLES = ["admin", "corp_secretary"];
const AVATAR_COLORS = ["#7C3AED", "#059669", "#DC2626", "#2563EB", "#D97706", "#0891B2"];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0]?.toUpperCase() || "?";
}

export default function TaskDetailsPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<BoardTask | null>(null);
  const [comments, setComments] = useState<BoardTaskComment[]>([]);
  const [attachments, setAttachments] = useState<BoardTaskAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Editing states
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  // Multilingual edit states
  const [editSourceLang, setEditSourceLang] = useState<SupportedLang>("ru");
  const [editLangTab, setEditLangTab] = useState<SupportedLang>("ru");
  const [editTitleRu, setEditTitleRu] = useState("");
  const [editTitleUz, setEditTitleUz] = useState("");
  const [editTitleEn, setEditTitleEn] = useState("");
  const [editDescRu, setEditDescRu] = useState("");
  const [editDescUz, setEditDescUz] = useState("");
  const [editDescEn, setEditDescEn] = useState("");
  const [editStatusRu, setEditStatusRu] = useState<string>("original");
  const [editStatusUz, setEditStatusUz] = useState<string>("missing");
  const [editStatusEn, setEditStatusEn] = useState<string>("missing");
  const [editTranslating, setEditTranslating] = useState(false);
  const [editTranslationGenerated, setEditTranslationGenerated] = useState(false);
  const [editTranslationError, setEditTranslationError] = useState("");
  const [editSourceSnapshot, setEditSourceSnapshot] = useState({ title: "", desc: "" });

  // Comment
  const [commentText, setCommentText] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  // Attachments
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Assignees modal
  const [showAssignees, setShowAssignees] = useState(false);
  const [orgProfiles, setOrgProfiles] = useState<{ id: string; full_name: string; role: string }[]>([]);

  const canManage = profile && (MANAGE_ROLES.includes(profile.role) || task?.created_by === profile.id);
  const canManageAssignees = profile && (MANAGE_ROLES.includes(profile.role) || task?.created_by === profile.id);

  useEffect(() => {
    if (id) loadAll();
  }, [id]);

  const loadAll = async () => {
    if (!id) return;
    setLoading(true);
    const [t, c, a] = await Promise.all([
      getTask(id),
      listComments(id),
      listAttachments(id),
    ]);
    setTask(t);
    setComments(c);
    setAttachments(a);
    if (t) {
      setEditTitle(t.title);
      setEditDesc(t.description || "");
      setEditPriority(t.priority);
      setEditDueDate(t.due_date || "");
      // multilingual
      const srcLang = (t.source_language as SupportedLang) || "ru";
      setEditSourceLang(srcLang);
      setEditLangTab(srcLang);
      setEditTitleRu(t.title_ru || "");
      setEditTitleUz(t.title_uz || "");
      setEditTitleEn(t.title_en || "");
      setEditDescRu(t.description_ru || "");
      setEditDescUz(t.description_uz || "");
      setEditDescEn(t.description_en || "");
      setEditStatusRu(t.translation_status_ru || "original");
      setEditStatusUz(t.translation_status_uz || "missing");
      setEditStatusEn(t.translation_status_en || "missing");
      setEditTranslationGenerated(false);
    }
    setLoading(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!task) return;
    try {
      if (canManage) {
        await updateTask(task.id, { status: newStatus as BoardTask["status"] });
      } else {
        await setTaskStatus(task.id, newStatus);
      }
      setTask({ ...task, status: newStatus as BoardTask["status"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tasks.statusChangeError"));
    }
  };

  const handleSaveEdit = async () => {
    if (!task) return;
    setSaving(true);
    // Derive legacy title/description from source language
    const srcTitle = (editSourceLang === "ru" ? editTitleRu : editSourceLang === "uz" ? editTitleUz : editTitleEn).trim();
    const srcDesc  = (editSourceLang === "ru" ? editDescRu  : editSourceLang === "uz" ? editDescUz  : editDescEn).trim();
    // Safety net: if user typed content in non-source tab but status is still "missing", promote to "reviewed"
    const resolveEditStatus = (lang: SupportedLang, status: string) => {
      if (lang === editSourceLang) return status;
      const titleVal = lang === "ru" ? editTitleRu : lang === "uz" ? editTitleUz : editTitleEn;
      const descVal  = lang === "ru" ? editDescRu  : lang === "uz" ? editDescUz  : editDescEn;
      if (status === "missing" && (titleVal.trim() || descVal.trim())) return "reviewed";
      return status;
    };
    const resolvedRu = resolveEditStatus("ru", editStatusRu);
    const resolvedUz = resolveEditStatus("uz", editStatusUz);
    const resolvedEn = resolveEditStatus("en", editStatusEn);
    try {
      await updateTask(task.id, {
        title:       srcTitle || editTitle.trim(),
        description: srcDesc || editDesc.trim() || null,
        priority:    editPriority as BoardTask["priority"],
        due_date:    editDueDate || null,
        source_language:       editSourceLang,
        title_ru:              editTitleRu || null,
        title_uz:              editTitleUz || null,
        title_en:              editTitleEn || null,
        description_ru:        editDescRu || null,
        description_uz:        editDescUz || null,
        description_en:        editDescEn || null,
        translation_status_ru: resolvedRu,
        translation_status_uz: resolvedUz,
        translation_status_en: resolvedEn,
        translation_updated_at: new Date().toISOString(),
      });
      setTask({
        ...task,
        title:       srcTitle || editTitle.trim(),
        description: srcDesc || editDesc.trim() || null,
        priority:    editPriority as BoardTask["priority"],
        due_date:    editDueDate || null,
        source_language:       editSourceLang,
        title_ru:              editTitleRu || null,
        title_uz:              editTitleUz || null,
        title_en:              editTitleEn || null,
        description_ru:        editDescRu || null,
        description_uz:        editDescUz || null,
        description_en:        editDescEn || null,
        translation_status_ru: resolvedRu,
        translation_status_uz: resolvedUz,
        translation_status_en: resolvedEn,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!task || !profile || !commentText.trim()) return;
    setSendingComment(true);
    try {
      const c = await addComment(task.id, profile.id, commentText.trim());
      setComments((prev) => [...prev, c]);
      setCommentText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("chat.sendError"));
    } finally {
      setSendingComment(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task || !profile || !org) return;
    setUploading(true);
    try {
      const a = await uploadAttachment(task.id, file, profile.id, org.id);
      setAttachments((prev) => [a, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDownload = async (att: BoardTaskAttachment) => {
    const url = await getAttachmentUrl(att.file_path);
    if (url) window.open(url, "_blank");
  };

  const handleDeleteAttachment = async (att: BoardTaskAttachment) => {
    if (!confirm(t("taskDetails.deleteFileConfirm"))) return;
    try {
      await deleteAttachment(att);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  const canDeleteAttachment = (att: BoardTaskAttachment) =>
    profile && (att.uploaded_by === profile.id || MANAGE_ROLES.includes(profile.role));

  // Assignees management
  const openAssigneesModal = async () => {
    if (!org) return;
    const profiles = await listOrgProfiles(org.id);
    setOrgProfiles(profiles);
    setShowAssignees(true);
  };

  const handleToggleAssignee = async (profileId: string) => {
    if (!task) return;
    const existing = task.assignees?.find((a) => a.assignee_profile_id === profileId);
    try {
      if (existing) {
        await removeAssignee(task.id, profileId);
      } else {
        // Default to co_executor; if no assignees yet, set as executor
        const role = (!task.assignees || task.assignees.length === 0) ? "executor" : "co_executor";
        await addAssignee(task.id, profileId, role);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  const handleSetMainExecutor = async (profileId: string) => {
    if (!task) return;
    try {
      // Remove and re-add current main executor as co_executor
      const currentMain = task.assignees?.find((a) => a.role_in_task === "executor");
      if (currentMain) {
        await removeAssignee(task.id, currentMain.assignee_profile_id);
        await addAssignee(task.id, currentMain.assignee_profile_id, "co_executor");
      }
      // Remove and re-add new main executor as executor
      await removeAssignee(task.id, profileId);
      await addAssignee(task.id, profileId, "executor");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  if (loading) return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>;
  if (!task) return <div style={{ color: "#DC2626", padding: "40px 0" }}>{t("taskDetails.notFound")}</div>;

  const sc = STATUS_COLORS[task.status] || STATUS_COLORS.open;
  const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const isOverdue = task.due_date && task.status !== "done" && task.status !== "canceled" && new Date(task.due_date) < new Date(new Date().toISOString().slice(0, 10));

  return (
    <div>
      {/* Back + Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => navigate("/tasks")} style={backBtnStyle}>
          &larr; {t("taskDetails.backToTasks")}
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {task.status !== "done" && (
            <button onClick={() => handleStatusChange("done")} style={doneBtnStyle}>
              {t("taskStatus.done")}
            </button>
          )}
          {canManage && !editing && (
            <button onClick={() => setEditing(true)} style={editBtnStyle}>
              {t("admin.edit")}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
          <button onClick={() => setError("")} style={{ float: "right", background: "none", border: "none", cursor: "pointer", color: "#991B1B" }}>&times;</button>
        </div>
      )}

      {/* Header card */}
      <div style={cardStyle}>
        {editing ? (() => {
          const getEditTitle = (lang: SupportedLang) => lang === "ru" ? editTitleRu : lang === "uz" ? editTitleUz : editTitleEn;
          const setEditTitleForLang = (lang: SupportedLang, v: string) => {
            if (lang === "ru") setEditTitleRu(v);
            else if (lang === "uz") setEditTitleUz(v);
            else setEditTitleEn(v);
            // Update translation status when user manually types in a non-source tab
            if (lang !== editSourceLang) {
              const descVal = lang === "ru" ? editDescRu : lang === "uz" ? editDescUz : editDescEn;
              const newStatus = (v.trim() || descVal.trim()) ? "reviewed" : "missing";
              if (lang === "ru") setEditStatusRu(newStatus);
              else if (lang === "uz") setEditStatusUz(newStatus);
              else setEditStatusEn(newStatus);
            }
          };
          const getEditDesc = (lang: SupportedLang) => lang === "ru" ? editDescRu : lang === "uz" ? editDescUz : editDescEn;
          const setEditDescForLang = (lang: SupportedLang, v: string) => {
            if (lang === "ru") setEditDescRu(v);
            else if (lang === "uz") setEditDescUz(v);
            else setEditDescEn(v);
            // Update translation status when user manually types in a non-source tab
            if (lang !== editSourceLang) {
              const titleVal = lang === "ru" ? editTitleRu : lang === "uz" ? editTitleUz : editTitleEn;
              const newStatus = (titleVal.trim() || v.trim()) ? "reviewed" : "missing";
              if (lang === "ru") setEditStatusRu(newStatus);
              else if (lang === "uz") setEditStatusUz(newStatus);
              else setEditStatusEn(newStatus);
            }
          };
          const editSourceTitle = getEditTitle(editSourceLang);
          const editSourceDesc = getEditDesc(editSourceLang);
          const isStale = editTranslationGenerated && (editSourceTitle !== editSourceSnapshot.title || editSourceDesc !== editSourceSnapshot.desc);

          const tabDot = (lang: SupportedLang) => {
            const st = lang === "ru" ? editStatusRu : lang === "uz" ? editStatusUz : editStatusEn;
            const hasTitle = !!getEditTitle(lang).trim();
            const color = hasTitle ? translationStatusColor(st as Parameters<typeof translationStatusColor>[0]) : "#D1D5DB";
            return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 5 }} />;
          };

          const handleGenerate = async () => {
            if (!editSourceTitle.trim()) return;
            setEditTranslating(true);
            setEditTranslationError("");
            try {
              const draft = await generateTaskTranslations(editSourceLang, editSourceTitle.trim(), editSourceDesc.trim());
              setEditTitleRu(draft.title_ru);
              setEditTitleUz(draft.title_uz);
              setEditTitleEn(draft.title_en);
              setEditDescRu(draft.description_ru);
              setEditDescUz(draft.description_uz);
              setEditDescEn(draft.description_en);
              setEditStatusRu(draft.status_ru);
              setEditStatusUz(draft.status_uz);
              setEditStatusEn(draft.status_en);
              setEditTranslationGenerated(true);
              setEditSourceSnapshot({ title: editSourceTitle.trim(), desc: editSourceDesc.trim() });
            } catch (err) {
              console.error("[translate] error:", err);
              setEditTranslationError(err instanceof Error ? err.message : t("taskTable.translationError"));
            } finally {
              setEditTranslating(false);
            }
          };

          return (
            <>
              {/* Source language selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <label style={{ ...metaLabelStyle, margin: 0, whiteSpace: "nowrap" }}>{t("taskTable.sourceLang")}</label>
                <select
                  value={editSourceLang}
                  onChange={(e) => {
                    const lang = e.target.value as SupportedLang;
                    setEditSourceLang(lang);
                    setEditLangTab(lang);
                    setEditStatusRu(lang === "ru" ? "original" : "missing");
                    setEditStatusUz(lang === "uz" ? "original" : "missing");
                    setEditStatusEn(lang === "en" ? "original" : "missing");
                    setEditTranslationGenerated(false);
                  }}
                  style={{ ...inputStyle, width: "auto" }}
                >
                  <option value="ru">{t("langTabs.ru")}</option>
                  <option value="uz">{t("langTabs.uz")}</option>
                  <option value="en">{t("langTabs.en")}</option>
                </select>
              </div>

              {/* Lang tabs */}
              <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E5E7EB", marginBottom: 12 }}>
                {(["ru", "uz", "en"] as SupportedLang[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setEditLangTab(lang)}
                    style={{
                      padding: "6px 16px",
                      background: "none",
                      border: "none",
                      borderBottom: editLangTab === lang ? "2px solid #3B82F6" : "2px solid transparent",
                      marginBottom: -2,
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: editLangTab === lang ? 600 : 400,
                      color: editLangTab === lang ? "#3B82F6" : "#6B7280",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    {tabDot(lang)}
                    {t(`langTabs.${lang}`)}
                    {lang === editSourceLang && (
                      <span style={{ fontSize: 10, marginLeft: 5, background: "#DBEAFE", color: "#1E40AF", padding: "1px 5px", borderRadius: 4 }}>src</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Title */}
              <input
                value={getEditTitle(editLangTab)}
                onChange={(e) => setEditTitleForLang(editLangTab, e.target.value)}
                style={{ ...inputStyle, fontSize: 18, fontWeight: 600, marginBottom: 10 }}
                placeholder={t("taskTable.titlePlaceholder")}
              />

              {/* Description */}
              <textarea
                value={getEditDesc(editLangTab)}
                onChange={(e) => setEditDescForLang(editLangTab, e.target.value)}
                rows={3}
                style={{ ...inputStyle, marginBottom: 10, resize: "vertical" }}
                placeholder={t("taskDetails.descriptionPlaceholder")}
              />

              {/* Generate translations */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={editTranslating || !editSourceTitle.trim()}
                    style={{ padding: "6px 12px", background: "#F3F4F6", border: "1px solid #D1D5DB", borderRadius: 7, fontSize: 12, cursor: editSourceTitle.trim() ? "pointer" : "default", color: "#374151" }}
                  >
                    {editTranslating ? t("taskTable.generating") : t("taskTable.generateTranslations")}
                  </button>
                  {isStale && (
                    <span style={{ fontSize: 12, color: "#D97706", background: "#FEF3C7", padding: "3px 8px", borderRadius: 6 }}>
                      ⚠ {t("taskTable.translationStale")}
                    </span>
                  )}
                  {!isStale && editTranslationGenerated && !editTranslationError && (
                    <span style={{ fontSize: 12, color: "#059669" }}>
                      {translationStatusLabel("auto_translated")} {t("nsMeetings.translationStatus")}
                    </span>
                  )}
                </div>
                {!editTranslating && !editTranslationError && (
                  <div style={{ fontSize: 11, color: "#7C3AED", marginTop: 4 }}>
                    {t("taskTable.translationProviderNote")}
                  </div>
                )}
                {editTranslationError && (
                  <div style={{ fontSize: 12, color: "#DC2626", marginTop: 4, background: "#FEE2E2", padding: "5px 10px", borderRadius: 6 }}>
                    ⚠ {editTranslationError}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={metaLabelStyle}>{t("taskTable.priority")}</label>
                  <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={inputStyle}>
                    <option value="low">{t("taskPriority.low")}</option>
                    <option value="medium">{t("taskPriority.medium")}</option>
                    <option value="high">{t("taskPriority.high")}</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={metaLabelStyle}>{t("taskTable.deadline")}</label>
                  <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setEditing(false)} style={cancelBtnStyle}>{t("common.cancel")}</button>
                <button onClick={handleSaveEdit} disabled={saving} style={saveBtnStyle}>
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </>
          );
        })() : (
          <>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
              {getLocalizedField(task as unknown as Record<string, unknown>, "title") || task.title}
            </h1>
            {(() => {
              const desc = getLocalizedField(task as unknown as Record<string, unknown>, "description") || task.description;
              return desc ? <p style={{ color: "#4B5563", fontSize: 15, margin: "0 0 16px", lineHeight: 1.6 }}>{desc}</p> : null;
            })()}

            {/* Meta row */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
              {/* Status */}
              <div>
                <span style={metaLabelStyle}>{t("taskTable.status")}</span>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  style={{
                    ...badgeStyle,
                    background: sc.bg,
                    color: sc.color,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                    paddingRight: 24,
                    appearance: "auto",
                  }}
                >
                  {STATUS_KEYS.map((k) => (
                    <option key={k} value={k}>{t(`taskStatus.${k}`)}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <span style={metaLabelStyle}>{t("taskTable.priority")}</span>
                <span style={{ ...badgeStyle, background: pc.bg, color: pc.color }}>{t(`taskPriority.${task.priority}`)}</span>
              </div>

              {/* Due date */}
              <div>
                <span style={metaLabelStyle}>{t("taskTable.deadline")}</span>
                <span style={{ fontWeight: isOverdue ? 600 : 400, color: isOverdue ? "#DC2626" : "#374151", fontSize: 14 }}>
                  {task.due_date ? new Date(task.due_date).toLocaleDateString(getIntlLocale()) : "—"}
                </span>
              </div>

              {/* Creator */}
              <div>
                <span style={metaLabelStyle}>{t("taskDetails.creator")}</span>
                <span style={{ fontSize: 14, color: "#374151" }}>
                  {(task.creator as { full_name: string } | undefined)?.full_name || "—"}
                </span>
              </div>

              {/* Created at */}
              <div>
                <span style={metaLabelStyle}>{t("taskDetails.createdDate")}</span>
                <span style={{ fontSize: 14, color: "#6B7280" }}>
                  {new Date(task.created_at).toLocaleDateString(getIntlLocale())}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Assignees */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>{t("taskTable.assignees")}</h2>
          {canManageAssignees && (
            <button onClick={openAssigneesModal} style={editBtnStyle}>{t("common.edit")}</button>
          )}
        </div>
        {(!task.assignees || task.assignees.length === 0) ? (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>{t("taskDetails.noAssignees")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {task.assignees
              .slice()
              .sort((a, b) => (a.role_in_task === "executor" ? -1 : b.role_in_task === "executor" ? 1 : 0))
              .map((a, i) => {
                const isMain = a.role_in_task === "executor";
                return (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                      color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 600, flexShrink: 0,
                      border: isMain ? "2px solid #F59E0B" : "none",
                      boxSizing: "border-box",
                    }}>
                      {getInitials(a.profile?.full_name || "?")}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: 14, color: "#111827" }}>
                        {a.profile?.full_name || "—"}
                        {isMain && (
                          <span style={{
                            marginLeft: 8,
                            fontSize: 11,
                            background: "#FEF3C7",
                            color: "#92400E",
                            padding: "2px 8px",
                            borderRadius: 8,
                            fontWeight: 500,
                          }}>
                            {t("taskTable.main")}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{t(`tasks.${a.role_in_task === "executor" ? "mainExecutor" : a.role_in_task === "co_executor" ? "coExecutor" : "controller"}`)}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Comments */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>{t("taskDetails.comments", { count: comments.length })}</h2>

        {comments.length === 0 && (
          <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 16 }}>{t("taskDetails.noComments")}</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          {comments.map((c) => (
            <div key={c.id} style={commentStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 500, fontSize: 14, color: "#111827" }}>
                  {(c.author as { full_name: string } | undefined)?.full_name || "—"}
                </span>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                  {new Date(c.created_at).toLocaleString(getIntlLocale(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.5 }}>{c.body}</div>
            </div>
          ))}
        </div>

        {profile && (
          <form onSubmit={handleAddComment} style={{ display: "flex", gap: 8 }}>
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={t("taskDetails.commentPlaceholder")}
              rows={2}
              style={{ ...inputStyle, flex: 1, resize: "vertical" }}
            />
            <button type="submit" disabled={sendingComment || !commentText.trim()} style={{ ...saveBtnStyle, alignSelf: "flex-end" }}>
              {sendingComment ? "..." : t("taskDetails.send")}
            </button>
          </form>
        )}
      </div>

      {/* Attachments */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>{t("taskDetails.files", { count: attachments.length })}</h2>
          {profile && (
            <>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={editBtnStyle}>
                {uploading ? t("taskDetails.uploading") : t("taskDetails.uploadFile")}
              </button>
              <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleUpload} />
            </>
          )}
        </div>

        {attachments.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>{t("taskDetails.noAttachments")}</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                <th style={thStyle}>{t("taskDetails.file")}</th>
                <th style={thStyle}>{t("taskDetails.size")}</th>
                <th style={thStyle}>{t("taskDetails.uploader")}</th>
                <th style={thStyle}>{t("taskDetails.date")}</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {attachments.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={tdStyle}>
                    <span style={{ color: "#3B82F6", cursor: "pointer" }} onClick={() => handleDownload(a)}>
                      {a.file_name}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: "#6B7280" }}>{formatFileSize(a.file_size)}</td>
                  <td style={{ ...tdStyle, color: "#6B7280" }}>{(a.uploader as { full_name: string } | undefined)?.full_name || "—"}</td>
                  <td style={{ ...tdStyle, color: "#6B7280", whiteSpace: "nowrap" }}>
                    {new Date(a.created_at).toLocaleDateString(getIntlLocale())}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => handleDownload(a)} style={smallBtnStyle}>{t("taskDetails.download")}</button>
                      {canDeleteAttachment(a) && (
                        <button onClick={() => handleDeleteAttachment(a)} style={{ ...smallBtnStyle, color: "#DC2626", borderColor: "#FCA5A5" }}>
                          {t("common.delete")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Assignees Modal */}
      {showAssignees && (
        <div style={overlayStyle} onClick={() => setShowAssignees(false)}>
          <div style={modalSmallStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{t("taskDetails.manageAssignees")}</h3>
              <button onClick={() => setShowAssignees(false)} style={closeBtnStyle}>&times;</button>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {orgProfiles.map((p) => {
                const assignee = task.assignees?.find((a) => a.assignee_profile_id === p.id);
                const isAssigned = !!assignee;
                const isMain = assignee?.role_in_task === "executor";
                return (
                  <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "8px 4px", gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={isAssigned}
                      onChange={() => handleToggleAssignee(p.id)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ flex: 1, cursor: "pointer" }} onClick={() => handleToggleAssignee(p.id)}>
                      {p.full_name}
                      <span style={{ color: "#9CA3AF", fontSize: 12, marginLeft: 4 }}>({t(`roles.${p.role}`, p.role)})</span>
                    </span>
                    {isAssigned && !isMain && (
                      <button
                        onClick={() => handleSetMainExecutor(p.id)}
                        style={{ ...smallBtnStyle, fontSize: 11, color: "#D97706", borderColor: "#FCD34D" }}
                      >
                        {t("taskDetails.makeMain")}
                      </button>
                    )}
                    {isMain && (
                      <span style={{ fontSize: 11, background: "#FEF3C7", color: "#92400E", padding: "2px 8px", borderRadius: 8 }}>
                        {t("taskDetails.mainLabel")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// Styles
// ============================================================

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "24px 28px",
  marginBottom: 20,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  color: "#111827",
};

const backBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#3B82F6",
  fontSize: 14,
  cursor: "pointer",
  padding: 0,
};

const doneBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#059669",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const editBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  background: "#fff",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
  color: "#374151",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  background: "#3B82F6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  background: "#fff",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 500,
};

const metaLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  color: "#9CA3AF",
  marginBottom: 4,
};

const commentStyle: React.CSSProperties = {
  background: "#F9FAFB",
  borderRadius: 10,
  padding: "14px 16px",
};

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 13,
  color: "#6B7280",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 10px",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #D1D5DB",
  background: "transparent",
  cursor: "pointer",
  whiteSpace: "nowrap",
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

const modalSmallStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  padding: "24px 28px",
  width: "100%",
  maxWidth: 420,
  maxHeight: "80vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 24,
  cursor: "pointer",
  color: "#9CA3AF",
  padding: 0,
  lineHeight: 1,
};
