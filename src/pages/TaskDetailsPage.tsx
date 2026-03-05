import { useEffect, useState, useRef, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Открыто",
  in_progress: "В работе",
  done: "Выполнено",
  canceled: "Отменено",
  overdue: "Просрочено",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: "#DBEAFE", color: "#1E40AF" },
  in_progress: { bg: "#FEF3C7", color: "#92400E" },
  done: { bg: "#D1FAE5", color: "#065F46" },
  canceled: { bg: "#F3F4F6", color: "#6B7280" },
  overdue: { bg: "#FEE2E2", color: "#991B1B" },
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
};

const PRIORITY_COLORS: Record<string, { bg: string; color: string }> = {
  low: { bg: "#F3F4F6", color: "#6B7280" },
  medium: { bg: "#FEF3C7", color: "#92400E" },
  high: { bg: "#FEE2E2", color: "#991B1B" },
};

const ROLE_IN_TASK_LABELS: Record<string, string> = {
  executor: "Главный исполнитель",
  co_executor: "Со-исполнитель",
  controller: "Контролёр",
};

const MANAGE_ROLES = ["admin", "chairman"];
const AVATAR_COLORS = ["#7C3AED", "#059669", "#DC2626", "#2563EB", "#D97706", "#0891B2"];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0]?.toUpperCase() || "?";
}

export default function TaskDetailsPage({ profile, org }: Props) {
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
      setError(err instanceof Error ? err.message : "Ошибка смены статуса");
    }
  };

  const handleSaveEdit = async () => {
    if (!task) return;
    setSaving(true);
    try {
      await updateTask(task.id, {
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        priority: editPriority as BoardTask["priority"],
        due_date: editDueDate || null,
      });
      setTask({
        ...task,
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        priority: editPriority as BoardTask["priority"],
        due_date: editDueDate || null,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
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
      setError(err instanceof Error ? err.message : "Ошибка отправки");
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
      setError(err instanceof Error ? err.message : "Ошибка загрузки файла");
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
    if (!confirm("Удалить файл?")) return;
    try {
      await deleteAttachment(att);
      setAttachments((prev) => prev.filter((a) => a.id !== att.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления");
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
      setError(err instanceof Error ? err.message : "Ошибка изменения исполнителей");
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
      setError(err instanceof Error ? err.message : "Ошибка смены главного исполнителя");
    }
  };

  if (loading) return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>Загрузка...</div>;
  if (!task) return <div style={{ color: "#DC2626", padding: "40px 0" }}>Поручение не найдено</div>;

  const sc = STATUS_COLORS[task.status] || STATUS_COLORS.open;
  const pc = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
  const isOverdue = task.due_date && task.status !== "done" && task.status !== "canceled" && new Date(task.due_date) < new Date(new Date().toISOString().slice(0, 10));

  return (
    <div>
      {/* Back + Actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <button onClick={() => navigate("/tasks")} style={backBtnStyle}>
          &larr; Назад к поручениям
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          {task.status !== "done" && (
            <button onClick={() => handleStatusChange("done")} style={doneBtnStyle}>
              Выполнено
            </button>
          )}
          {canManage && !editing && (
            <button onClick={() => setEditing(true)} style={editBtnStyle}>
              Редактировать
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
        {editing ? (
          <>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={{ ...inputStyle, fontSize: 20, fontWeight: 600, marginBottom: 12 }} />
            <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={3} style={{ ...inputStyle, marginBottom: 12, resize: "vertical" }} placeholder="Описание..." />
            <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={metaLabelStyle}>Приоритет</label>
                <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={inputStyle}>
                  <option value="low">Низкий</option>
                  <option value="medium">Средний</option>
                  <option value="high">Высокий</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={metaLabelStyle}>Срок</label>
                <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditing(false)} style={cancelBtnStyle}>Отмена</button>
              <button onClick={handleSaveEdit} disabled={saving} style={saveBtnStyle}>
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, marginBottom: 8 }}>{task.title}</h1>
            {task.description && (
              <p style={{ color: "#4B5563", fontSize: 15, margin: "0 0 16px", lineHeight: 1.6 }}>{task.description}</p>
            )}

            {/* Meta row */}
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
              {/* Status */}
              <div>
                <span style={metaLabelStyle}>Статус</span>
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
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <span style={metaLabelStyle}>Приоритет</span>
                <span style={{ ...badgeStyle, background: pc.bg, color: pc.color }}>{PRIORITY_LABELS[task.priority]}</span>
              </div>

              {/* Due date */}
              <div>
                <span style={metaLabelStyle}>Срок</span>
                <span style={{ fontWeight: isOverdue ? 600 : 400, color: isOverdue ? "#DC2626" : "#374151", fontSize: 14 }}>
                  {task.due_date ? new Date(task.due_date).toLocaleDateString("ru-RU") : "—"}
                </span>
              </div>

              {/* Creator */}
              <div>
                <span style={metaLabelStyle}>Создал</span>
                <span style={{ fontSize: 14, color: "#374151" }}>
                  {(task.creator as { full_name: string } | undefined)?.full_name || "—"}
                </span>
              </div>

              {/* Created at */}
              <div>
                <span style={metaLabelStyle}>Дата создания</span>
                <span style={{ fontSize: 14, color: "#6B7280" }}>
                  {new Date(task.created_at).toLocaleDateString("ru-RU")}
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Assignees */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>Исполнители</h2>
          {canManageAssignees && (
            <button onClick={openAssigneesModal} style={editBtnStyle}>Изменить</button>
          )}
        </div>
        {(!task.assignees || task.assignees.length === 0) ? (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>Исполнители не назначены</p>
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
                            Главный
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#9CA3AF" }}>{ROLE_IN_TASK_LABELS[a.role_in_task] || a.role_in_task}</div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Comments */}
      <div style={cardStyle}>
        <h2 style={sectionTitleStyle}>Комментарии ({comments.length})</h2>

        {comments.length === 0 && (
          <p style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 16 }}>Нет комментариев</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
          {comments.map((c) => (
            <div key={c.id} style={commentStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontWeight: 500, fontSize: 14, color: "#111827" }}>
                  {(c.author as { full_name: string } | undefined)?.full_name || "—"}
                </span>
                <span style={{ fontSize: 12, color: "#9CA3AF" }}>
                  {new Date(c.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
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
              placeholder="Написать комментарий..."
              rows={2}
              style={{ ...inputStyle, flex: 1, resize: "vertical" }}
            />
            <button type="submit" disabled={sendingComment || !commentText.trim()} style={{ ...saveBtnStyle, alignSelf: "flex-end" }}>
              {sendingComment ? "..." : "Отправить"}
            </button>
          </form>
        )}
      </div>

      {/* Attachments */}
      <div style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>Файлы ({attachments.length})</h2>
          {profile && (
            <>
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={editBtnStyle}>
                {uploading ? "Загрузка..." : "Загрузить файл"}
              </button>
              <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleUpload} />
            </>
          )}
        </div>

        {attachments.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 14 }}>Нет прикреплённых файлов</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                <th style={thStyle}>Файл</th>
                <th style={thStyle}>Размер</th>
                <th style={thStyle}>Загрузил</th>
                <th style={thStyle}>Дата</th>
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
                    {new Date(a.created_at).toLocaleDateString("ru-RU")}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => handleDownload(a)} style={smallBtnStyle}>Скачать</button>
                      {canDeleteAttachment(a) && (
                        <button onClick={() => handleDeleteAttachment(a)} style={{ ...smallBtnStyle, color: "#DC2626", borderColor: "#FCA5A5" }}>
                          Удалить
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
              <h3 style={{ margin: 0, fontSize: 18 }}>Управление исполнителями</h3>
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
                      <span style={{ color: "#9CA3AF", fontSize: 12, marginLeft: 4 }}>({ROLE_SHORT[p.role] || p.role})</span>
                    </span>
                    {isAssigned && !isMain && (
                      <button
                        onClick={() => handleSetMainExecutor(p.id)}
                        style={{ ...smallBtnStyle, fontSize: 11, color: "#D97706", borderColor: "#FCD34D" }}
                      >
                        Назначить главным
                      </button>
                    )}
                    {isMain && (
                      <span style={{ fontSize: 11, background: "#FEF3C7", color: "#92400E", padding: "2px 8px", borderRadius: 8 }}>
                        Главный
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

const ROLE_SHORT: Record<string, string> = {
  chairman: "Председатель",
  board_member: "Член НС",
  executive: "Правление",
  admin: "Админ",
  auditor: "Аудитор",
  department_head: "Рук. подр.",
};

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
