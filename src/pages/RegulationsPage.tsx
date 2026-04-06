import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import { getLocalizedField } from "../lib/i18nHelpers";
import {
  fetchRegCategories,
  fetchRegDocuments,
  createRegCategory,
  deleteRegCategory,
  uploadRegDocument,
  getRegDocumentUrl,
  archiveRegDocument,
  deleteRegDocument,
  type RegCategory,
  type RegDocument,
  type RegKind,
} from "../lib/regulations";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

const KIND_ORDER: RegKind[] = ["internal", "external", "reports"];

const KIND_COLOR: Record<RegKind, string> = {
  internal: "#2563EB",
  external: "#059669",
  reports:  "#7C3AED",
};

const KIND_BG: Record<RegKind, string> = {
  internal: "#EFF6FF",
  external: "#F0FDF4",
  reports:  "#F5F3FF",
};

function getFileTypeLabel(mime: string): string {
  if (mime.includes("pdf"))                             return "PDF";
  if (mime.includes("word") || mime.includes("docx"))  return "Word";
  if (mime.includes("excel") || mime.includes("xlsx") || mime.includes("spreadsheet")) return "Excel";
  if (mime.includes("powerpoint") || mime.includes("pptx") || mime.includes("presentation")) return "PPT";
  return "File";
}

function getFileTypeColor(mime: string): string {
  const label = getFileTypeLabel(mime);
  if (label === "PDF")   return "#DC2626";
  if (label === "Word")  return "#2563EB";
  if (label === "Excel") return "#059669";
  if (label === "PPT")   return "#D97706";
  return "#6B7280";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)          return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RegulationsPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const isAdmin = profile?.role === "admin" || profile?.role === "corp_secretary";

  const [categories, setCategories] = useState<RegCategory[]>([]);
  const [documents, setDocuments] = useState<RegDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedKinds, setCollapsedKinds] = useState<Set<RegKind>>(new Set());

  // Add category
  const [showAddCat, setShowAddCat] = useState(false);
  const [addCatKind, setAddCatKind] = useState<RegKind>("internal");
  const [addCatName, setAddCatName] = useState("");
  const [addCatNameEn, setAddCatNameEn] = useState("");
  const [addCatNameUz, setAddCatNameUz] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  // Upload
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadTitleEn, setUploadTitleEn] = useState("");
  const [uploadTitleUz, setUploadTitleUz] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadVersion, setUploadVersion] = useState("1.0");
  const [uploadDate, setUploadDate] = useState("");
  const [uploadIssuer, setUploadIssuer] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    setLoading(true);
    const cats = await fetchRegCategories();
    setCategories(cats);
    setLoading(false);
  };

  const loadDocuments = async (catId: string, archived: boolean) => {
    setDocsLoading(true);
    const docs = await fetchRegDocuments(catId, archived);
    setDocuments(docs);
    setDocsLoading(false);
  };

  const selectCategory = (catId: string) => {
    setSelectedId(catId);
    setSearchQuery("");
    setShowUpload(false);
    loadDocuments(catId, showArchived);
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    if (selectedId) loadDocuments(selectedId, next);
  };

  const toggleKind = (kind: RegKind) => {
    setCollapsedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind); else next.add(kind);
      return next;
    });
  };

  const handleAddCategory = async () => {
    if (!addCatName.trim() || !org) return;
    setAddingCat(true);
    const maxOrder = Math.max(0, ...categories.filter((c) => c.kind === addCatKind).map((c) => c.order_index)) + 1;
    const created = await createRegCategory({
      org_id: org.id,
      kind: addCatKind,
      name: addCatName.trim(),
      name_en: addCatNameEn.trim() || undefined,
      name_uz: addCatNameUz.trim() || undefined,
      order_index: maxOrder,
    });
    if (created) {
      setCategories((prev) => [...prev, created].sort((a, b) => a.order_index - b.order_index));
      setShowAddCat(false);
      setAddCatName(""); setAddCatNameEn(""); setAddCatNameUz("");
    }
    setAddingCat(false);
  };

  const handleDeleteCategory = async (cat: RegCategory) => {
    if (!window.confirm(`${t("regs.deleteCategoryConfirm")}: "${getLocalizedField(cat as unknown as Record<string, unknown>, "name")}"?`)) return;
    await deleteRegCategory(cat.id);
    setCategories((prev) => prev.filter((c) => c.id !== cat.id));
    if (selectedId === cat.id) { setSelectedId(null); setDocuments([]); }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadTitle.trim() || !profile || !org || !selectedId) return;
    setUploading(true);
    setUploadError("");
    try {
      const doc = await uploadRegDocument(uploadFile, org.id, selectedId, profile.id, {
        title: uploadTitle.trim(),
        title_en: uploadTitleEn.trim() || undefined,
        title_uz: uploadTitleUz.trim() || undefined,
        description: uploadDesc.trim() || undefined,
        version: uploadVersion.trim() || "1.0",
        effective_date: uploadDate || undefined,
        issuing_body: uploadIssuer.trim() || undefined,
      });
      setDocuments((prev) => [doc, ...prev]);
      setShowUpload(false);
      resetUploadForm();
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : t("common.error"));
    }
    setUploading(false);
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadTitle(""); setUploadTitleEn(""); setUploadTitleUz("");
    setUploadDesc(""); setUploadVersion("1.0");
    setUploadDate(""); setUploadIssuer("");
    setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDownload = async (doc: RegDocument) => {
    const url = await getRegDocumentUrl(doc.storage_path);
    if (url) { window.open(url, "_blank"); }
  };

  const handleArchive = async (doc: RegDocument) => {
    const ok = await archiveRegDocument(doc.id, !doc.is_archived);
    if (ok) {
      if (!showArchived && !doc.is_archived) {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      } else {
        setDocuments((prev) => prev.map((d) => d.id === doc.id ? { ...d, is_archived: !d.is_archived } : d));
      }
    }
  };

  const handleDelete = async (doc: RegDocument) => {
    if (!window.confirm(t("regs.deleteDocConfirm"))) return;
    await deleteRegDocument(doc);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  };

  const selectedCategory = categories.find((c) => c.id === selectedId) ?? null;
  const lang = i18n.language;

  const filteredDocs = searchQuery.trim()
    ? documents.filter((d) => {
        const q = searchQuery.toLowerCase();
        const title = getLocalizedField(d as unknown as Record<string, unknown>, "title").toLowerCase();
        return title.includes(q) || (d.issuing_body || "").toLowerCase().includes(q) || d.version.toLowerCase().includes(q);
      })
    : documents;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#9CA3AF" }}>
      {t("common.loading")}
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 0, height: "calc(100vh - 48px)", overflow: "hidden" }}>

      {/* ── Left panel: category tree ── */}
      <div style={{
        width: 260, flexShrink: 0, borderRight: "1px solid #E5E7EB",
        overflowY: "auto", background: "#FAFAFA", display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 16px 12px", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>{t("regs.title")}</div>
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }}>{t("regs.subtitle")}</div>
        </div>

        {/* Category groups */}
        <div style={{ flex: 1, padding: "8px 0" }}>
          {KIND_ORDER.map((kind) => {
            const cats = categories.filter((c) => c.kind === kind);
            const collapsed = collapsedKinds.has(kind);
            const color = KIND_COLOR[kind];
            return (
              <div key={kind}>
                {/* Group header */}
                <button
                  onClick={() => toggleKind(kind)}
                  style={{
                    width: "100%", background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "8px 16px 6px", textAlign: "left",
                  }}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill={color}
                    style={{ transform: collapsed ? "rotate(-90deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
                  >
                    <path d="M0 2l5 6 5-6z" />
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {t(`regs.${kind}`)}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#9CA3AF" }}>{cats.length}</span>
                </button>

                {/* Categories */}
                {!collapsed && cats.map((cat) => {
                  const name = getLocalizedField(cat as unknown as Record<string, unknown>, "name");
                  const isSelected = selectedId === cat.id;
                  return (
                    <div
                      key={cat.id}
                      style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: 4 }}
                    >
                      <button
                        onClick={() => selectCategory(cat.id)}
                        style={{
                          flex: 1, background: isSelected ? KIND_BG[kind] : "none",
                          border: "none", borderLeft: isSelected ? `3px solid ${color}` : "3px solid transparent",
                          cursor: "pointer", padding: "7px 16px 7px 13px",
                          textAlign: "left", fontSize: 13, color: isSelected ? color : "#374151",
                          fontWeight: isSelected ? 600 : 400,
                        }}
                      >
                        {name}
                      </button>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                          title={t("common.delete")}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            padding: "4px 6px", color: "#D1D5DB", fontSize: 13,
                            flexShrink: 0,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#EF4444")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#D1D5DB")}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add category button */}
                {!collapsed && isAdmin && (
                  <button
                    onClick={() => { setShowAddCat(true); setAddCatKind(kind); }}
                    style={{
                      width: "100%", background: "none", border: "none", cursor: "pointer",
                      padding: "5px 16px", textAlign: "left", fontSize: 12, color: "#9CA3AF",
                      display: "flex", alignItems: "center", gap: 4,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = color)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#9CA3AF")}
                  >
                    + {t("regs.addCategory")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Right panel: documents ── */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {!selectedCategory ? (
          /* Empty state — no selection */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "#9CA3AF", gap: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth="1.5">
              <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.753 0-3.332.477-4.5 1.253" />
            </svg>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#6B7280" }}>{t("regs.selectCategory")}</div>
            <div style={{ fontSize: 13 }}>{t("regs.selectCategoryHint")}</div>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div style={{
              padding: "16px 24px", borderBottom: "1px solid #E5E7EB",
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
              background: "#fff", position: "sticky", top: 0, zIndex: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: "#111827" }}>
                  {getLocalizedField(selectedCategory as unknown as Record<string, unknown>, "name")}
                </div>
                <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
                  <span style={{
                    background: KIND_BG[selectedCategory.kind],
                    color: KIND_COLOR[selectedCategory.kind],
                    padding: "1px 8px", borderRadius: 10, fontWeight: 600, fontSize: 11,
                  }}>
                    {t(`regs.${selectedCategory.kind}`)}
                  </span>
                </div>
              </div>

              {/* Search */}
              <input
                placeholder={t("regs.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  padding: "7px 12px", fontSize: 13, border: "1px solid #D1D5DB",
                  borderRadius: 8, outline: "none", width: 200, background: "#F9FAFB",
                }}
              />

              {/* Show archived toggle */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#6B7280", cursor: "pointer", whiteSpace: "nowrap" }}>
                <input type="checkbox" checked={showArchived} onChange={toggleArchived} style={{ cursor: "pointer" }} />
                {t("regs.showArchived")}
              </label>

              {/* Upload button */}
              {isAdmin && (
                <button
                  onClick={() => { setShowUpload(!showUpload); resetUploadForm(); }}
                  style={{
                    padding: "8px 18px", fontSize: 13, fontWeight: 600,
                    background: showUpload ? "#1D4ED8" : KIND_COLOR[selectedCategory.kind],
                    color: "#fff", border: "none", borderRadius: 8, cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {showUpload ? "✕" : `+ ${t("regs.upload")}`}
                </button>
              )}
            </div>

            {/* Upload form */}
            {showUpload && isAdmin && (
              <div style={{
                margin: "16px 24px 0", background: "#fff", border: "1px solid #E5E7EB",
                borderRadius: 12, padding: "20px 24px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 14 }}>
                  {t("regs.uploadDocument")}
                </div>

                {/* File picker */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${uploadFile ? KIND_COLOR[selectedCategory.kind] : "#D1D5DB"}`,
                    borderRadius: 10, padding: "14px 20px", cursor: "pointer", marginBottom: 14,
                    background: uploadFile ? KIND_BG[selectedCategory.kind] : "#F9FAFB",
                    display: "flex", alignItems: "center", gap: 10,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={uploadFile ? KIND_COLOR[selectedCategory.kind] : "#9CA3AF"} strokeWidth="2">
                    <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span style={{ fontSize: 13, color: uploadFile ? KIND_COLOR[selectedCategory.kind] : "#6B7280" }}>
                    {uploadFile ? uploadFile.name : t("regs.chooseFile")}
                  </span>
                  {uploadFile && (
                    <span style={{ fontSize: 12, color: "#9CA3AF", marginLeft: "auto" }}>
                      {formatBytes(uploadFile.size)}
                    </span>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setUploadFile(f);
                    if (f && !uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, ""));
                  }}
                />

                {/* Title in 3 langs */}
                <LangInputs
                  label={t("regs.docTitle")}
                  values={{ ru: uploadTitle, en: uploadTitleEn, uz: uploadTitleUz }}
                  onChange={(lang, val) => {
                    if (lang === "ru") setUploadTitle(val);
                    else if (lang === "en") setUploadTitleEn(val);
                    else setUploadTitleUz(val);
                  }}
                />

                {/* Description */}
                <textarea
                  placeholder={t("regs.uploadDesc")}
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: "vertical", marginTop: 10 }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
                  <input
                    placeholder={t("regs.version")}
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    type="date"
                    value={uploadDate}
                    onChange={(e) => setUploadDate(e.target.value)}
                    title={t("regs.effectiveDate")}
                    style={inputStyle}
                  />
                  <input
                    placeholder={t("regs.issuingBody")}
                    value={uploadIssuer}
                    onChange={(e) => setUploadIssuer(e.target.value)}
                    style={inputStyle}
                  />
                </div>

                {uploadError && (
                  <div style={{ marginTop: 10, fontSize: 13, color: "#DC2626" }}>{uploadError}</div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  <button
                    onClick={handleUpload}
                    disabled={uploading || !uploadFile || !uploadTitle.trim()}
                    style={{
                      padding: "9px 22px", fontSize: 13, fontWeight: 600,
                      background: KIND_COLOR[selectedCategory.kind], color: "#fff",
                      border: "none", borderRadius: 8, cursor: "pointer",
                      opacity: uploading || !uploadFile || !uploadTitle.trim() ? 0.5 : 1,
                    }}
                  >
                    {uploading ? t("regs.uploading") : t("regs.upload")}
                  </button>
                  <button
                    onClick={() => { setShowUpload(false); resetUploadForm(); }}
                    style={{ padding: "9px 18px", fontSize: 13, background: "none", border: "1px solid #D1D5DB", borderRadius: 8, cursor: "pointer", color: "#374151" }}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            )}

            {/* Document list */}
            <div style={{ padding: "16px 24px", flex: 1 }}>
              {docsLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: "#9CA3AF" }}>{t("common.loading")}</div>
              ) : filteredDocs.length === 0 ? (
                <div style={{
                  textAlign: "center", padding: "48px 32px",
                  background: "#F9FAFB", borderRadius: 12, border: "1px dashed #D1D5DB",
                }}>
                  <div style={{ fontSize: 38, marginBottom: 10 }}>📄</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>{t("regs.noDocuments")}</div>
                  {isAdmin && (
                    <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 6 }}>
                      {t("regs.uploadHint")}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredDocs.map((doc) => (
                    <DocCard
                      key={doc.id}
                      doc={doc}
                      lang={lang}
                      isAdmin={isAdmin}
                      accentColor={KIND_COLOR[selectedCategory.kind]}
                      onDownload={() => handleDownload(doc)}
                      onArchive={() => handleArchive(doc)}
                      onDelete={() => handleDelete(doc)}
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Add Category Modal ── */}
      {showAddCat && isAdmin && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
        }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowAddCat(false); } }}
        >
          <div style={{
            background: "#fff", borderRadius: 16, padding: "28px 32px", width: 440,
            boxShadow: "0 8px 40px rgba(0,0,0,0.16)",
          }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 16, fontWeight: 700, color: "#111827" }}>
              {t("regs.addCategory")}
            </h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", display: "block", marginBottom: 6 }}>
                {t("regs.kind")}
              </label>
              <select
                value={addCatKind}
                onChange={(e) => setAddCatKind(e.target.value as RegKind)}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {KIND_ORDER.map((k) => (
                  <option key={k} value={k}>{t(`regs.${k}`)}</option>
                ))}
              </select>
            </div>

            <LangInputs
              label={t("regs.categoryName")}
              values={{ ru: addCatName, en: addCatNameEn, uz: addCatNameUz }}
              onChange={(l, val) => {
                if (l === "ru") setAddCatName(val);
                else if (l === "en") setAddCatNameEn(val);
                else setAddCatNameUz(val);
              }}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button
                onClick={handleAddCategory}
                disabled={addingCat || !addCatName.trim()}
                style={{
                  padding: "9px 22px", fontSize: 13, fontWeight: 600,
                  background: KIND_COLOR[addCatKind], color: "#fff",
                  border: "none", borderRadius: 8, cursor: "pointer",
                  opacity: !addCatName.trim() ? 0.5 : 1,
                }}
              >
                {addingCat ? t("common.saving") : t("common.create")}
              </button>
              <button
                onClick={() => setShowAddCat(false)}
                style={{ padding: "9px 18px", fontSize: 13, background: "none", border: "1px solid #D1D5DB", borderRadius: 8, cursor: "pointer", color: "#374151" }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DocCard ────────────────────────────────────────────────────

function DocCard({ doc, lang, isAdmin, accentColor, onDownload, onArchive, onDelete, t }: {
  doc: RegDocument;
  lang: string;
  isAdmin: boolean;
  accentColor: string;
  onDownload: () => void;
  onArchive: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}) {
  const title = getLocalizedField(doc as unknown as Record<string, unknown>, "title");
  const desc = lang === "en" && doc.description_en ? doc.description_en
    : lang === "uz-Cyrl" && doc.description_uz ? doc.description_uz
    : doc.description;
  const ftLabel = getFileTypeLabel(doc.mime_type);
  const ftColor = getFileTypeColor(doc.mime_type);

  const dateStr = doc.effective_date
    ? new Date(doc.effective_date).toLocaleDateString(lang === "en" ? "en-GB" : lang === "uz-Cyrl" ? "uz-UZ" : "ru-RU", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${doc.is_archived ? "#F3F4F6" : "#E5E7EB"}`,
      borderLeft: `4px solid ${doc.is_archived ? "#D1D5DB" : accentColor}`,
      borderRadius: 10,
      padding: "12px 16px",
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
      opacity: doc.is_archived ? 0.7 : 1,
    }}>
      {/* File type badge */}
      <div style={{
        flexShrink: 0, width: 40, height: 46,
        background: `${ftColor}15`,
        border: `1px solid ${ftColor}30`,
        borderRadius: 6,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 700, color: ftColor, letterSpacing: "0.03em",
      }}>
        {ftLabel}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>{title}</span>
          <span style={{ fontSize: 11, color: "#9CA3AF", background: "#F3F4F6", padding: "1px 7px", borderRadius: 8 }}>
            v{doc.version}
          </span>
          {doc.is_archived && (
            <span style={{ fontSize: 11, color: "#9CA3AF", background: "#F3F4F6", padding: "1px 7px", borderRadius: 8 }}>
              {t("regs.archived")}
            </span>
          )}
        </div>

        {desc && (
          <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {desc}
          </div>
        )}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 5, fontSize: 12, color: "#9CA3AF" }}>
          {dateStr && <span>📅 {dateStr}</span>}
          {doc.issuing_body && <span>🏛 {doc.issuing_body}</span>}
          <span>{doc.file_name} · {formatBytes(doc.file_size)}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button
          onClick={onDownload}
          title={t("regs.download")}
          style={actionBtnStyle}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        {isAdmin && (
          <>
            <button
              onClick={onArchive}
              title={doc.is_archived ? t("regs.unarchive") : t("regs.archive")}
              style={actionBtnStyle}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              title={t("common.delete")}
              style={{ ...actionBtnStyle, color: "#EF4444" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── LangInputs ─────────────────────────────────────────────────

function LangInputs({ label, values, onChange }: {
  label: string;
  values: { ru: string; en: string; uz: string };
  onChange: (lang: "ru" | "en" | "uz", val: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {(["ru", "en", "uz"] as const).map((l) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 28, flexShrink: 0, fontSize: 11, fontWeight: 700,
            color: "#6B7280", textTransform: "uppercase", textAlign: "center",
          }}>
            {l === "uz" ? "UZ" : l.toUpperCase()}
          </span>
          <input
            placeholder={`${label} (${l === "ru" ? "Рус" : l === "en" ? "Eng" : "Ўзб"})`}
            value={values[l]}
            onChange={(e) => onChange(l, e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: 13,
  border: "1px solid #D1D5DB",
  borderRadius: 8,
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};

const actionBtnStyle: React.CSSProperties = {
  padding: "6px",
  background: "#F9FAFB",
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  cursor: "pointer",
  color: "#6B7280",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
