import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchDocLinks,
  fetchAllDocLinks,
  createDocLink,
  updateDocLink,
  deleteDocLink,
  type DocLink,
} from "../lib/docLinks";

const CAN_MANAGE = ["admin", "chairman"];

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function DocumentsPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<DocLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingLink, setEditingLink] = useState<DocLink | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSort, setFormSort] = useState(100);
  const [formActive, setFormActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const canManage = profile && CAN_MANAGE.includes(profile.role);

  const loadData = async () => {
    try {
      const data = canManage ? await fetchAllDocLinks() : await fetchDocLinks();
      setLinks(data);
    } catch {
      // errors logged inside fetchDocLinks
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    loadData();
  }, [profile]);

  // Open modal for create
  const handleOpenCreate = () => {
    setEditingLink(null);
    setFormTitle("");
    setFormUrl("");
    setFormDesc("");
    setFormSort(100);
    setFormActive(true);
    setShowModal(true);
  };

  // Open modal for edit
  const handleOpenEdit = (link: DocLink) => {
    setEditingLink(link);
    setFormTitle(link.title);
    setFormUrl(link.url);
    setFormDesc(link.description || "");
    setFormSort(link.sort_order);
    setFormActive(link.is_active);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingLink(null);
  };

  const validateUrl = (url: string): boolean => {
    if (!url.startsWith("https://")) return false;
    return true;
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formUrl.trim()) return;

    if (!validateUrl(formUrl.trim())) {
      setError("URL должен начинаться с https://");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (editingLink) {
        await updateDocLink(editingLink.id, {
          title: formTitle.trim(),
          url: formUrl.trim(),
          description: formDesc.trim() || undefined,
          sort_order: formSort,
          is_active: formActive,
        });
        setSuccess("Ссылка обновлена");
      } else {
        if (!org || !profile) return;
        await createDocLink({
          org_id: org.id,
          title: formTitle.trim(),
          url: formUrl.trim(),
          description: formDesc.trim() || undefined,
          sort_order: formSort,
          is_active: formActive,
          created_by: profile.id,
        });
        setSuccess("Ссылка добавлена");
      }
      handleCloseModal();
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (link: DocLink) => {
    if (!confirm(`Удалить «${link.title}»?`)) return;
    try {
      await deleteDocLink(link.id);
      setSuccess("Ссылка удалена");
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ошибка удаления");
    }
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>Загрузка...</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 4 }}>Документооборот</h1>
      <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 20px" }}>
        Каталог документов Google Docs / Google Drive
      </p>

      {/* Messages */}
      {error && (
        <div style={errorBannerStyle}>
          {error}
          <button onClick={() => setError("")} style={closeBtnStyle}>&times;</button>
        </div>
      )}
      {success && (
        <div style={successBannerStyle}>
          {success}
          <button onClick={() => setSuccess("")} style={closeBtnStyle}>&times;</button>
        </div>
      )}

      {/* Admin: add button */}
      {canManage && (
        <button onClick={handleOpenCreate} style={btnPrimaryStyle}>
          + Добавить ссылку
        </button>
      )}

      {/* Links list */}
      {links.length === 0 ? (
        <p style={{ color: "#888", marginTop: 20 }}>Документов пока нет.</p>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {links.map((link) => (
            <div
              key={link.id}
              style={{
                ...cardStyle,
                opacity: link.is_active ? 1 : 0.5,
                cursor: "pointer",
              }}
              onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span style={{ fontWeight: 600, fontSize: 15 }}>{link.title}</span>
                  {!link.is_active && (
                    <span style={inactiveBadgeStyle}>Скрыт</span>
                  )}
                </div>
                {link.description && (
                  <p style={{ color: "#6B7280", fontSize: 13, margin: "4px 0 0 26px" }}>
                    {link.description}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}
                   onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
                  style={btnOpenStyle}
                >
                  Открыть
                </button>
                {canManage && (
                  <>
                    <button onClick={() => handleOpenEdit(link)} style={btnSmallStyle}>
                      Изм.
                    </button>
                    <button
                      onClick={() => handleDelete(link)}
                      style={{ ...btnSmallStyle, color: "#DC2626", borderColor: "#FECACA" }}
                    >
                      Уд.
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={overlayStyle} onClick={handleCloseModal}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>
              {editingLink ? "Редактировать ссылку" : "Добавить ссылку"}
            </h3>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Название *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Бизнес-план 2026 г."
                  required
                  style={{ ...inputStyle, width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>URL (https://) *</label>
                <input
                  type="url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://docs.google.com/document/d/..."
                  required
                  style={{ ...inputStyle, width: "100%" }}
                />
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Описание</label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Короткое описание (необязательно)"
                  style={{ ...inputStyle, width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={labelStyle}>Порядок</label>
                  <input
                    type="number"
                    value={formSort}
                    onChange={(e) => setFormSort(Number(e.target.value))}
                    style={{ ...inputStyle, width: 80 }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "end", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                    id="active-cb"
                  />
                  <label htmlFor="active-cb" style={{ fontSize: 14, cursor: "pointer" }}>
                    Активна
                  </label>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button type="button" onClick={handleCloseModal} style={btnSecondaryStyle}>
                  Отмена
                </button>
                <button type="submit" disabled={saving} style={btnPrimaryStyle}>
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Styles ---

const cardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  border: "1px solid #E5E7EB",
  borderRadius: 8,
  background: "#fff",
  gap: 12,
  transition: "box-shadow 0.15s",
};

const btnPrimaryStyle: React.CSSProperties = {
  padding: "8px 20px",
  fontSize: 14,
  borderRadius: 6,
  border: "none",
  background: "#2563EB",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 500,
};

const btnOpenStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: 13,
  borderRadius: 6,
  border: "none",
  background: "#3B82F6",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const btnSmallStyle: React.CSSProperties = {
  padding: "5px 10px",
  fontSize: 12,
  borderRadius: 6,
  border: "1px solid #D1D5DB",
  background: "transparent",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnSecondaryStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid #D1D5DB",
  background: "transparent",
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  color: "#6B7280",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  fontSize: 14,
  border: "1px solid #D1D5DB",
  borderRadius: 6,
  boxSizing: "border-box",
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
  borderRadius: 12,
  padding: 24,
  width: "100%",
  maxWidth: 480,
  boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const inactiveBadgeStyle: React.CSSProperties = {
  padding: "1px 8px",
  borderRadius: 10,
  fontSize: 11,
  fontWeight: 600,
  background: "#F3F4F6",
  color: "#9CA3AF",
};

const errorBannerStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  borderRadius: 8,
  color: "#DC2626",
  fontSize: 14,
  marginBottom: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const successBannerStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#F0FDF4",
  border: "1px solid #BBF7D0",
  borderRadius: 8,
  color: "#16A34A",
  fontSize: 14,
  marginBottom: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 18,
  cursor: "pointer",
  color: "inherit",
  padding: "0 4px",
};
