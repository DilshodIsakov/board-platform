import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  getAllProfiles,
  updateUserProfile,
  adminCreateUser,
  adminDeleteUser,
  ROLE_OPTIONS,
  ROLE_LABELS,
  type Profile,
  type UserRole,
} from "../lib/profile";
import { getIntlLocale } from "../i18n";

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  const { t } = useTranslation();

  // Form fields
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("board_member");
  const [formRoleDetails, setFormRoleDetails] = useState("");

  useEffect(() => {
    loadProfiles();
  }, []);

  const loadProfiles = async () => {
    setLoading(true);
    const data = await getAllProfiles();
    setProfiles(data);
    setLoading(false);
  };

  const clearMessages = () => { setError(""); setSuccess(""); };

  const openCreateModal = () => {
    clearMessages();
    setEditingProfile(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("board_member");
    setFormRoleDetails("");
    setShowModal(true);
  };

  const openEditModal = (p: Profile) => {
    clearMessages();
    setEditingProfile(p);
    setFormName(p.full_name || "");
    setFormEmail(p.email);
    setFormPassword("");
    setFormRole(p.role);
    setFormRoleDetails(p.role_details || "");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingProfile(null);
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    clearMessages();
    setSaving(true);

    try {
      if (editingProfile) {
        const result = await updateUserProfile(editingProfile.id, {
          full_name: formName.trim() || undefined,
          role: formRole,
          role_details: formRole === "admin" ? null : (formRoleDetails.trim() || null),
        });
        if (!result.ok) throw new Error(`${t("admin.updateError")}: ${result.errorMessage}`);

        setProfiles((prev) =>
          prev.map((p) =>
            p.id === editingProfile.id
              ? {
                  ...p,
                  full_name: formName.trim() || null,
                  role: formRole,
                  role_details: formRole === "admin" ? null : (formRoleDetails.trim() || null),
                }
              : p
          )
        );
        setSuccess(t("admin.userUpdated"));
      } else {
        if (!formEmail.trim()) throw new Error(t("admin.emailRequired"));
        if (!formPassword || formPassword.length < 6) throw new Error(t("admin.passwordMinLength"));

        await adminCreateUser(
          formEmail.trim(),
          formPassword,
          formName.trim(),
          formRole,
          formRole === "admin" ? null : (formRoleDetails.trim() || null)
        );

        await loadProfiles();
        setSuccess(t("admin.userCreated"));
      }
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Profile) => {
    clearMessages();
    const msg = t("admin.confirmDelete", { name: p.full_name || p.email });
    if (!confirm(msg)) return;

    try {
      await adminDeleteUser(p.id);
      setProfiles((prev) => prev.filter((x) => x.id !== p.id));
      setSuccess(t("admin.userDeleted"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.deleteError"));
    }
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF" }}>{t("common.loading")}</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h1 style={{ margin: 0 }}>{t("admin.title")}</h1>
        <button onClick={openCreateModal} style={createBtnStyle}>{t("admin.createUser")}</button>
      </div>
      <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 20px" }}>
        {t("admin.subtitle")}
      </p>

      {error && (
        <div style={msgStyle("#FEF2F2", "#FECACA", "#DC2626")}>
          {error}
          <button onClick={() => setError("")} style={msgCloseBtnStyle}>&times;</button>
        </div>
      )}
      {success && (
        <div style={msgStyle("#F0FDF4", "#BBF7D0", "#16A34A")}>
          {success}
          <button onClick={() => setSuccess("")} style={msgCloseBtnStyle}>&times;</button>
        </div>
      )}

      {profiles.length === 0 ? (
        <p style={{ color: "#9CA3AF" }}>{t("admin.noUsers")}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: "#F3F4F6", borderBottom: "1px solid #E5E7EB" }}>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>{t("admin.fullName")}</th>
                <th style={thStyle}>{t("admin.mainRole")}</th>
                <th style={thStyle}>{t("admin.roleDetails")}</th>
                <th style={thStyle}>{t("admin.createdAt")}</th>
                <th style={{ ...thStyle, textAlign: "center", width: 100 }}>{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <td style={tdStyle}>{p.email}</td>
                  <td style={tdStyle}>{p.full_name || "—"}</td>
                  <td style={tdStyle}>
                    <span style={roleBadge(p.role)}>{ROLE_LABELS[p.role] || p.role}</span>
                  </td>
                  <td style={{ ...tdStyle, color: "#6B7280", fontSize: 13 }}>
                    {p.role !== "admin" && p.role_details ? p.role_details : "—"}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 13, color: "#6B7280" }}>
                    {new Date(p.created_at).toLocaleDateString(getIntlLocale())}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                      <button onClick={() => openEditModal(p)} style={actBtnStyle} title={t("admin.edit")}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(p)} style={delBtnStyle} title={t("admin.delete")}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Create / Edit Modal ===== */}
      {showModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {editingProfile ? t("admin.editUser") : t("admin.createUserTitle")}
              </h3>
              <button onClick={closeModal} style={closeBtnStyle}>&times;</button>
            </div>

            <form onSubmit={handleSave}>
              <div style={fldStyle}>
                <label style={lblStyle}>{t("admin.fullName")}</label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder={t("admin.fullNamePlaceholder")} style={inpStyle} />
              </div>

              {!editingProfile && (
                <>
                  <div style={fldStyle}>
                    <label style={lblStyle}>{`${t("admin.email")} *`}</label>
                    <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@example.com" style={inpStyle} required />
                  </div>
                  <div style={fldStyle}>
                    <label style={lblStyle}>{`${t("admin.password")} *`}</label>
                    <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder={t("admin.passwordPlaceholder")} style={inpStyle} required minLength={6} />
                  </div>
                </>
              )}

              <div style={fldStyle}>
                <label style={lblStyle}>{`${t("admin.mainRole")} *`}</label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)} style={selStyle}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              {formRole !== "admin" && (
                <div style={fldStyle}>
                  <label style={lblStyle}>{t("admin.roleDetails")}</label>
                  <input value={formRoleDetails} onChange={(e) => setFormRoleDetails(e.target.value)} placeholder={t("admin.roleDetailsPlaceholder")} style={inpStyle} />
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>{t("admin.roleDetailsHint")}</div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                <button type="button" onClick={closeModal} style={cancelBtnStyle}>{t("common.cancel")}</button>
                <button type="submit" disabled={saving} style={{ ...saveBtnStyle, opacity: saving ? 0.6 : 1 }}>
                  {saving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Styles
// ============================================================

const createBtnStyle: React.CSSProperties = {
  padding: "10px 20px", fontSize: 14, fontWeight: 600, borderRadius: 8,
  border: "none", background: "#111827", color: "#FFFFFF", cursor: "pointer",
};

const tableStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse", border: "1px solid #E5E7EB", borderRadius: 8, overflow: "hidden",
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px", textAlign: "left", fontSize: 13, fontWeight: 600, color: "#6B7280",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px", fontSize: 14, color: "#111827",
};

function roleBadge(role: string): React.CSSProperties {
  const c: Record<string, { bg: string; fg: string }> = {
    admin: { bg: "#FEF3C7", fg: "#92400E" },
    board_member: { bg: "#DBEAFE", fg: "#1E40AF" },
    executive: { bg: "#E0E7FF", fg: "#3730A3" },
    employee: { bg: "#F3F4F6", fg: "#374151" },
    corp_secretary: { bg: "#FDE68A", fg: "#78350F" },
    auditor: { bg: "#D1FAE5", fg: "#065F46" },
    management: { bg: "#E0E7FF", fg: "#3730A3" },
  };
  const v = c[role] || { bg: "#F3F4F6", fg: "#374151" };
  return { display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, background: v.bg, color: v.fg };
}

const actBtnStyle: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 6, border: "1px solid #D1D5DB",
  background: "#FFFFFF", color: "#6B7280", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const delBtnStyle: React.CSSProperties = {
  ...actBtnStyle, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626",
};

function msgStyle(bg: string, bdr: string, txt: string): React.CSSProperties {
  return { background: bg, border: `1px solid ${bdr}`, borderRadius: 8, padding: "10px 14px", color: txt, fontSize: 13, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" };
}

const msgCloseBtnStyle: React.CSSProperties = {
  background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "inherit", padding: "0 4px", lineHeight: 1,
};

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "#FFFFFF", borderRadius: 14, padding: 28, width: 480, maxWidth: "90vw",
  maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#9CA3AF", padding: 0, lineHeight: 1,
};

const fldStyle: React.CSSProperties = { marginBottom: 16 };

const lblStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4,
};

const inpStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", fontSize: 14, border: "1px solid #D1D5DB",
  borderRadius: 8, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const selStyle: React.CSSProperties = { ...inpStyle, cursor: "pointer", background: "#FFFFFF" };

const cancelBtnStyle: React.CSSProperties = {
  padding: "10px 20px", fontSize: 14, fontWeight: 500, borderRadius: 8,
  border: "1px solid #D1D5DB", background: "#FFFFFF", color: "#374151", cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "10px 24px", fontSize: 14, fontWeight: 600, borderRadius: 8,
  border: "none", background: "#3B82F6", color: "#FFFFFF", cursor: "pointer",
};
