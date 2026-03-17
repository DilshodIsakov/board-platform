import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  listTasks,
  createTask,
  addAssignee as addAssigneeToTask,
  listOrgProfiles,
  type BoardTask,
  type TaskFilters,
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

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: "#DBEAFE", color: "#1E40AF" },
  in_progress: { bg: "#FEF3C7", color: "#92400E" },
  done: { bg: "#D1FAE5", color: "#065F46" },
  canceled: { bg: "#F3F4F6", color: "#6B7280" },
  overdue: { bg: "#FEE2E2", color: "#991B1B" },
};

const statusTranslationKey = (status: string) =>
  status === "canceled" ? "taskStatus.cancelled" : `taskStatus.${status}`;

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  low: { bg: "#F3F4F6", color: "#6B7280" },
  medium: { bg: "#FEF3C7", color: "#92400E" },
  high: { bg: "#FEE2E2", color: "#991B1B" },
};

const CAN_CREATE_ROLES = ["admin", "corp_secretary", "board_member"];

export default function TasksListPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [duePeriod, setDuePeriod] = useState<"all" | "overdue" | "week">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const canCreate = profile && CAN_CREATE_ROLES.includes(profile.role);

  // Debounce search input — не запрашиваем БД на каждое нажатие
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadTasks();
  }, [org, statusFilter, priorityFilter, duePeriod, debouncedSearch]);

  const loadTasks = async () => {
    if (!org) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const filters: TaskFilters = {};
    if (statusFilter !== "all") filters.status = statusFilter;
    if (priorityFilter !== "all") filters.priority = priorityFilter;
    if (duePeriod !== "all") filters.duePeriod = duePeriod;
    if (debouncedSearch.trim()) filters.search = debouncedSearch.trim();
    try {
      const data = await listTasks(org.id, filters);
      setTasks(data);
    } catch (err) {
      console.error("loadTasks error:", err);
      setLoadError(err instanceof Error ? err.message : t("common.loadError"));
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name[0]?.toUpperCase() || "?";
  };

  const AVATAR_COLORS = ["#7C3AED", "#059669", "#DC2626", "#2563EB", "#D97706", "#0891B2"];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 style={{ margin: 0 }}>{t("tasks.title")}</h1>
        {canCreate && (
          <button onClick={() => setShowModal(true)} style={createBtnStyle}>
            {t("tasks.create")}
          </button>
        )}
      </div>
      <p style={{ color: "#6B7280", fontSize: 16, marginBottom: 24 }}>
        {t("tasks.subtitle")}
      </p>

      {/* Filters */}
      <div style={filterBarStyle}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="all">{t("tasks.allStatuses")}</option>
          <option value="open">{t("taskStatus.open")}</option>
          <option value="in_progress">{t("taskStatus.in_progress")}</option>
          <option value="done">{t("taskStatus.done")}</option>
          <option value="canceled">{t("taskStatus.cancelled")}</option>
          <option value="overdue">{t("taskStatus.overdue")}</option>
        </select>

        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} style={selectStyle}>
          <option value="all">{t("tasks.allPriorities")}</option>
          <option value="high">{t("taskPriority.high")}</option>
          <option value="medium">{t("taskPriority.medium")}</option>
          <option value="low">{t("taskPriority.low")}</option>
        </select>

        <select value={duePeriod} onChange={(e) => setDuePeriod(e.target.value as "all" | "overdue" | "week")} style={selectStyle}>
          <option value="all">{t("tasks.allDeadlines")}</option>
          <option value="overdue">{t("tasks.overdue")}</option>
          <option value="week">{t("tasks.thisWeek")}</option>
        </select>

        <input
          type="text"
          placeholder={t("tasks.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchInputStyle}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>
      ) : loadError ? (
        <div style={{ ...emptyStyle, color: "#DC2626" }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{t("common.loadError")}</div>
          <p style={{ fontSize: 14, color: "#9CA3AF" }}>{loadError}</p>
        </div>
      ) : tasks.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{t("tasks.noTasks")}</div>
          <p style={{ fontSize: 14, color: "#9CA3AF" }}>
            {search || statusFilter !== "all" || priorityFilter !== "all" || duePeriod !== "all"
              ? t("tasks.changeFilters")
              : t("tasks.createFirst")}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #E5E7EB" }}>
                <th style={thStyle}>{t("taskTable.task")}</th>
                <th style={thStyle}>{t("taskTable.status")}</th>
                <th style={thStyle}>{t("taskTable.priority")}</th>
                <th style={thStyle}>{t("taskTable.deadline")}</th>
                <th style={thStyle}>{t("taskTable.assignees")}</th>
                <th style={thStyle}>{t("taskTable.created")}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const sc = STATUS_COLORS[task.status] || STATUS_COLORS.open;
                const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
                const assignees = task.assignees || [];
                const isOverdue =
                  task.due_date &&
                  task.status !== "done" &&
                  task.status !== "canceled" &&
                  new Date(task.due_date) < new Date(new Date().toISOString().slice(0, 10));

                return (
                  <tr
                    key={task.id}
                    onClick={() => navigate(`/tasks/${task.id}`)}
                    style={{
                      borderBottom: "1px solid #F3F4F6",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ ...tdStyle, maxWidth: 400 }}>
                      <div style={{ fontWeight: 500, color: "#111827" }}>
                        {getLocalizedField(task as unknown as Record<string, unknown>, "title") || task.title}
                      </div>
                      {(() => {
                        const desc = getLocalizedField(task as unknown as Record<string, unknown>, "description") || task.description;
                        return desc ? (
                          <div style={{ color: "#9CA3AF", fontSize: 13, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 380 }}>
                            {desc}
                          </div>
                        ) : null;
                      })()}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ ...badgeStyle, background: sc.bg, color: sc.color }}>
                        {t(statusTranslationKey(task.status))}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ ...badgeStyle, background: pc.bg, color: pc.color }}>
                        {t(`taskPriority.${task.priority}`)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      {task.due_date ? (
                        <span style={{ color: isOverdue ? "#DC2626" : "#374151", fontWeight: isOverdue ? 600 : 400 }}>
                          {new Date(task.due_date).toLocaleDateString(getIntlLocale())}
                        </span>
                      ) : (
                        <span style={{ color: "#D1D5DB" }}>—</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {assignees.slice(0, 3).map((a, i) => {
                          const name = a.profile?.full_name || "?";
                          const isMain = a.role_in_task === "executor";
                          return (
                            <div
                              key={a.id}
                              title={isMain ? `${name} (${t("taskTable.main")})` : name}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 600,
                                border: isMain ? "2px solid #F59E0B" : "none",
                                boxSizing: "border-box",
                              }}
                            >
                              {getInitials(name)}
                            </div>
                          );
                        })}
                        {assignees.length > 3 && (
                          <div style={{
                            width: 28, height: 28, borderRadius: "50%",
                            background: "#E5E7EB", color: "#6B7280",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 11, fontWeight: 600,
                          }}>
                            +{assignees.length - 3}
                          </div>
                        )}
                        {assignees.length === 0 && <span style={{ color: "#D1D5DB" }}>—</span>}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: "#6B7280", whiteSpace: "nowrap" }}>
                      {new Date(task.created_at).toLocaleDateString(getIntlLocale())}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && profile && org && (
        <CreateTaskModal
          profile={profile}
          org={org}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            loadTasks();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Create Task Modal
// ============================================================

const LANG_TABS: SupportedLang[] = ["ru", "uz", "en"];

function CreateTaskModal({
  profile,
  org,
  onClose,
  onCreated,
}: {
  profile: Profile;
  org: Organization;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Meta fields
  const [priority, setPriority] = useState("medium");
  const [dueDate, setDueDate] = useState("");
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [mainExecutor, setMainExecutor] = useState<string>("");
  const [orgProfiles, setOrgProfiles] = useState<{ id: string; full_name: string; role: string }[]>([]);
  const [basis, setBasis] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Multilingual fields
  const [sourceLang, setSourceLang] = useState<SupportedLang>("ru");
  const [langTab, setLangTab] = useState<SupportedLang>("ru");
  const [titleRu, setTitleRu] = useState("");
  const [titleUz, setTitleUz] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [descRu, setDescRu] = useState("");
  const [descUz, setDescUz] = useState("");
  const [descEn, setDescEn] = useState("");
  const [statusRu, setStatusRu] = useState<string>("original");
  const [statusUz, setStatusUz] = useState<string>("missing");
  const [statusEn, setStatusEn] = useState<string>("missing");
  const [translating, setTranslating] = useState(false);
  const [translationGenerated, setTranslationGenerated] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [sourceSnapshot, setSourceSnapshot] = useState({ title: "", desc: "" });

  // When source language changes, switch tab to match
  const handleSourceLangChange = (lang: SupportedLang) => {
    setSourceLang(lang);
    setLangTab(lang);
    setStatusRu(lang === "ru" ? "original" : "missing");
    setStatusUz(lang === "uz" ? "original" : "missing");
    setStatusEn(lang === "en" ? "original" : "missing");
    setTranslationGenerated(false);
  };

  const getTitle = (lang: SupportedLang) => lang === "ru" ? titleRu : lang === "uz" ? titleUz : titleEn;
  const setTitle = (lang: SupportedLang, v: string) => {
    if (lang === "ru") setTitleRu(v);
    else if (lang === "uz") setTitleUz(v);
    else setTitleEn(v);
    // Update translation status when user manually types in a non-source tab
    if (lang !== sourceLang) {
      const descVal = lang === "ru" ? descRu : lang === "uz" ? descUz : descEn;
      const newStatus = (v.trim() || descVal.trim()) ? "reviewed" : "missing";
      if (lang === "ru") setStatusRu(newStatus);
      else if (lang === "uz") setStatusUz(newStatus);
      else setStatusEn(newStatus);
    }
  };
  const getDesc = (lang: SupportedLang) => lang === "ru" ? descRu : lang === "uz" ? descUz : descEn;
  const setDesc = (lang: SupportedLang, v: string) => {
    if (lang === "ru") setDescRu(v);
    else if (lang === "uz") setDescUz(v);
    else setDescEn(v);
    // Update translation status when user manually types in a non-source tab
    if (lang !== sourceLang) {
      const titleVal = lang === "ru" ? titleRu : lang === "uz" ? titleUz : titleEn;
      const newStatus = (titleVal.trim() || v.trim()) ? "reviewed" : "missing";
      if (lang === "ru") setStatusRu(newStatus);
      else if (lang === "uz") setStatusUz(newStatus);
      else setStatusEn(newStatus);
    }
  };

  const sourceTitle = getTitle(sourceLang);
  const sourceDesc = getDesc(sourceLang);
  const isStale = translationGenerated && (sourceTitle !== sourceSnapshot.title || sourceDesc !== sourceSnapshot.desc);

  useEffect(() => {
    listOrgProfiles(org.id).then(setOrgProfiles);
  }, [org.id]);

  const toggleAssignee = (id: string) => {
    setSelectedAssignees((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        if (mainExecutor === id) setMainExecutor(next[0] || "");
        return next;
      }
      const next = [...prev, id];
      if (!mainExecutor) setMainExecutor(id);
      return next;
    });
  };

  const handleGenerateTranslations = async () => {
    if (!sourceTitle.trim()) return;
    setTranslating(true);
    setTranslationError("");
    try {
      const draft = await generateTaskTranslations(sourceLang, sourceTitle.trim(), sourceDesc.trim());
      setTitleRu(draft.title_ru);
      setTitleUz(draft.title_uz);
      setTitleEn(draft.title_en);
      setDescRu(draft.description_ru);
      setDescUz(draft.description_uz);
      setDescEn(draft.description_en);
      setStatusRu(draft.status_ru);
      setStatusUz(draft.status_uz);
      setStatusEn(draft.status_en);
      setTranslationGenerated(true);
      setSourceSnapshot({ title: sourceTitle.trim(), desc: sourceDesc.trim() });
    } catch (err) {
      console.error("[translate] error:", err);
      setTranslationError(err instanceof Error ? err.message : t("taskTable.translationError"));
    } finally {
      setTranslating(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sourceTitle.trim()) return;
    setSaving(true);
    setError("");

    // Safety net: if user typed content in non-source tab but status is still "missing", promote to "reviewed"
    const resolveStatus = (lang: SupportedLang, status: string) => {
      if (lang === sourceLang) return status;
      const titleVal = lang === "ru" ? titleRu : lang === "uz" ? titleUz : titleEn;
      const descVal = lang === "ru" ? descRu : lang === "uz" ? descUz : descEn;
      if (status === "missing" && (titleVal.trim() || descVal.trim())) return "reviewed";
      return status;
    };

    try {
      const task = await createTask({
        organization_id: org.id,
        created_by:      profile.id,
        title:           sourceTitle.trim(),
        description:     sourceDesc.trim() || undefined,
        basis:           basis.trim() || undefined,
        priority,
        due_date:        dueDate || undefined,
        source_language: sourceLang,
        title_ru:        titleRu || undefined,
        title_uz:        titleUz || undefined,
        title_en:        titleEn || undefined,
        description_ru:  descRu || undefined,
        description_uz:  descUz || undefined,
        description_en:  descEn || undefined,
        translation_status_ru: resolveStatus("ru", statusRu),
        translation_status_uz: resolveStatus("uz", statusUz),
        translation_status_en: resolveStatus("en", statusEn),
      });

      for (const pid of selectedAssignees) {
        const roleInTask = pid === mainExecutor ? "executor" : "co_executor";
        await addAssigneeToTask(task.id, pid, roleInTask);
      }

      navigate(`/tasks/${task.id}`);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("meeting.createError"));
    } finally {
      setSaving(false);
    }
  };

  const tabDot = (lang: SupportedLang) => {
    const st = lang === "ru" ? statusRu : lang === "uz" ? statusUz : statusEn;
    const hasTitle = !!getTitle(lang).trim();
    const color = hasTitle ? translationStatusColor(st as Parameters<typeof translationStatusColor>[0]) : "#D1D5DB";
    return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 5 }} />;
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>{t("taskTable.newTask")}</h2>
          <button onClick={onClose} style={closeBtnStyle}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Source language selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <label style={{ ...labelStyle, margin: 0, whiteSpace: "nowrap" }}>{t("taskTable.sourceLang")}</label>
            <select
              value={sourceLang}
              onChange={(e) => handleSourceLangChange(e.target.value as SupportedLang)}
              style={{ ...inputStyle, width: "auto", flex: 1 }}
            >
              <option value="ru">{t("langTabs.ru")}</option>
              <option value="uz">{t("langTabs.uz")}</option>
              <option value="en">{t("langTabs.en")}</option>
            </select>
          </div>

          {/* Language tabs */}
          <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #E5E7EB", marginBottom: 16 }}>
            {LANG_TABS.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLangTab(lang)}
                style={{
                  padding: "8px 18px",
                  background: "none",
                  border: "none",
                  borderBottom: langTab === lang ? "2px solid #3B82F6" : "2px solid transparent",
                  marginBottom: -2,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: langTab === lang ? 600 : 400,
                  color: langTab === lang ? "#3B82F6" : "#6B7280",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {tabDot(lang)}
                {t(`langTabs.${lang}`)}
                {lang === sourceLang && (
                  <span style={{ fontSize: 10, marginLeft: 5, background: "#DBEAFE", color: "#1E40AF", padding: "1px 5px", borderRadius: 4 }}>
                    src
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Title for active tab */}
          <label style={labelStyle}>
            {t(`taskTable.titleLabel`)} {langTab === sourceLang ? "*" : t("langTabs.optional")}
          </label>
          <input
            value={getTitle(langTab)}
            onChange={(e) => setTitle(langTab, e.target.value)}
            placeholder={t(`taskTable.titlePlaceholder${langTab.charAt(0).toUpperCase() + langTab.slice(1)}`, t("taskTable.titlePlaceholder"))}
            style={inputStyle}
            required={langTab === sourceLang}
          />

          {/* Description for active tab */}
          <label style={labelStyle}>{t("taskTable.descriptionLabel")}</label>
          <textarea
            value={getDesc(langTab)}
            onChange={(e) => setDesc(langTab, e.target.value)}
            placeholder={t("taskTable.descriptionPlaceholder")}
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
          />

          {/* Basis */}
          <label style={labelStyle}>{t("taskTable.basisLabel")}</label>
          <textarea
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            placeholder={t("taskTable.basisPlaceholder")}
            rows={2}
            style={{ ...inputStyle, resize: "vertical" }}
          />

          {/* Generate translations button */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              onClick={handleGenerateTranslations}
              disabled={translating || !sourceTitle.trim()}
              style={{
                padding: "7px 14px",
                background: "#F3F4F6",
                border: "1px solid #D1D5DB",
                borderRadius: 7,
                fontSize: 13,
                cursor: sourceTitle.trim() ? "pointer" : "default",
                color: "#374151",
              }}
            >
              {translating ? t("taskTable.generating") : t("taskTable.generateTranslations")}
            </button>
            {isStale && (
              <span style={{ fontSize: 12, color: "#D97706", background: "#FEF3C7", padding: "4px 10px", borderRadius: 6 }}>
                ⚠ {t("taskTable.translationStale")}
              </span>
            )}
            {!isStale && translationGenerated && (
              <span style={{ fontSize: 12, color: "#059669" }}>
                {translationStatusLabel("auto_translated")} {t("nsMeetings.translationStatus")}
              </span>
            )}
          </div>

          {/* Provider note / error */}
          {!translating && !translationError && (
            <div style={{ fontSize: 11, color: "#7C3AED", marginTop: 4 }}>
              {t("taskTable.translationProviderNote")}
            </div>
          )}
          {translationError && (
            <div style={{ fontSize: 12, color: "#DC2626", marginTop: 4, background: "#FEE2E2", padding: "6px 10px", borderRadius: 6 }}>
              ⚠ {translationError}
            </div>
          )}

          {/* Priority + Due date row */}
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t("taskTable.priorityLabel")}</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inputStyle}>
                <option value="low">{t("taskPriority.low")}</option>
                <option value="medium">{t("taskPriority.medium")}</option>
                <option value="high">{t("taskPriority.high")}</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t("taskTable.deadlineLabel")}</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Assignees */}
          <label style={labelStyle}>{t("taskTable.assigneesLabel")}</label>
          <div style={assigneeListStyle}>
            {orgProfiles.map((p) => (
              <label key={p.id} style={assigneeItemStyle}>
                <input
                  type="checkbox"
                  checked={selectedAssignees.includes(p.id)}
                  onChange={() => toggleAssignee(p.id)}
                  style={{ marginRight: 8 }}
                />
                <span>{p.full_name}</span>
                <span style={{ color: "#9CA3AF", fontSize: 12, marginLeft: 6 }}>
                  ({t(`roles.${p.role}`, p.role)})
                </span>
              </label>
            ))}
          </div>

          {/* Main executor selection */}
          {selectedAssignees.length > 0 && (
            <>
              <label style={labelStyle}>{t("taskTable.mainExecutorLabel")}</label>
              <select
                value={mainExecutor}
                onChange={(e) => setMainExecutor(e.target.value)}
                style={inputStyle}
              >
                {selectedAssignees.map((pid) => {
                  const p = orgProfiles.find((x) => x.id === pid);
                  return (
                    <option key={pid} value={pid}>
                      {p?.full_name || pid}
                    </option>
                  );
                })}
              </select>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                {t("taskTable.coExecutorNote")}
              </div>
            </>
          )}

          {error && <div style={{ color: "#DC2626", fontSize: 14, marginTop: 8 }}>{error}</div>}

          <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>{t("common.cancel")}</button>
            <button type="submit" disabled={saving || !sourceTitle.trim()} style={submitBtnStyle}>
              {saving ? t("common.creating") : t("common.create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const createBtnStyle: React.CSSProperties = {
  padding: "10px 20px",
  background: "#3B82F6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};

const filterBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  marginBottom: 24,
  flexWrap: "wrap",
};

const selectStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 14,
  background: "#fff",
  color: "#374151",
  cursor: "pointer",
};

const searchInputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 14,
  flex: 1,
  minWidth: 200,
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontWeight: 600,
  fontSize: 13,
  color: "#6B7280",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 12px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 10px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const emptyStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "60px 0",
  background: "#F9FAFB",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
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
  background: "#fff",
  borderRadius: 14,
  padding: "28px 32px",
  width: "100%",
  maxWidth: 560,
  maxHeight: "90vh",
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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  fontWeight: 500,
  color: "#374151",
  marginBottom: 6,
  marginTop: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
};

const assigneeListStyle: React.CSSProperties = {
  maxHeight: 180,
  overflowY: "auto",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  padding: 8,
};

const assigneeItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "6px 4px",
  cursor: "pointer",
  fontSize: 14,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "9px 20px",
  background: "#fff",
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  fontSize: 14,
  cursor: "pointer",
  color: "#374151",
};

const submitBtnStyle: React.CSSProperties = {
  padding: "9px 24px",
  background: "#3B82F6",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
};
