import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getLocalizedName, getLocalizedRoleDetails } from "../lib/profile";
import { fetchProfileDetails, getDetailField, type ProfileDetails } from "../lib/profileDetails";

interface MemberProfile {
  id: string;
  full_name: string;
  full_name_en?: string | null;
  full_name_uz?: string | null;
  role: string;
  role_details?: string | null;
  role_details_en?: string | null;
  role_details_uz?: string | null;
  avatar_url?: string | null;
}

interface Props {
  member: MemberProfile;
  currentProfileId?: string;
  isAdmin?: boolean;
  onClose: () => void;
  onMessage?: () => void;
}

const BOARD_ROLES = ["board_member", "chairman"];
const EXEC_ROLES = ["executive"];

export default function ProfileModal({ member, currentProfileId, isAdmin, onClose, onMessage }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfileDetails(member.id).then((d) => {
      setDetails(d);
      setLoading(false);
    });
  }, [member.id]);

  const displayName = getLocalizedName(member, i18n.language);
  const displayRole = getLocalizedRoleDetails(member, i18n.language);
  const isSelf = member.id === currentProfileId;
  const canSeeContacts = isAdmin || details?.show_contacts;
  const isBoard = BOARD_ROLES.includes(member.role);
  const isExec = EXEC_ROLES.includes(member.role);

  const position = getDetailField(details, "current_position", i18n.language);
  const company = getDetailField(details, "current_company", i18n.language);
  const department = getDetailField(details, "department", i18n.language);
  const bio = getDetailField(details, "short_bio", i18n.language);
  const education = getDetailField(details, "education", i18n.language);
  const experience = getDetailField(details, "work_experience", i18n.language);

  const boardStatusLabel = details?.board_status ? t(`profile.boardStatus_${details.board_status}`) : "";

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button onClick={onClose} style={closeBtnStyle}>&times;</button>

        {/* Header */}
        <div style={headerStyle}>
          {member.avatar_url ? (
            <img src={member.avatar_url} alt="" style={avatarStyle} />
          ) : (
            <div style={{ ...avatarStyle, background: "#3B82F6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 700 }}>
              {getInitials(displayName)}
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#111827" }}>{displayName}</div>
            <div style={{ fontSize: 14, color: "#6B7280", marginTop: 2 }}>{t(`roles.${member.role}`)}</div>
            {displayRole && <div style={{ fontSize: 14, fontWeight: 500, color: "#374151", marginTop: 4 }}>{displayRole}</div>}
            {isBoard && boardStatusLabel && (
              <span style={statusBadgeStyle}>{boardStatusLabel}</span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "#9CA3AF" }}>{t("common.loading")}</div>
        ) : (
          <div style={{ maxHeight: "50vh", overflowY: "auto", padding: "0 24px 24px" }}>
            {/* Position & Company */}
            {position && <InfoRow icon="briefcase" label={t("profile.currentPosition")} value={position} />}
            {company && <InfoRow icon="building" label={t("profile.currentCompany")} value={company} />}
            {department && <InfoRow icon="folder" label={t("profile.department")} value={department} />}

            {/* Bio */}
            {bio && (
              <InfoBlock title={t("profile.shortBio")} text={bio} />
            )}

            {/* Education */}
            {education && (isBoard || isExec) && (
              <InfoBlock title={t("profile.education")} text={education} />
            )}

            {/* Experience */}
            {experience && (isBoard || isExec) && (
              <InfoBlock title={t("profile.workExperience")} text={experience} />
            )}

            {/* Contacts */}
            {canSeeContacts && (details?.phone || details?.contact_email || details?.linkedin || details?.telegram) && (
              <div style={{ marginTop: 16 }}>
                <div style={blockTitleStyle}>{t("profile.contacts")}</div>
                {details?.phone && <InfoRow icon="phone" label={t("profile.phone")} value={details.phone} />}
                {details?.contact_email && <InfoRow icon="mail" label="Email" value={details.contact_email} />}
                {details?.linkedin && <InfoRow icon="link" label="LinkedIn" value={details.linkedin} />}
                {details?.telegram && <InfoRow icon="send" label="Telegram" value={details.telegram} />}
              </div>
            )}

            {/* No details filled */}
            {!position && !company && !bio && !education && !experience && (
              <div style={{ padding: "16px 0", color: "#9CA3AF", fontSize: 14, fontStyle: "italic" }}>
                {t("profile.noData")}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={actionsStyle}>
          {!isSelf && onMessage && (
            <button onClick={() => { onClose(); onMessage(); }} style={msgBtnStyle}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
              {t("company.sendMessage")}
            </button>
          )}
          {(isSelf || isAdmin) && (
            <button onClick={() => { onClose(); navigate(isSelf ? "/profile" : `/profile/${member.id}`); }} style={profileBtnStyle}>
              {t("profile.goToProfile")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function InfoRow({ label, value }: { icon: string; label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10, fontSize: 14 }}>
      <span style={{ color: "#6B7280", minWidth: 100, flexShrink: 0 }}>{label}:</span>
      <span style={{ color: "#111827" }}>{value}</span>
    </div>
  );
}

function InfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={blockTitleStyle}>{title}</div>
      <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{text}</div>
    </div>
  );
}

// ── Styles ──

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
  alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520,
  maxHeight: "85vh", display: "flex", flexDirection: "column",
  boxShadow: "0 20px 60px rgba(0,0,0,0.2)", position: "relative",
};
const closeBtnStyle: React.CSSProperties = {
  position: "absolute", top: 12, right: 16, background: "none", border: "none",
  fontSize: 24, cursor: "pointer", color: "#9CA3AF", zIndex: 1,
};
const headerStyle: React.CSSProperties = {
  display: "flex", gap: 20, alignItems: "flex-start", padding: 24, borderBottom: "1px solid #F3F4F6",
};
const avatarStyle: React.CSSProperties = {
  width: 80, height: 80, borderRadius: "50%", objectFit: "cover", flexShrink: 0,
};
const statusBadgeStyle: React.CSSProperties = {
  display: "inline-block", padding: "2px 10px", borderRadius: 10, fontSize: 12,
  fontWeight: 500, background: "#EDE9FE", color: "#5B21B6", marginTop: 6,
};
const blockTitleStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, color: "#6B7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.03em",
};
const actionsStyle: React.CSSProperties = {
  display: "flex", gap: 8, padding: "16px 24px", borderTop: "1px solid #F3F4F6",
};
const msgBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 14,
  fontWeight: 500, borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff",
  color: "#374151", cursor: "pointer",
};
const profileBtnStyle: React.CSSProperties = {
  padding: "8px 16px", fontSize: 14, fontWeight: 500, borderRadius: 8, border: "none",
  background: "#2563EB", color: "#fff", cursor: "pointer",
};
