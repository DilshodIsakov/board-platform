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
    <div key={c.id} style={{ marginTop: isReply ? 10 : 0, paddingLeft: isReply ? 12 : 0, borderLeft: isReply ? "2px solid #e0e0e0" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{c.user_name || t("review.unknownUser")}</span>
        <span style={{ fontSize: 11, color: "#8d8d8d" }}>{formatDateTime(c.created_at, i18n.language)}</span>
        {(c.user_id === currentUserId || isAdmin) && !c.is_deleted && (
          <button
            onClick={() => onDelete(c.id)}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#da1e28", fontSize: 11, cursor: "pointer" }}
          >
            {t("common.delete")}
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: c.is_deleted ? "#8d8d8d" : "#393939", lineHeight: 1.5, fontStyle: c.is_deleted ? "italic" : "normal" }}>
        {c.is_deleted ? t("review.commentDeleted") : c.content}
      </div>
    </div>
  );

  return (
    <div
      onClick={onSelect}
      style={{
        border: "1px solid " + (isActive ? "#0f62fe" : "#e0e0e0"),
        borderRadius: 0,
        padding: 12,
        background: resolved ? "#f4f4f4" : "#fff",
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
          <span style={{ fontSize: 11, color: "#8d8d8d" }}>
            {root.anchor.type === "xlsx"
              ? `${root.anchor.sheet}!${root.anchor.start}${root.anchor.start !== root.anchor.end ? ":" + root.anchor.end : ""}`
              : t("review.versionLabel", { n: root.version_no })}
          </span>
        )}
      </div>

      {root.quoted_text && (
        <div style={{
          fontSize: 12, color: "#525252", background: "#fcf4d6", borderLeft: "3px solid #f1c21b",
          padding: "4px 8px", borderRadius: 0, marginBottom: 8, maxHeight: 60, overflow: "hidden",
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
            style={{ fontSize: 12, color: "#0f62fe", background: "none", border: "none", cursor: "pointer", fontWeight: 500 }}
          >
            {t("review.reply")}
          </button>
        )}
        {canResolve && (
          <button
            onClick={() => onResolve(!resolved)}
            style={{ fontSize: 12, color: resolved ? "#525252" : "#24a148", background: "none", border: "none", cursor: "pointer", fontWeight: 500, marginLeft: "auto" }}
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
            style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: 8, border: "1px solid #c6c6c6", borderRadius: 0, resize: "vertical" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
            <button onClick={() => { setShowReply(false); setReplyText(""); }} style={{ fontSize: 12, padding: "5px 10px", border: "1px solid #c6c6c6", borderRadius: 0, background: "#fff", cursor: "pointer" }}>
              {t("common.cancel")}
            </button>
            <button onClick={submitReply} disabled={sending || !replyText.trim()} style={{ fontSize: 12, padding: "5px 12px", border: "none", borderRadius: 0, background: "#0f62fe", color: "#fff", cursor: "pointer" }}>
              {sending ? t("common.saving") : t("review.send")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
