import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { getLocalizedName, getLocalizedRoleDetails, type Profile } from "../lib/profile";
import { fetchProfileDetails, type ProfileDetails } from "../lib/profileDetails";

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: "#6B7280" }}>{label}: </span>
      <span style={{ fontSize: 14, color: "#111827" }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#111827" }}>{title}</h3>
      {children}
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return <div style={{ color: "#9CA3AF", fontSize: 14, fontStyle: "italic" }}>{t("profile.noData")}</div>;
}

function getLocalizedField(details: ProfileDetails, base: string, lang: string): string {
  const suffix = lang === "uz-Cyrl" ? "uz" : lang === "en" ? "en" : "ru";
  const key = `${base}_${suffix}` as keyof ProfileDetails;
  const ruKey = `${base}_ru` as keyof ProfileDetails;
  return (details[key] as string) || (details[ruKey] as string) || "";
}

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) { setNotFound(true); setLoading(false); return; }
      setProfile(data as Profile);
      const d = await fetchProfileDetails(id);
      setDetails(d);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div style={{ color: "#9CA3AF" }}>{t("common.loading")}</div>;
  if (notFound || !profile) return <div style={{ color: "#9CA3AF" }}>{t("common.loadError")}</div>;

  const displayName = getLocalizedName(profile, lang);
  const displayRole = getLocalizedRoleDetails(profile, lang);
  const avatarUrl = profile.avatar_url;
  const showContacts = details?.show_contacts !== false;

  const position = details ? getLocalizedField(details, "current_position", lang) : "";
  const company = details ? getLocalizedField(details, "current_company", lang) : "";
  const department = details ? getLocalizedField(details, "department", lang) : "";
  const shortBio = details ? getLocalizedField(details, "short_bio", lang) : "";
  const education = details ? getLocalizedField(details, "education", lang) : "";
  const workExp = details ? getLocalizedField(details, "work_experience", lang) : "";

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <button
        onClick={() => navigate(-1)}
        style={backBtnStyle}
      >
        ← {t("common.back")}
      </button>

      {/* Header */}
      <div style={headerCardStyle}>
        <div>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" style={avatarLargeStyle} />
          ) : (
            <div style={{ ...avatarLargeStyle, background: "#3B82F6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 700 }}>
              {getInitials(displayName)}
            </div>
          )}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>{displayName}</div>
          <div style={{ fontSize: 14, color: "#6B7280", marginTop: 2 }}>{t(`roles.${profile.role}`)}</div>
          {displayRole && <div style={{ fontSize: 14, fontWeight: 500, color: "#374151", marginTop: 4 }}>{displayRole}</div>}
          {position && <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>{position}</div>}
          {company && <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 2 }}>{company}</div>}
        </div>
      </div>

      {/* Position */}
      {(details?.board_status || position || company || department) && (
        <Section title={t("profile.position")}>
          {details?.board_status && <FieldRow label={t("profile.boardStatus")} value={t(`profile.boardStatus_${details.board_status}`)} />}
          {position && <FieldRow label={t("profile.currentPosition")} value={position} />}
          {company && <FieldRow label={t("profile.currentCompany")} value={company} />}
          {department && <FieldRow label={t("profile.department")} value={department} />}
          {!details?.board_status && !position && !company && !department && <EmptyState />}
        </Section>
      )}

      {/* Biography */}
      {shortBio && (
        <Section title={t("profile.biography")}>
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{shortBio}</div>
        </Section>
      )}

      {/* Education */}
      {education && (
        <Section title={t("profile.education")}>
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{education}</div>
        </Section>
      )}

      {/* Work experience */}
      {workExp && (
        <Section title={t("profile.workExperience")}>
          <div style={{ fontSize: 14, color: "#374151", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{workExp}</div>
        </Section>
      )}

      {/* Contacts */}
      {showContacts && (details?.phone || details?.contact_email || details?.linkedin || details?.telegram) && (
        <Section title={t("profile.contacts")}>
          {details.phone && <FieldRow label={t("profile.phone")} value={details.phone} />}
          {details.contact_email && <FieldRow label={t("profile.contactEmail")} value={details.contact_email} />}
          {details.linkedin && <FieldRow label="LinkedIn" value={details.linkedin} />}
          {details.telegram && <FieldRow label="Telegram" value={details.telegram} />}
        </Section>
      )}
    </div>
  );
}

const headerCardStyle: React.CSSProperties = {
  display: "flex", gap: 24, alignItems: "flex-start", padding: 24,
  background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, marginBottom: 24,
};

const avatarLargeStyle: React.CSSProperties = {
  width: 100, height: 100, borderRadius: "50%", objectFit: "cover",
};

const sectionStyle: React.CSSProperties = {
  padding: 24, background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, marginBottom: 16,
};

const backBtnStyle: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 14, color: "#6B7280", padding: "0 0 16px",
  display: "flex", alignItems: "center", gap: 4,
};
