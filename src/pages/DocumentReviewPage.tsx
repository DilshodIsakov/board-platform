import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import { fetchDocumentById } from "../lib/documents";
import { fetchRegDocumentById } from "../lib/regulations";
import {
  listAllVersions,
  getVersionUrl,
  downloadVersionBytes,
  uploadNewVersion,
  type VersionInfo,
  type ReviewableDoc,
} from "../lib/documentVersions";
import {
  fetchDocumentComments,
  addDocumentComment,
  setCommentStatus,
  softDeleteDocumentComment,
  type DocumentComment,
  type CommentAnchor,
  type DocSource,
} from "../lib/documentComments";
import { parseXlsx, type XlsxSheet } from "../lib/officeViewer";
import { logAuditEvent } from "../lib/auditLog";
import { downloadFileByUrl } from "../lib/format";
import { LoadingScreen, EmptyState } from "../components/ui";
import DocumentViewer from "../components/DocumentViewer";
import DocumentCommentThread from "../components/DocumentCommentThread";

const COMMENT_ROLES = ["admin", "corp_secretary", "board_member", "chairman", "executive"];
const MANAGE_ROLES = ["admin", "corp_secretary"];

type Kind = "docx" | "xlsx" | "other";

function detectKind(fileName: string): Kind {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  return "other";
}

interface Props {
  profile: Profile | null;
  org: Organization | null;
  /** Источник документа: материалы заседаний/комитетов или регламенты. */
  source?: DocSource;
}

export default function DocumentReviewPage({ profile, source = "document" }: Props) {
  const { documentId } = useParams<{ documentId: string }>();
  const { t } = useTranslation();
  const closeWindow = () => window.close();

  const [doc, setDoc] = useState<ReviewableDoc | null>(null);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number>(1);
  const [comments, setComments] = useState<DocumentComment[]>([]);

  const [docxBuffer, setDocxBuffer] = useState<ArrayBuffer>();
  const [xlsxSheets, setXlsxSheets] = useState<XlsxSheet[]>();
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  // composer для нового корневого комментария
  const [pendingAnchor, setPendingAnchor] = useState<{ anchor: CommentAnchor; quoted: string } | null>(null);
  const [composerText, setComposerText] = useState("");
  const [posting, setPosting] = useState(false);

  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingVersion, setUploadingVersion] = useState(false);

  const role = profile?.role || "";
  const canComment = COMMENT_ROLES.includes(role);
  const canManage = MANAGE_ROLES.includes(role);
  const isAdmin = role === "admin";

  const kind = doc ? detectKind(doc.file_name) : "other";
  const latestVersionNo = versions.length ? Math.max(...versions.map((v) => v.version_no)) : 1;

  // ── Загрузка метаданных документа, версий, комментариев ──
  const loadMeta = async () => {
    if (!documentId) return;
    const raw = source === "reg_document"
      ? await fetchRegDocumentById(documentId)
      : await fetchDocumentById(documentId);
    if (!raw) {
      setError(t("review.notFound"));
      setLoading(false);
      return;
    }
    const d: ReviewableDoc = {
      id: raw.id,
      org_id: raw.org_id,
      storage_path: raw.storage_path,
      file_name: raw.file_name,
      file_size: raw.file_size,
      mime_type: raw.mime_type,
      uploaded_by: raw.uploaded_by,
      created_at: raw.created_at,
      title: raw.title,
    };
    setDoc(d);
    const vs = await listAllVersions(d, source);
    setVersions(vs);
    setSelectedVersion((prev) => (prev === 1 ? Math.max(...vs.map((v) => v.version_no)) : prev));
    await loadComments(d.id);
    setLoading(false);
  };

  const loadComments = async (docId: string) => {
    const cs = await fetchDocumentComments(docId, source);
    setComments(cs);
  };

  useEffect(() => {
    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  // ── Рендер выбранной версии ──
  useEffect(() => {
    const version = versions.find((v) => v.version_no === selectedVersion);
    if (!version || kind === "other") return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      setDocxBuffer(undefined);
      setXlsxSheets(undefined);
      try {
        const bytes = await downloadVersionBytes(version.storage_path);
        if (!bytes || cancelled) return;
        if (kind === "docx") {
          if (!cancelled) setDocxBuffer(bytes);
        } else if (kind === "xlsx") {
          const sheets = await parseXlsx(bytes);
          if (!cancelled) setXlsxSheets(sheets);
        }
      } catch (e) {
        console.error("render error:", e);
        if (!cancelled) setError(t("review.renderError"));
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVersion, versions, kind]);

  // ── Производные: корневые комментарии / ответы для выбранной версии ──
  const versionComments = useMemo(
    () => comments.filter((c) => c.version_no === selectedVersion),
    [comments, selectedVersion]
  );
  const rootComments = useMemo(
    () => versionComments.filter((c) => !c.parent_comment_id && !c.is_deleted),
    [versionComments]
  );
  const repliesByParent = useMemo(() => {
    const map: Record<string, DocumentComment[]> = {};
    for (const c of versionComments) {
      if (c.parent_comment_id) {
        (map[c.parent_comment_id] ||= []).push(c);
      }
    }
    return map;
  }, [versionComments]);

  const filteredRoots = rootComments.filter((c) =>
    filter === "all" ? true : filter === "open" ? c.status === "open" : c.status === "resolved"
  );
  const openCount = rootComments.filter((c) => c.status === "open").length;

  // ── Действия ──
  const handleRequestComment = (anchor: CommentAnchor, quoted: string) => {
    setPendingAnchor({ anchor, quoted });
    setComposerText("");
    setActiveCommentId(null);
  };

  const submitComment = async () => {
    if (!doc || !profile || !pendingAnchor || !composerText.trim()) return;
    setPosting(true);
    try {
      const created = await addDocumentComment({
        document_id: doc.id,
        source_type: source,
        version_no: selectedVersion,
        user_id: profile.id,
        user_name: profile.full_name || profile.email,
        user_role: profile.role,
        content: composerText.trim(),
        anchor: pendingAnchor.anchor,
        quoted_text: pendingAnchor.quoted,
      });
      logAuditEvent({ actionType: "document_comment_add", actionLabel: "Комментарий к документу", entityType: "document", entityId: doc.id, entityTitle: doc.title || doc.file_name });
      setPendingAnchor(null);
      setComposerText("");
      await loadComments(doc.id);
      if (created) setActiveCommentId(created.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("review.postError"));
    } finally {
      setPosting(false);
    }
  };

  const handleReply = async (parentId: string, content: string) => {
    if (!doc || !profile) return;
    await addDocumentComment({
      document_id: doc.id,
      source_type: source,
      version_no: selectedVersion,
      user_id: profile.id,
      user_name: profile.full_name || profile.email,
      user_role: profile.role,
      content,
      parent_comment_id: parentId,
    });
    await loadComments(doc.id);
  };

  const handleResolve = async (commentId: string, resolved: boolean) => {
    if (!doc || !profile) return;
    await setCommentStatus(commentId, resolved ? "resolved" : "open", profile.id);
    if (resolved) logAuditEvent({ actionType: "document_comment_resolve", actionLabel: "Комментарий решён", entityType: "document", entityId: doc.id, entityTitle: doc.title || doc.file_name });
    await loadComments(doc.id);
  };

  const handleDelete = async (commentId: string) => {
    if (!doc) return;
    if (!confirm(t("review.confirmDeleteComment"))) return;
    await softDeleteDocumentComment(commentId);
    await loadComments(doc.id);
  };

  const handleDownloadOriginal = async () => {
    const version = versions.find((v) => v.version_no === selectedVersion);
    if (!version) return;
    const url = await getVersionUrl(version.storage_path);
    if (url) await downloadFileByUrl(url, version.file_name);
  };

  const handleUploadVersion = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !doc || !profile) return;
    const note = prompt(t("review.versionNotePrompt")) || undefined;
    setUploadingVersion(true);
    try {
      const created = await uploadNewVersion(doc, source, file, profile.id, note);
      const vs = await listAllVersions(doc, source);
      setVersions(vs);
      if (created) setSelectedVersion(created.version_no);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("review.uploadError"));
    } finally {
      setUploadingVersion(false);
    }
  };

  // Отдельная вкладка во весь экран (без сайдбара приложения).
  const shell = (content: React.ReactNode) => <div style={fullShell}>{content}</div>;

  if (loading) return shell(<LoadingScreen message={t("common.loading")} />);
  if (!doc) return shell(<EmptyState icon="📄" title={error || t("review.notFound")} />);

  return shell(
    <div className="dc-review" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <style>{`
        .dc-review-body { display: flex; gap: 16px; flex: 1; min-height: 0; }
        .dc-review-doc { flex: 1; overflow: auto; }
        .dc-review-panel { width: 360px; display: flex; flex-direction: column; min-height: 0; }
        @media (max-width: 900px) {
          .dc-review-body { flex-direction: column; overflow: auto; }
          .dc-review-doc { flex: none; min-height: 55vh; }
          .dc-review-panel { width: 100%; min-height: 40vh; }
        }
        .dc-review button:focus-visible,
        .dc-review select:focus-visible,
        .dc-review textarea:focus-visible { outline: 2px solid #2563EB; outline-offset: 2px; }
      `}</style>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={closeWindow} style={backBtn}>✕ {t("review.close")}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {doc.title || doc.file_name}
          </h2>
        </div>

        {/* Version selector */}
        {versions.length > 1 && (
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(Number(e.target.value))}
            style={selectStyle}
          >
            {versions.map((v) => (
              <option key={v.version_no} value={v.version_no}>
                {v.is_original ? t("review.versionOriginal", { n: v.version_no }) : t("review.versionN", { n: v.version_no })}
                {v.version_no === latestVersionNo ? ` · ${t("review.latest")}` : ""}
              </option>
            ))}
          </select>
        )}

        <button onClick={handleDownloadOriginal} style={secondaryBtn}>⬇ {t("review.downloadOriginal")}</button>

        {canManage && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.xlsx"
              onChange={handleUploadVersion}
              style={{ display: "none" }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingVersion}
              style={primaryBtn}
            >
              {uploadingVersion ? t("common.saving") : "⬆ " + t("review.uploadFinalVersion")}
            </button>
          </>
        )}
      </div>

      {error && (
        <div style={{ padding: "8px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, color: "#DC2626", fontSize: 13, marginBottom: 10 }}>
          {error}
        </div>
      )}

      {selectedVersion !== latestVersionNo && (
        <div style={{ padding: "8px 14px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, color: "#92400E", fontSize: 13, marginBottom: 10 }}>
          {t("review.viewingOldVersion")}
        </div>
      )}

      <div className="dc-review-body">
        {/* Document */}
        <div className="dc-review-doc" style={{ border: "1px solid #E5E7EB", borderRadius: 12, padding: 24, background: "#fff" }}>
          {kind === "other" ? (
            <EmptyState icon="📄" title={t("review.unsupported")} description={t("review.unsupportedDesc")} />
          ) : rendering ? (
            <LoadingScreen message={t("review.rendering")} />
          ) : (
            <DocumentViewer
              kind={kind}
              docxBuffer={docxBuffer}
              xlsxSheets={xlsxSheets}
              rootComments={rootComments}
              activeCommentId={activeCommentId}
              canComment={canComment && selectedVersion === latestVersionNo}
              onRequestComment={handleRequestComment}
              onAnchorClick={(id) => setActiveCommentId(id)}
            />
          )}
        </div>

        {/* Comments panel */}
        <div className="dc-review-panel">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{t("review.commentsTitle")}</h3>
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>{t("review.openCount", { count: openCount })}</span>
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ ...selectStyle, marginLeft: "auto" }}>
              <option value="all">{t("review.filterAll")}</option>
              <option value="open">{t("review.filterOpen")}</option>
              <option value="resolved">{t("review.filterResolved")}</option>
            </select>
          </div>

          {/* Composer для нового комментария */}
          {pendingAnchor && (
            <div style={{ border: "1px solid #2563EB", borderRadius: 10, padding: 12, marginBottom: 12, background: "#EFF6FF" }}>
              <div style={{ fontSize: 12, color: "#1E40AF", marginBottom: 6 }}>
                {pendingAnchor.anchor.type === "xlsx"
                  ? t("review.commentingCell", { cell: pendingAnchor.quoted })
                  : t("review.commentingFragment")}
              </div>
              {pendingAnchor.quoted && pendingAnchor.anchor.type === "docx" && (
                <div style={{ fontSize: 12, fontStyle: "italic", color: "#6B7280", marginBottom: 6 }}>«{pendingAnchor.quoted}»</div>
              )}
              <textarea
                autoFocus
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder={t("review.commentPlaceholder")}
                rows={3}
                style={{ width: "100%", boxSizing: "border-box", fontSize: 13, padding: 8, border: "1px solid #D1D5DB", borderRadius: 6, resize: "vertical" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                <button onClick={() => setPendingAnchor(null)} style={secondaryBtn}>{t("common.cancel")}</button>
                <button onClick={submitComment} disabled={posting || !composerText.trim()} style={primaryBtn}>
                  {posting ? t("common.saving") : t("review.send")}
                </button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
            {filteredRoots.length === 0 && !pendingAnchor ? (
              <EmptyState
                icon="💬"
                title={t("review.noComments")}
                description={canComment && selectedVersion === latestVersionNo ? t("review.noCommentsHint") : undefined}
              />
            ) : (
              filteredRoots.map((c) => (
                <DocumentCommentThread
                  key={c.id}
                  root={c}
                  replies={repliesByParent[c.id] || []}
                  isActive={activeCommentId === c.id}
                  canReply={canComment}
                  canResolve={canManage}
                  currentUserId={profile?.id || ""}
                  isAdmin={isAdmin}
                  onSelect={() => setActiveCommentId(c.id)}
                  onReply={(content) => handleReply(c.id, content)}
                  onResolve={(resolved) => handleResolve(c.id, resolved)}
                  onDelete={handleDelete}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const backBtn: React.CSSProperties = { padding: "9px 14px", minHeight: 40, fontSize: 13, border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { padding: "9px 14px", minHeight: 40, fontSize: 13, border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer", whiteSpace: "nowrap" };
const primaryBtn: React.CSSProperties = { padding: "9px 16px", minHeight: 40, fontSize: 13, border: "none", borderRadius: 6, background: "#2563EB", color: "#fff", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" };
const selectStyle: React.CSSProperties = { padding: "8px 10px", minHeight: 40, fontSize: 13, border: "1px solid #D1D5DB", borderRadius: 6, background: "#fff", cursor: "pointer" };
const fullShell: React.CSSProperties = { height: "100vh", padding: 16, background: "#fff", boxSizing: "border-box", display: "flex", flexDirection: "column", overflow: "hidden" };
