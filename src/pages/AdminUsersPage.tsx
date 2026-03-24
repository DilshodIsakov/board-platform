import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  getAllProfiles,
  updateUserProfile,
  adminInviteUser,
  adminCreateUser,
  adminApproveUser,
  adminRejectUser,
  adminResetPassword,
  adminDeleteUser,
  ROLE_OPTIONS,
  ROLE_LABELS,
  type Profile,
  type UserRole,
  getLocalizedName,
} from "../lib/profile";
import { getIntlLocale } from "../i18n";

export default function AdminUsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"invite" | "edit">("invite");
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);

  // Approve modal
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingProfile, setApprovingProfile] = useState<Profile | null>(null);
  const [approveRole, setApproveRole] = useState<UserRole>("board_member");
  const [approveRoleDetails, setApproveRoleDetails] = useState("");

  const { t, i18n } = useTranslation();

  // Form fields
  const [formNameRu, setFormNameRu] = useState("");
  const [formNameEn, setFormNameEn] = useState("");
  const [formNameUz, setFormNameUz] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("board_member");
  const [formRoleDetailsRu, setFormRoleDetailsRu] = useState("");
  const [formRoleDetailsEn, setFormRoleDetailsEn] = useState("");
  const [formRoleDetailsUz, setFormRoleDetailsUz] = useState("");
  const [createWithPassword, setCreateWithPassword] = useState(false);

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

  const pendingProfiles = profiles.filter((p) => p.approval_status === "pending");
  const approvedProfiles = profiles.filter((p) => p.approval_status !== "pending");

  const resetFormFields = () => {
    setFormNameRu(""); setFormNameEn(""); setFormNameUz("");
    setFormEmail(""); setFormPassword("");
    setFormRole("board_member");
    setFormRoleDetailsRu(""); setFormRoleDetailsEn(""); setFormRoleDetailsUz("");
  };

  // ===== Invite modal =====
  const openInviteModal = () => {
    clearMessages();
    setModalMode("invite");
    setEditingProfile(null);
    resetFormFields();
    setCreateWithPassword(false);
    setShowModal(true);
  };

  const openCreateModal = () => {
    clearMessages();
    setModalMode("invite");
    setEditingProfile(null);
    resetFormFields();
    setCreateWithPassword(true);
    setShowModal(true);
  };

  // ===== Edit modal =====
  const openEditModal = (p: Profile) => {
    clearMessages();
    setModalMode("edit");
    setEditingProfile(p);
    setFormNameRu(p.full_name || "");
    setFormNameEn(p.full_name_en || "");
    setFormNameUz(p.full_name_uz || "");
    setFormEmail(p.email);
    setFormRole(p.role);
    setFormRoleDetailsRu(p.role_details || "");
    setFormRoleDetailsEn(p.role_details_en || "");
    setFormRoleDetailsUz(p.role_details_uz || "");
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
      const noRD = formRole === "admin";
      const userData = {
        full_name: formNameRu.trim(),
        full_name_en: formNameEn.trim() || null,
        full_name_uz: formNameUz.trim() || null,
        role: formRole,
        role_details: noRD ? null : (formRoleDetailsRu.trim() || null),
        role_details_en: noRD ? null : (formRoleDetailsEn.trim() || null),
        role_details_uz: noRD ? null : (formRoleDetailsUz.trim() || null),
      };

      if (modalMode === "edit" && editingProfile) {
        const result = await updateUserProfile(editingProfile.id, userData);
        if (!result.ok) throw new Error(`${t("admin.updateError")}: ${result.errorMessage}`);

        setProfiles((prev) =>
          prev.map((p) =>
            p.id === editingProfile.id
              ? { ...p, ...userData, full_name: userData.full_name || null }
              : p
          )
        );
        setSuccess(t("admin.userUpdated"));
      } else {
        if (!formEmail.trim()) throw new Error(t("admin.emailRequired"));

        if (createWithPassword) {
          if (!formPassword || formPassword.length < 6) throw new Error(t("admin.passwordMinLength"));
          await adminCreateUser(formEmail.trim(), formPassword, userData);
          await loadProfiles();
          setSuccess(t("admin.userCreated"));
        } else {
          await adminInviteUser(formEmail.trim(), userData);
          await loadProfiles();
          setSuccess(t("admin.inviteSent"));
        }
      }
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  // ===== Approve =====
  const openApproveModal = (p: Profile) => {
    clearMessages();
    setApprovingProfile(p);
    setApproveRole(p.role || "board_member");
    setApproveRoleDetails(p.role_details || "");
    setShowApproveModal(true);
  };

  const handleApprove = async (e: FormEvent) => {
    e.preventDefault();
    if (!approvingProfile) return;
    clearMessages();
    setSaving(true);
    try {
      await adminApproveUser(
        approvingProfile.id,
        approveRole,
        approveRole === "admin" ? null : (approveRoleDetails.trim() || null)
      );
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === approvingProfile.id
            ? { ...p, approval_status: "approved" as const, role: approveRole, role_details: approveRoleDetails.trim() || null }
            : p
        )
      );
      setSuccess(t("admin.userApproved"));
      setShowApproveModal(false);
      setApprovingProfile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  // ===== Reject =====
  const handleReject = async (p: Profile) => {
    clearMessages();
    const msg = t("admin.rejectConfirm", { name: getLocalizedName(p, i18n.language) || p.email });
    if (!confirm(msg)) return;
    try {
      await adminRejectUser(p.id);
      setProfiles((prev) => prev.filter((x) => x.id !== p.id));
      setSuccess(t("admin.userRejected"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  // ===== Reset password =====
  const handleResetPassword = async (p: Profile) => {
    clearMessages();
    const msg = t("admin.resetPasswordConfirm", { email: p.email });
    if (!confirm(msg)) return;
    try {
      await adminResetPassword(p.id);
      setSuccess(t("admin.resetPasswordSent"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    }
  };

  // ===== Delete =====
  const handleDelete = async (p: Profile) => {
    clearMessages();
    const msg = t("admin.confirmDelete", { name: getLocalizedName(p, i18n.language) || p.email });
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
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={openCreateModal} style={{ ...createBtnStyle, background: "#3B82F6" }}>{t("admin.createUser")}</button>
          <button onClick={openInviteModal} style={createBtnStyle}>{t("admin.inviteUser")}</button>
        </div>
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

      {/* ===== Pending Approvals Section ===== */}
      {pendingProfiles.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#B45309", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: "50%", background: "#FEF3C7", color: "#B45309", fontSize: 13, fontWeight: 700 }}>
              {pendingProfiles.length}
            </span>
            {t("admin.pendingApprovals")}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pendingProfiles.map((p) => (
              <div key={p.id} style={pendingCardStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>
                    {getLocalizedName(p, i18n.language) || p.email}
                  </div>
                  <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>
                    {p.email}
                  </div>
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>
                    {new Date(p.created_at).toLocaleDateString(getIntlLocale())}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => openApproveModal(p)} style={approveBtnStyle}>
                    {t("admin.approve")}
                  </button>
                  <button onClick={() => handleReject(p)} style={rejectBtnStyle}>
                    {t("admin.reject")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Users Table ===== */}
      {approvedProfiles.length === 0 ? (
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
                <th style={{ ...thStyle, textAlign: "center", width: 140 }}>{t("admin.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {approvedProfiles.map((p) => (
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
                      <button onClick={() => handleResetPassword(p)} style={actBtnStyle} title={t("admin.resetPassword")}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0110 0v4" />
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

      {/* ===== Invite / Edit Modal ===== */}
      {showModal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {modalMode === "edit" ? t("admin.editUser") : (createWithPassword ? t("admin.createUserTitle") : t("admin.inviteUserTitle"))}
              </h3>
              <button onClick={closeModal} style={closeBtnStyle}>&times;</button>
            </div>

            <form onSubmit={handleSave}>
              {modalMode === "invite" && (
                <>
                  {/* Toggle: invite vs create */}
                  <div style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: 8, overflow: "hidden", border: "1px solid #D1D5DB" }}>
                    <button type="button" onClick={() => { setCreateWithPassword(false); setFormPassword(""); }}
                      style={{ flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                        background: !createWithPassword ? "#111827" : "#F9FAFB", color: !createWithPassword ? "#fff" : "#6B7280" }}>
                      {t("admin.inviteUser")}
                    </button>
                    <button type="button" onClick={() => setCreateWithPassword(true)}
                      style={{ flex: 1, padding: "9px 0", fontSize: 13, fontWeight: 600, border: "none", borderLeft: "1px solid #D1D5DB", cursor: "pointer",
                        background: createWithPassword ? "#111827" : "#F9FAFB", color: createWithPassword ? "#fff" : "#6B7280" }}>
                      {t("admin.createUser")}
                    </button>
                  </div>

                  <div style={fldStyle}>
                    <label style={lblStyle}>{`${t("admin.email")} *`}</label>
                    <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="user@example.com" style={inpStyle} required />
                  </div>
                </>
              )}

              {/* ФИО — 3 языка */}
              <div style={fldStyle}>
                <label style={lblStyle}>{t("admin.fullName")} (RU)</label>
                <input value={formNameRu} onChange={(e) => setFormNameRu(e.target.value)} placeholder={t("admin.fullNamePlaceholder")} style={inpStyle} />
              </div>
              <div style={fldStyle}>
                <label style={lblStyle}>{t("admin.fullName")} (EN)</label>
                <input value={formNameEn} onChange={(e) => setFormNameEn(e.target.value)} placeholder="Full Name" style={inpStyle} />
              </div>
              <div style={fldStyle}>
                <label style={lblStyle}>{t("admin.fullName")} (UZ)</label>
                <input value={formNameUz} onChange={(e) => setFormNameUz(e.target.value)} placeholder="Тўлиқ исм" style={inpStyle} />
              </div>

              {modalMode === "invite" && createWithPassword && (
                <div style={fldStyle}>
                  <label style={lblStyle}>{`${t("admin.password")} *`}</label>
                  <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder={t("admin.passwordPlaceholder")} style={inpStyle} required minLength={6} />
                </div>
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
                <>
                  <div style={fldStyle}>
                    <label style={lblStyle}>{t("admin.roleDetails")} (RU)</label>
                    <input value={formRoleDetailsRu} onChange={(e) => setFormRoleDetailsRu(e.target.value)} placeholder={t("admin.roleDetailsPlaceholder")} style={inpStyle} />
                    <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>{t("admin.roleDetailsHint")}</div>
                  </div>
                  <div style={fldStyle}>
                    <label style={lblStyle}>{t("admin.roleDetails")} (EN)</label>
                    <input value={formRoleDetailsEn} onChange={(e) => setFormRoleDetailsEn(e.target.value)} placeholder="e.g. Chairman of Audit Committee" style={inpStyle} />
                  </div>
                  <div style={fldStyle}>
                    <label style={lblStyle}>{t("admin.roleDetails")} (UZ)</label>
                    <input value={formRoleDetailsUz} onChange={(e) => setFormRoleDetailsUz(e.target.value)} placeholder="Масалан: Аудит қўмитаси раиси" style={inpStyle} />
                  </div>
                </>
              )}

              {modalMode === "invite" && !createWithPassword && (
                <div style={{ fontSize: 13, color: "#6B7280", background: "#F9FAFB", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px", marginTop: 8 }}>
                  {t("admin.inviteHint")}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                <button type="button" onClick={closeModal} style={cancelBtnStyle}>{t("common.cancel")}</button>
                <button type="submit" disabled={saving} style={{ ...saveBtnStyle, opacity: saving ? 0.6 : 1 }}>
                  {saving ? t("common.saving") : modalMode === "edit" ? t("common.save") : (createWithPassword ? t("admin.createUser") : t("admin.inviteUser"))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== Approve Modal ===== */}
      {showApproveModal && approvingProfile && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                {t("admin.approve")}: {approvingProfile.full_name || approvingProfile.email}
              </h3>
              <button onClick={() => { setShowApproveModal(false); setApprovingProfile(null); }} style={closeBtnStyle}>&times;</button>
            </div>

            <form onSubmit={handleApprove}>
              <div style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
                {approvingProfile.email}
              </div>

              <div style={fldStyle}>
                <label style={lblStyle}>{`${t("admin.mainRole")} *`}</label>
                <select value={approveRole} onChange={(e) => setApproveRole(e.target.value as UserRole)} style={selStyle}>
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              {approveRole !== "admin" && (
                <div style={fldStyle}>
                  <label style={lblStyle}>{t("admin.roleDetails")}</label>
                  <input value={approveRoleDetails} onChange={(e) => setApproveRoleDetails(e.target.value)} placeholder={t("admin.roleDetailsPlaceholder")} style={inpStyle} />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
                <button type="button" onClick={() => { setShowApproveModal(false); setApprovingProfile(null); }} style={cancelBtnStyle}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={saving} style={{ ...approveBtnStyle, opacity: saving ? 0.6 : 1, padding: "10px 24px" }}>
                  {saving ? t("common.saving") : t("admin.approve")}
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

const pendingCardStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10,
  padding: "14px 18px",
};

const approveBtnStyle: React.CSSProperties = {
  padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 7,
  border: "none", background: "#16A34A", color: "#FFFFFF", cursor: "pointer",
};

const rejectBtnStyle: React.CSSProperties = {
  padding: "7px 16px", fontSize: 13, fontWeight: 600, borderRadius: 7,
  border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer",
};

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
