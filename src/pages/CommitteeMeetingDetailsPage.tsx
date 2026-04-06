import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchCommitteeById,
  fetchCommitteeMembers,
  fetchCommitteeMeetingById,
  updateCommitteeMeeting,
  deleteCommitteeMeeting,
  fetchCommitteeAgendaItems,
  createCommitteeAgendaItem,
  updateCommitteeAgendaItem,
  deleteCommitteeAgendaItem,
  fetchCommitteeVotings,
  createCommitteeVoting,
  closeCommitteeVoting,
  castCommitteeVote,
  fetchCommitteeDocuments,
  uploadCommitteeDocument,
  deleteCommitteeDocument,
  getCommitteeDocumentUrl,
  committeeTypeColor,
  committeeTypeIcon,
  tallyCommitteeVotes,
  type Committee,
  type CommitteeMeeting,
  type CommitteeAgendaItem,
  type CommitteeVoting,
  type CommitteeDocument,
  type CommitteeMember,
} from "../lib/committees";
import {
  fetchCommitteeCommentsByAgendaItems,
  addCommitteeComment,
  editCommitteeComment,
  softDeleteCommitteeComment,
  type CommitteeAgendaComment,
} from "../lib/committeeComments";
import { getLocalizedField } from "../lib/i18nHelpers";
import { formatFileSize, getFileTypeLabel } from "../lib/nsMeetings";
import { downloadFileByUrl } from "../lib/format";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function CommitteeMeetingDetailsPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const { id: committeeId, meetingId } = useParams<{ id: string; meetingId: string }>();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin" || profile?.role === "corp_secretary";

  const [committee, setCommittee] = useState<Committee | null>(null);
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [meeting, setMeeting] = useState<CommitteeMeeting | null>(null);
  const [agendaItems, setAgendaItems] = useState<CommitteeAgendaItem[]>([]);
  const [votingsMap, setVotingsMap] = useState<Record<string, CommitteeVoting[]>>({});
  const [documents, setDocuments] = useState<CommitteeDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit meeting
  const [editForm, setEditForm] = useState({ title: "", title_en: "", title_uz: "", start_at: "", location: "", notes: "", status: "scheduled" as "scheduled" | "completed" });
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);

  // Agenda
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [agendaForm, setAgendaForm] = useState({ title: "", title_en: "", title_uz: "", presenter: "" });
  const [editingAgendaId, setEditingAgendaId] = useState<string | null>(null);
  const [editAgendaForm, setEditAgendaForm] = useState({ title: "", title_en: "", title_uz: "", presenter: "" });

  // Comments / Discussion
  const [commentsMap, setCommentsMap] = useState<Record<string, CommitteeAgendaComment[]>>({});
  const [discussionAgendaId, setDiscussionAgendaId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replyTo, setReplyTo] = useState<Record<string, string | null>>({});
  const [commentSending, setCommentSending] = useState<Record<string, boolean>>({});
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  // File upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!committeeId || !meetingId) return;
    loadAll();
  }, [committeeId, meetingId]);

  const loadAll = async () => {
    setLoading(true);
    const [c, mems, m] = await Promise.all([
      fetchCommitteeById(committeeId!),
      fetchCommitteeMembers(committeeId!),
      fetchCommitteeMeetingById(meetingId!),
    ]);
    setCommittee(c);
    setMembers(mems);
    setMeeting(m);
    if (m) await loadAgenda(m.id);
    setLoading(false);
  };

  const loadAgenda = async (mId: string) => {
    const [items, docs] = await Promise.all([
      fetchCommitteeAgendaItems(mId),
      fetchCommitteeDocuments(mId),
    ]);
    setAgendaItems(items);
    setDocuments(docs);
    const vMap: Record<string, CommitteeVoting[]> = {};
    await Promise.all(items.map(async (item) => { vMap[item.id] = await fetchCommitteeVotings(item.id); }));
    setVotingsMap(vMap);
    if (items.length > 0) {
      const cMap = await fetchCommitteeCommentsByAgendaItems(items.map((i) => i.id));
      setCommentsMap(cMap);
    }
  };

  const handleEditSave = async () => {
    if (!meeting) return;
    setSaving(true);
    await updateCommitteeMeeting(meeting.id, {
      title: editForm.title.trim(),
      title_en: editForm.title_en.trim() || undefined,
      title_uz: editForm.title_uz.trim() || undefined,
      start_at: editForm.start_at,
      location: editForm.location.trim() || undefined,
      notes: editForm.notes.trim() || undefined,
      status: editForm.status,
    });
    const updated = await fetchCommitteeMeetingById(meeting.id);
    setMeeting(updated);
    setShowEdit(false);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!meeting || !window.confirm(t("committees.confirmDeleteMeeting"))) return;
    await deleteCommitteeMeeting(meeting.id);
    navigate(`/committees/${committeeId}`);
  };

  const handleAddAgendaItem = async () => {
    if (!agendaForm.title.trim() || !meeting || !org || !committeeId) return;
    await createCommitteeAgendaItem({
      meeting_id: meeting.id,
      committee_id: committeeId,
      org_id: org.id,
      title: agendaForm.title.trim(),
      title_en: agendaForm.title_en.trim() || undefined,
      title_uz: agendaForm.title_uz.trim() || undefined,
      presenter: agendaForm.presenter.trim() || undefined,
      order_index: agendaItems.length,
    });
    setAgendaForm({ title: "", title_en: "", title_uz: "", presenter: "" });
    setShowAgendaForm(false);
    await loadAgenda(meeting.id);
  };

  const handleDeleteAgendaItem = async (itemId: string) => {
    if (!window.confirm(t("nsMeetings.confirmDeleteAgenda"))) return;
    await deleteCommitteeAgendaItem(itemId);
    if (meeting) await loadAgenda(meeting.id);
  };

  const handleSaveAgendaItem = async (itemId: string) => {
    await updateCommitteeAgendaItem(itemId, {
      title: editAgendaForm.title.trim(),
      title_en: editAgendaForm.title_en.trim() || undefined,
      title_uz: editAgendaForm.title_uz.trim() || undefined,
      presenter: editAgendaForm.presenter.trim() || undefined,
    });
    setEditingAgendaId(null);
    if (meeting) await loadAgenda(meeting.id);
  };

  const handleUploadDoc = async (file: File) => {
    if (!org || !profile || !meeting) return;
    try {
      await uploadCommitteeDocument(file, org.id, profile.id, meeting.id);
      await loadAgenda(meeting.id);
    } catch (e) { console.error("Upload error:", e); }
  };

  const handleDeleteDoc = async (doc: CommitteeDocument) => {
    await deleteCommitteeDocument(doc);
    if (meeting) await loadAgenda(meeting.id);
  };

  const handleDownloadDoc = async (doc: CommitteeDocument) => {
    const url = await getCommitteeDocumentUrl(doc.storage_path);
    if (url) await downloadFileByUrl(url, doc.file_name);
  };

  const handleCreateVoting = async (agendaItemId: string) => {
    if (!meeting || !org || !profile || !committeeId) return;
    const agendaItem = agendaItems.find((a) => a.id === agendaItemId);
    if (!agendaItem) return;
    await createCommitteeVoting(agendaItemId, committeeId, org.id, agendaItem.title, profile.id, members.length || 5);
    await loadAgenda(meeting.id);
  };

  const handleCloseVoting = async (votingId: string) => {
    await closeCommitteeVoting(votingId);
    if (meeting) await loadAgenda(meeting.id);
  };

  const handleVote = async (votingId: string, choice: "for" | "against" | "abstain") => {
    if (!org || !profile) return;
    await castCommitteeVote(votingId, org.id, profile.id, choice);
    if (meeting) await loadAgenda(meeting.id);
  };

  // Comments
  const handleAddComment = async (agendaItemId: string, parentId?: string | null) => {
    if (!meeting || !org || !profile) return;
    const text = parentId
      ? (replyText[agendaItemId] || "").trim()
      : (commentText[agendaItemId] || "").trim();
    if (!text) return;
    setCommentSending((p) => ({ ...p, [agendaItemId]: true }));
    const result = await addCommitteeComment({
      meeting_id: meeting.id,
      agenda_item_id: agendaItemId,
      org_id: org.id,
      user_id: profile.id,
      user_name: profile.full_name || profile.email,
      user_role: profile.role,
      parent_comment_id: parentId || null,
      content: text,
    });
    setCommentSending((p) => ({ ...p, [agendaItemId]: false }));
    if (result) {
      setCommentsMap((prev) => ({
        ...prev,
        [agendaItemId]: [...(prev[agendaItemId] || []), result],
      }));
      if (parentId) {
        setReplyText((p) => ({ ...p, [agendaItemId]: "" }));
        setReplyTo((p) => ({ ...p, [agendaItemId]: null }));
      } else {
        setCommentText((p) => ({ ...p, [agendaItemId]: "" }));
      }
    }
  };

  const handleDeleteComment = async (agendaItemId: string, commentId: string) => {
    const ok = await softDeleteCommitteeComment(commentId);
    if (ok) {
      setCommentsMap((prev) => ({
        ...prev,
        [agendaItemId]: (prev[agendaItemId] || []).map((c) =>
          c.id === commentId ? { ...c, is_deleted: true, content: "" } : c
        ),
      }));
    }
  };

  const handleEditComment = async (agendaItemId: string, commentId: string) => {
    const text = editingCommentText.trim();
    if (!text) return;
    const result = await editCommitteeComment(commentId, text);
    if (result) {
      setCommentsMap((prev) => ({
        ...prev,
        [agendaItemId]: (prev[agendaItemId] || []).map((c) =>
          c.id === commentId ? { ...c, content: result.content, updated_at: result.updated_at } : c
        ),
      }));
      setEditingCommentId(null);
      setEditingCommentText("");
    }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#9CA3AF" }}>
      {t("common.loading")}
    </div>
  );
  if (!meeting || !committee) return <div style={{ color: "#DC2626", padding: 32 }}>{t("common.notFound")}</div>;

  const color = committeeTypeColor(committee.type);
  const icon = committeeTypeIcon(committee.type);
  const committeeName = getLocalizedField(committee as unknown as Record<string, unknown>, "name");
  const meetingTitle = getLocalizedField(meeting as unknown as Record<string, unknown>, "title");
  const isMember = members.some((m) => m.profile_id === profile?.id);
  const canParticipate = isMember || isAdmin;
  const isCompleted = meeting.status === "completed";

  const dateStr = new Date(meeting.start_at).toLocaleDateString(getIntlLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = new Date(meeting.start_at).toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" });

  // ── Full-page Discussion View ──
  if (discussionAgendaId) {
    const dItem = agendaItems.find((a) => a.id === discussionAgendaId);
    const dTitle = dItem ? getLocalizedField(dItem as unknown as Record<string, unknown>, "title") || dItem.title : "";
    const allComments = commentsMap[discussionAgendaId] || [];
    const rootComments = allComments.filter((c) => !c.parent_comment_id);
    const repliesOf = (parentId: string) => allComments.filter((c) => c.parent_comment_id === parentId);
    const commentCount = allComments.filter((c) => !c.is_deleted).length;

    const avatarInitials = (name: string) => {
      const parts = name.trim().split(/\s+/);
      return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name[0]?.toUpperCase() || "?";
    };

    const renderComment = (comment: CommitteeAgendaComment, isReply = false) => {
      const isOwn = comment.user_id === profile?.id;
      const isEditing = editingCommentId === comment.id;
      const replies = !isReply ? repliesOf(comment.id) : [];

      return (
        <div key={comment.id} style={{ marginBottom: isReply ? 8 : 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{
              width: isReply ? 28 : 34, height: isReply ? 28 : 34, borderRadius: "50%", flexShrink: 0,
              background: color + "20", color, display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: isReply ? 11 : 13, fontWeight: 700,
            }}>
              {avatarInitials(comment.user_name || "?")}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: 13, color: "#111827" }}>{comment.user_name}</span>
                <span style={{ fontSize: 11, color: "#9CA3AF" }}>
                  {new Date(comment.created_at).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "short" })}
                  {" "}
                  {new Date(comment.created_at).toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" })}
                </span>
                {comment.updated_at !== comment.created_at && (
                  <span style={{ fontSize: 11, color: "#D1D5DB" }}>{t("nsMeetings.edited")}</span>
                )}
              </div>

              {comment.is_deleted ? (
                <div style={{ fontSize: 13, color: "#D1D5DB", fontStyle: "italic" }}>{t("nsMeetings.deletedComment")}</div>
              ) : isEditing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <textarea
                    value={editingCommentText}
                    onChange={(e) => setEditingCommentText(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical", fontSize: 13 }}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => handleEditComment(discussionAgendaId, comment.id)} style={{ ...primaryBtnStyle(color), padding: "5px 14px", fontSize: 12 }}>{t("common.save")}</button>
                    <button onClick={() => setEditingCommentId(null)} style={{ ...cancelBtnStyle, padding: "5px 12px", fontSize: 12 }}>{t("common.cancel")}</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {comment.content}
                </div>
              )}

              {!comment.is_deleted && !isEditing && (
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {!isReply && !isCompleted && (
                    <button
                      onClick={() => setReplyTo((p) => ({ ...p, [discussionAgendaId]: p[discussionAgendaId] === comment.id ? null : comment.id }))}
                      style={ghostBtnStyle}
                    >
                      ↩ {t("nsMeetings.reply")}
                    </button>
                  )}
                  {isOwn && !isCompleted && (
                    <button
                      onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.content); }}
                      style={ghostBtnStyle}
                    >
                      {t("common.edit")}
                    </button>
                  )}
                  {(isOwn || isAdmin) && (
                    <button onClick={() => handleDeleteComment(discussionAgendaId, comment.id)} style={{ ...ghostBtnStyle, color: "#DC2626" }}>
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              )}

              {/* Reply box */}
              {!isReply && replyTo[discussionAgendaId] === comment.id && !isCompleted && (
                <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                  <textarea
                    value={replyText[discussionAgendaId] || ""}
                    onChange={(e) => setReplyText((p) => ({ ...p, [discussionAgendaId]: e.target.value }))}
                    placeholder={t("nsMeetings.replyPlaceholder")}
                    rows={2}
                    style={{ ...inputStyle, flex: 1, fontSize: 13, resize: "none" }}
                    autoFocus
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button
                      onClick={() => handleAddComment(discussionAgendaId, comment.id)}
                      disabled={commentSending[discussionAgendaId] || !(replyText[discussionAgendaId] || "").trim()}
                      style={{
                        padding: "6px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8,
                        border: "none", cursor: "pointer",
                        background: (replyText[discussionAgendaId] || "").trim() ? color : "#D1D5DB",
                        color: "#fff",
                      }}
                    >
                      {t("nsMeetings.send")}
                    </button>
                    <button onClick={() => setReplyTo((p) => ({ ...p, [discussionAgendaId]: null }))} style={{ ...cancelBtnStyle, padding: "5px 10px", fontSize: 12 }}>
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* Replies */}
              {replies.length > 0 && (
                <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: `2px solid ${color}25` }}>
                  {replies.map((r) => renderComment(r, true))}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - var(--header-height, 64px))" }}>
        {/* Header */}
        <div style={{ background: "#fff", borderBottom: "1px solid #E5E7EB", padding: "16px 32px", flexShrink: 0 }}>
          <button onClick={() => setDiscussionAgendaId(null)} style={{ ...smallBtnStyle, marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
            ← {meetingTitle}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#111827" }}>💬 {t("nsMeetings.discussion")}</div>
            {commentCount > 0 && (
              <span style={{ background: "#EFF6FF", color: "#2563EB", fontSize: 13, fontWeight: 600, borderRadius: 12, padding: "2px 10px" }}>
                {commentCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>{dTitle}</div>
          {isCompleted && (
            <div style={{ marginTop: 8, padding: "6px 14px", background: "#FEF3C7", borderRadius: 8, fontSize: 13, color: "#92400E", display: "inline-block" }}>
              {t("nsMeetings.discussionClosed")}
            </div>
          )}
        </div>

        {/* Comments list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
          {rootComments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9CA3AF" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: "#6B7280" }}>{t("nsMeetings.noComments")}</div>
              {canParticipate && !isCompleted && (
                <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>{t("nsMeetings.addComment")}</div>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: 800 }}>
              {rootComments.map((c) => renderComment(c))}
            </div>
          )}
        </div>

        {/* New comment input */}
        {canParticipate && !isCompleted && (
          <div style={{ background: "#fff", borderTop: "1px solid #E5E7EB", padding: "16px 32px", flexShrink: 0 }}>
            <div style={{ maxWidth: 800, display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                value={commentText[discussionAgendaId] || ""}
                onChange={(e) => setCommentText((p) => ({ ...p, [discussionAgendaId]: e.target.value }))}
                placeholder={t("nsMeetings.commentPlaceholder")}
                rows={2}
                style={{ ...inputStyle, flex: 1, resize: "none", fontSize: 14 }}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(discussionAgendaId); } }}
              />
              <button
                onClick={() => handleAddComment(discussionAgendaId)}
                disabled={commentSending[discussionAgendaId] || !(commentText[discussionAgendaId] || "").trim()}
                style={{
                  padding: "10px 20px", fontSize: 14, fontWeight: 600, borderRadius: 8,
                  border: "none", cursor: "pointer", flexShrink: 0,
                  background: (commentText[discussionAgendaId] || "").trim() ? color : "#D1D5DB",
                  color: "#fff",
                }}
              >
                {commentSending[discussionAgendaId] ? "..." : t("nsMeetings.send")}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Main page ──
  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <button
        onClick={() => navigate(`/committees/${committeeId}`)}
        style={{ background: "none", border: "none", color: "#6B7280", cursor: "pointer", fontSize: 14, marginBottom: 20, padding: 0 }}
      >
        ← {committeeName}
      </button>

      {/* Main card */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", marginBottom: 24 }}>
        <div style={{ height: 6, background: color }} />
        <div style={{ padding: "24px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{icon}</span>
                <span style={{ fontSize: 12, color, fontWeight: 600 }}>{committeeName}</span>
              </div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>{meetingTitle}</h1>
              <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, color: "#6B7280" }}>
                <span>📅 {dateStr}</span>
                <span>🕐 {timeStr}</span>
                {meeting.location && <span>📍 {meeting.location}</span>}
              </div>
              <div style={{ marginTop: 8 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 10,
                  background: meeting.status === "scheduled" ? "#DBEAFE" : "#F3F4F6",
                  color: meeting.status === "scheduled" ? "#1E40AF" : "#6B7280",
                }}>
                  {meeting.status === "scheduled" ? t("nsMeetings.statusScheduled") : t("nsMeetings.statusCompleted")}
                </span>
              </div>
            </div>
            {isAdmin && (
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button
                  onClick={() => {
                    setEditForm({ title: meeting.title, title_en: meeting.title_en || "", title_uz: meeting.title_uz || "", start_at: meeting.start_at.slice(0, 16), location: meeting.location || "", notes: meeting.notes || "", status: meeting.status });
                    setShowEdit(true);
                  }}
                  style={smallBtnStyle}
                >{t("common.edit")}</button>
                <button onClick={handleDelete} style={{ ...smallBtnStyle, color: "#DC2626", borderColor: "#FECACA" }}>{t("common.delete")}</button>
              </div>
            )}
          </div>

          {meeting.notes && (
            <div style={{ marginTop: 12, padding: "10px 14px", background: "#F9FAFB", borderRadius: 8, fontSize: 13, color: "#6B7280", lineHeight: 1.5 }}>
              {meeting.notes}
            </div>
          )}

          {/* Edit form */}
          {showEdit && (
            <div style={{ marginTop: 16, padding: "16px", background: "#F9FAFB", borderRadius: 10, display: "flex", flexDirection: "column", gap: 10 }}>
              <LangInputs
                label={t("committees.meetingTitle")}
                values={{ ru: editForm.title, en: editForm.title_en, uz: editForm.title_uz }}
                onChange={(lang, val) => setEditForm((p) => lang === "ru" ? { ...p, title: val } : lang === "en" ? { ...p, title_en: val } : { ...p, title_uz: val })}
              />
              <input type="datetime-local" value={editForm.start_at} onChange={(e) => setEditForm((p) => ({ ...p, start_at: e.target.value }))} style={inputStyle} />
              <input value={editForm.location} onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))} style={inputStyle} placeholder={t("committees.meetingLocation")} />
              <textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} rows={2} placeholder={t("committees.meetingNotes")} />
              <select value={editForm.status} onChange={(e) => setEditForm((p) => ({ ...p, status: e.target.value as "scheduled" | "completed" }))} style={inputStyle}>
                <option value="scheduled">{t("nsMeetings.statusScheduled")}</option>
                <option value="completed">{t("nsMeetings.statusCompleted")}</option>
              </select>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={handleEditSave} disabled={saving} style={primaryBtnStyle(color)}>{saving ? t("common.saving") : t("common.save")}</button>
                <button onClick={() => setShowEdit(false)} style={cancelBtnStyle}>{t("common.cancel")}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Documents */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>📎 {t("committees.documents")}</span>
          {canParticipate && (
            <>
              <button onClick={() => fileInputRef.current?.click()} style={{ ...smallBtnStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
                + {t("committees.uploadDoc")}
              </button>
              <input ref={fileInputRef} type="file" style={{ display: "none" }} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadDoc(f); e.target.value = ""; }} />
            </>
          )}
        </div>
        {documents.length === 0 ? (
          <p style={{ color: "#D1D5DB", fontSize: 13, margin: 0 }}>{t("committees.noDocuments")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {documents.map((doc) => {
              const ftLabel = getFileTypeLabel(doc.mime_type);
              const ftColor = ftLabel === "PDF" ? "#DC2626" : ftLabel === "Word" ? "#2563EB" : ftLabel === "Excel" ? "#059669" : "#6B7280";
              return (
                <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#FAFAFA", borderRadius: 10, border: "1px solid #F3F4F6" }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: ftColor + "18", color: ftColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                    {ftLabel}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.file_name}</div>
                    <div style={{ fontSize: 11, color: "#9CA3AF" }}>{formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString(getIntlLocale())}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => handleDownloadDoc(doc)} style={downloadBtnStyle}>↓ {t("nsMeetings.download")}</button>
                    {canParticipate && <button onClick={() => handleDeleteDoc(doc)} style={deleteBtnStyle}>✕</button>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agenda */}
      <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 14, padding: "20px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>📋 {t("nsMeetings.agenda")}</span>
          {isAdmin && (
            <button onClick={() => setShowAgendaForm(!showAgendaForm)} style={smallBtnStyle}>
              + {t("nsMeetings.addAgendaItem")}
            </button>
          )}
        </div>

        {/* Add agenda item form */}
        {showAgendaForm && isAdmin && (
          <div style={{ marginBottom: 16, padding: "14px", background: "#F9FAFB", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <LangInputs
              label={t("nsMeetings.agendaTitle")}
              values={{ ru: agendaForm.title, en: agendaForm.title_en, uz: agendaForm.title_uz }}
              onChange={(lang, val) => setAgendaForm((p) => lang === "ru" ? { ...p, title: val } : lang === "en" ? { ...p, title_en: val } : { ...p, title_uz: val })}
            />
            <input value={agendaForm.presenter} onChange={(e) => setAgendaForm((p) => ({ ...p, presenter: e.target.value }))} style={inputStyle} placeholder={t("nsMeetings.agendaPresenter")} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleAddAgendaItem} style={primaryBtnStyle(color)}>{t("common.add")}</button>
              <button onClick={() => setShowAgendaForm(false)} style={cancelBtnStyle}>{t("common.cancel")}</button>
            </div>
          </div>
        )}

        {agendaItems.length === 0 ? (
          <p style={{ color: "#D1D5DB", fontSize: 13, margin: 0 }}>{t("nsMeetings.noAgendaItems")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {agendaItems.map((item, idx) => {
              const votings = votingsMap[item.id] || [];
              const itemTitle = getLocalizedField(item as unknown as Record<string, unknown>, "title");
              const isEditing = editingAgendaId === item.id;
              const commentCount = (commentsMap[item.id] || []).filter((c) => !c.is_deleted).length;

              return (
                <div key={item.id} style={{ border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                  {/* Item header */}
                  <div style={{ padding: "14px 16px", background: "#F9FAFB", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      {isEditing ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <LangInputs
                            label={t("nsMeetings.agendaTitle")}
                            values={{ ru: editAgendaForm.title, en: editAgendaForm.title_en, uz: editAgendaForm.title_uz }}
                            onChange={(lang, val) => setEditAgendaForm((p) => lang === "ru" ? { ...p, title: val } : lang === "en" ? { ...p, title_en: val } : { ...p, title_uz: val })}
                          />
                          <input value={editAgendaForm.presenter} onChange={(e) => setEditAgendaForm((p) => ({ ...p, presenter: e.target.value }))} style={inputStyle} placeholder={t("nsMeetings.agendaPresenter")} />
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => handleSaveAgendaItem(item.id)} style={{ ...primaryBtnStyle(color), padding: "5px 14px", fontSize: 12 }}>{t("common.save")}</button>
                            <button onClick={() => setEditingAgendaId(null)} style={{ ...cancelBtnStyle, padding: "5px 12px", fontSize: 12 }}>{t("common.cancel")}</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{idx + 1}. {itemTitle}</div>
                          {item.presenter && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{t("nsMeetings.presenter")}: {item.presenter}</div>}
                        </>
                      )}
                    </div>
                    {isAdmin && !isEditing && (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={() => { setEditingAgendaId(item.id); setEditAgendaForm({ title: item.title, title_en: item.title_en || "", title_uz: item.title_uz || "", presenter: item.presenter || "" }); }} style={{ ...smallBtnStyle, fontSize: 12, padding: "4px 10px" }}>{t("common.edit")}</button>
                        <button onClick={() => handleDeleteAgendaItem(item.id)} style={{ ...smallBtnStyle, fontSize: 12, padding: "4px 8px", color: "#DC2626", borderColor: "#FECACA" }}>✕</button>
                      </div>
                    )}
                  </div>

                  {/* Voting + Discussion */}
                  <div style={{ padding: "12px 16px" }}>
                    {/* Voting */}
                    {votings.length === 0 ? (
                      isAdmin ? (
                        <button onClick={() => handleCreateVoting(item.id)} style={{ fontSize: 12, color, background: "none", border: `1px solid ${color}40`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontWeight: 600 }}>
                          🗳 {t("nsVoting.activate")}
                        </button>
                      ) : <span style={{ fontSize: 12, color: "#D1D5DB" }}>{t("committees.noVoting")}</span>
                    ) : votings.map((voting) => {
                      const votes = voting.votes || [];
                      const tally = tallyCommitteeVotes(votes);
                      const myVote = votes.find((v) => v.voter_id === profile?.id);
                      const isOpen = voting.status === "open";
                      const pct = voting.total_members > 0 ? Math.round((votes.length / voting.total_members) * 100) : 0;

                      return (
                        <div key={voting.id} style={{ background: isOpen ? "#FFFBEB" : "#F9FAFB", border: `1px solid ${isOpen ? "#FDE68A" : "#E5E7EB"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>🗳 {voting.title}</span>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: isOpen ? "#FEF3C7" : "#F3F4F6", color: isOpen ? "#92400E" : "#6B7280" }}>
                                {isOpen ? t("nsVoting.statusOpen") : t("nsVoting.statusClosed")}
                              </span>
                              {isAdmin && isOpen && (
                                <button onClick={() => handleCloseVoting(voting.id)} style={{ fontSize: 11, color: "#6B7280", background: "none", border: "1px solid #D1D5DB", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>
                                  {t("nsVoting.close")}
                                </button>
                              )}
                            </div>
                          </div>
                          <div style={{ height: 4, background: "#E5E7EB", borderRadius: 4, marginBottom: 6, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>
                            <span>✅ {tally.forVotes} · ❌ {tally.againstVotes} · 🤐 {tally.abstainVotes}</span>
                            <span>{votes.length}/{voting.total_members}</span>
                          </div>
                          {isOpen && canParticipate && (
                            <div style={{ display: "flex", gap: 6 }}>
                              {(["for", "against", "abstain"] as const).map((choice) => (
                                <button key={choice} onClick={() => handleVote(voting.id, choice)} style={{
                                  fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 7, cursor: "pointer", border: "1.5px solid",
                                  background: myVote?.choice === choice ? (choice === "for" ? "#059669" : choice === "against" ? "#DC2626" : "#6B7280") : "#fff",
                                  color: myVote?.choice === choice ? "#fff" : (choice === "for" ? "#059669" : choice === "against" ? "#DC2626" : "#6B7280"),
                                  borderColor: choice === "for" ? "#059669" : choice === "against" ? "#DC2626" : "#9CA3AF",
                                }}>
                                  {choice === "for" ? t("nsVoting.voteFor") : choice === "against" ? t("nsVoting.voteAgainst") : t("nsVoting.voteAbstain")}
                                </button>
                              ))}
                            </div>
                          )}
                          {!isOpen && myVote && (
                            <div style={{ fontSize: 12, color: "#6B7280" }}>
                              {t("nsVoting.yourVote")}: <b>{myVote.choice === "for" ? t("nsVoting.voteFor") : myVote.choice === "against" ? t("nsVoting.voteAgainst") : t("nsVoting.voteAbstain")}</b>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Discussion button */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #F3F4F6" }}>
                      <button
                        onClick={() => setDiscussionAgendaId(item.id)}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 8,
                          padding: "7px 16px", fontSize: 13, fontWeight: 500,
                          background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8,
                          color: "#374151", cursor: "pointer",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.borderColor = "#D1D5DB"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#E5E7EB"; }}
                      >
                        💬 {t("nsMeetings.discussion")}
                        {commentCount > 0 && (
                          <span style={{ background: "#EFF6FF", color: "#2563EB", fontSize: 11, fontWeight: 700, borderRadius: 10, padding: "1px 8px" }}>
                            {commentCount}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LangInputs ───────────────────────────────────────────────────────────────

function LangInputs({ label, values, onChange }: {
  label: string;
  values: { ru: string; en: string; uz: string };
  onChange: (lang: "ru" | "en" | "uz", val: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {(["ru", "en", "uz"] as const).map((lang) => (
        <div key={lang} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 28, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", textAlign: "center" }}>
            {lang === "uz" ? "UZ" : lang.toUpperCase()}
          </span>
          <input
            placeholder={`${label} (${lang === "ru" ? "Рус" : lang === "en" ? "Eng" : "Ўзб"})`}
            value={values[lang]}
            onChange={(e) => onChange(lang, e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const smallBtnStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 500, padding: "6px 14px",
  background: "#fff", border: "1px solid #D1D5DB",
  borderRadius: 8, cursor: "pointer", color: "#374151",
};

const ghostBtnStyle: React.CSSProperties = {
  fontSize: 12, color: "#6B7280", background: "none", border: "none",
  cursor: "pointer", padding: "2px 4px", fontWeight: 500,
};

const primaryBtnStyle = (color: string): React.CSSProperties => ({
  padding: "8px 20px", fontSize: 14, fontWeight: 600,
  background: color, color: "#fff", border: "none",
  borderRadius: 8, cursor: "pointer",
});

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px", fontSize: 14,
  background: "none", border: "1px solid #D1D5DB",
  borderRadius: 8, cursor: "pointer", color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 14,
  border: "1px solid #D1D5DB", borderRadius: 8,
  outline: "none", boxSizing: "border-box",
};

const downloadBtnStyle: React.CSSProperties = {
  fontSize: 12, padding: "4px 10px", borderRadius: 6,
  border: "1px solid #D1D5DB", background: "#fff",
  color: "#374151", cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  fontSize: 12, padding: "4px 8px", borderRadius: 6,
  border: "1px solid #FECACA", background: "#fff",
  color: "#DC2626", cursor: "pointer",
};
