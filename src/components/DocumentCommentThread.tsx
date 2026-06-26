import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "../lib/format";
import { StatusBadge } from "./ui";
import type { DocumentComment } from "../lib/documentComments";

interface Props {
  root: DocumentComment;
  replies: DocumentComment[];
  isActive: boolean;
  canReply: boolean;
  canResolve: boolean;
  currentUserId: string;
  isAdmin: boolean;
  onSelect: () => void;
  onReply: (content: string) => Promise<void>;
  onResolve: (resolved: boolean) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}

export default function DocumentCommentThread({
  root,
  replies,
  isActive,
  canReply,
  canResolve,
  currentUserId,
  isAdmin,
  onSelect,
  onReply,
  onResolve,
  onDelete,
}: Props) {
  const { t, i18n } = useTranslation();
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [showReply, setShowReply] = useState(false);

  const resolved = root.status === "resolved";

  const submitReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      await onReply(replyText.trim());
      setReplyText("");
      setShowReply(false);
    } finally {
      setSending(false);
    }
  };

  const renderOne = (c: DocumentComment, isReply: boolean) => (
    <div key={c.id} style={{ marginTop: isReply ? 10 : 0, paddingLeft: isReply ? 12 : 0, borderLeft: isReply ? "2px solid #E5E7EB" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.user_name || t("review.unknownUser")}</span>
        <span style={{ fontSize: 11, color: "#9CA3AF" }}>{formatDateTime(c.created_at, i18n.language)}</span>
        {(c.user_id === currentUserId || isAdmin) && !c.is_deleted && (
          <button
            onClick={() => onDelete(c.id)}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#DC2626", fontSize: 11, cursor: "pointer" }}
          >
            {t("common.delete")}
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: c.is_deleted ? "#9CA3AF" : "#374151", lineHeight: 1.5, fontStyle: c.is_deleted ? "italic" : "normal" }}>
        {c.is_deleted ? t("review.commentDeleted") : c.content}
      </div>
    </div>
  );

  return (
    <div
      onClick={onSelect}
      style={{
        border: "1px solid " + (isActive ? "#2563EB" : "#E5E7EB"),
        borderRadius: 10,
        padding: 12,
        background: resolved ? "#F9FAFB" : "#fff",
        cursor: "pointer",
        boxShadow: isActive ? "0 0 0 2px rgba(37,99,235,0.15)" : undefined,
        opacity: resolved ? 0.85 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        {resolved ? (
          <StatusBadge variant="success">{t("review.statusResolved")}</StatusBadge>
        ) : (
          <StatusBadge variant="warning" dot>{t("review.statusOpen")}</StatusBadge>
        )}
        {root.anchor && (
          <span style={{ fontSize: 11, color: "#9CA3AF" }}>
            {root.anchor.type === "xlsx"
              ? `${root.anchor.sheet}!${root.anchor.start}${root.anchor.start !== root.anchor.end ? ":" + root.anchor.end : ""}`
              : t("review.versionLabel", { n: root.version_no })}
          </span>
        )}
      </div>

      {root.quoted_text && (
        <div style={{
          fontSize: 12, color: "#6B7280", background: "#FFFBEB", borderLeft: "3px solid #F59E0B",
          padding: "4px 8px", borderRadius: 4, marginBottom: 8, maxHeight: 60, overflow: "hidden",
        }}>
          «{root.quoted_text}»
        </div>
      )}

      {renderOne(root, false)}
      {replies.map((r) => renderOne(r, true))}

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }} onClick={(e) => e.stopPropagation()}>
        {canReply && !resolved && (
          <button
            onClick={() => setShowReply((v) => !v)}
            style={{ fontSize: 12, color: "#2563EB", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
          >
            {t("review.reply")}
          </button>
        )}
        {canResolve && (
          <button
            onClick={() => onResolve(!resolved)}
            style={{ fontSize: 12, color: resolved ? "#6B7280" : "#16A34A", background: "none", border: "none", cursor: "pointer", fontWeight: 500, marginLeft: "auto" }}
          >
            {resolved ? t("review.reopen") : t("review.markResolved")}
          </button>
        )}
      </div>

      {showReply && (
        <div style={{ marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder={t("review.replyPlaceholder")}
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
            <button onClick={() => { setShowReply(false); setReplyText(""); }} style={{ fontSize: 12, padding: "5px 10px", border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer" }}>
              {t("common.cancel")}
            </button>
            <button onClick={submitReply} disabled={sending || !replyText.trim()} style={{ fontSize: 12, padding: "5px 12px", border: "none", borderRadius: 6, background: "#2563EB", color: "#fff", cursor: "pointer" }}>
              {sending ? t("common.saving") : t("review.send")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
