import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import { getLocalizedName, getLocalizedRoleDetails, updateMyProfile } from "../lib/profile";
import {
  fetchMyProfileDetails,
  upsertProfileDetails,
  uploadAvatar,
  removeAvatar,
  type ProfileDetails,
  type BoardStatus,
} from "../lib/profileDetails";

interface Props {
  profile: Profile | null;
  org: Organization | null;
  onProfileUpdate?: () => void;
}

const BOARD_STATUSES: BoardStatus[] = ["independent", "executive", "non_executive", "employee"];

export default function ProfilePage({ profile, org, onProfileUpdate }: Props) {
  const { t, i18n } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [details, setDetails] = useState<ProfileDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Name fields (from profiles table)
  const [nameRu, setNameRu] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [nameUz, setNameUz] = useState("");

  // Form state
  const [form, setForm] = useState<Record<string, string | boolean | null>>({});

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    setNameRu(profile.full_name || "");
    setNameEn(profile.full_name_en || "");
    setNameUz(profile.full_name_uz || "");
    loadDetails();
  }, [profile?.id]);

  const loadDetails = async () => {
    const data = await fetchMyProfileDetails();
    setDetails(data);
    if (data) setForm(detailsToForm(data));
    setLoading(false);
  };

  const detailsToForm = (d: ProfileDetails): Record<string, string | boolean | null> => ({
    board_status: d.board_status || "",
    current_position_ru: d.current_position_ru || "",
    current_position_en: d.current_position_en || "",
    current_position_uz: d.current_position_uz || "",
    current_company_ru: d.current_company_ru || "",
    current_company_en: d.current_company_en || "",
    current_company_uz: d.current_company_uz || "",
    department_ru: d.department_ru || "",
    department_en: d.department_en || "",
    department_uz: d.department_uz || "",
    short_bio_ru: d.short_bio_ru || "",
    short_bio_en: d.short_bio_en || "",
    short_bio_uz: d.short_bio_uz || "",
    education_ru: d.education_ru || "",
    education_en: d.education_en || "",
    education_uz: d.education_uz || "",
    work_experience_ru: d.work_experience_ru || "",
    work_experience_en: d.work_experience_en || "",
    work_experience_uz: d.work_experience_uz || "",
    phone: d.phone || "",
    contact_email: d.contact_email || "",
    linkedin: d.linkedin || "",
    telegram: d.telegram || "",
    is_profile_public: d.is_profile_public,
    show_contacts: d.show_contacts,
  });

  const setField = (key: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    setError("");

    // Save name fields to profiles table
    const nameOk = await updateMyProfile({
      full_name: nameRu.trim() || undefined,
      full_name_en: nameEn.trim() || undefined,
      full_name_uz: nameUz.trim() || undefined,
    });
    if (!nameOk) {
      setError(t("common.error"));
      setSaving(false);
      return;
    }

    // Save other details to profile_details table
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(form)) {
      updates[k] = typeof v === "string" && !v.trim() ? null : v;
    }

    const result = await upsertProfileDetails(profile.id, updates);
    if (!result.ok) {
      setError(result.error || t("common.error"));
    } else {
      setSuccess(t("profile.saved"));
      setEditing(false);
      await loadDetails();
      onProfileUpdate?.();
    }
    setSaving(false);
  };

  const handleCancel = () => {
    if (details) setForm(detailsToForm(details));
    else setForm({});
    setNameRu(profile?.full_name || "");
    setNameEn(profile?.full_name_en || "");
    setNameUz(profile?.full_name_uz || "");
    setEditing(false);
    setError("");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadingPhoto(true);
    setError("");

    const result = await uploadAvatar(profile.id, file);
    if (!result.ok) {
      setError(result.error || t("common.error"));
    } else {
      setSuccess(t("profile.photoUploaded"));
      onProfileUpdate?.();
    }
    setUploadingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handlePhotoRemove = async () => {
    if (!profile) return;
    setUploadingPhoto(true);
    const result = await removeAvatar(profile.id);
    if (!result.ok) {
      setError(result.error || t("common.error"));
    } else {
      setSuccess(t("profile.photoRemoved"));
      onProfileUpdate?.();
    }
    setUploadingPhoto(false);
  };

  if (loading) return <div style={{ color: "#9CA3AF" }}>{t("common.loading")}</div>;
  if (!profile) return null;

  const displayName = getLocalizedName(profile, i18n.language);
  const displayRole = getLocalizedRoleDetails(profile, i18n.language);
  const avatarUrl = profile.avatar_url;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>{t("profile.title")}</h1>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>{t("profile.subtitle")}</p>

      {error && <div style={errorStyle}>{error}<button onClick={() => setError("")} style={closeBtn}>&times;</button></div>}
      {success && <div style={successStyle}>{success}<button onClick={() => setSuccess("")} style={closeBtn}>&times;</button></div>}

      {/* Header: Photo + Basic Info */}
      <div style={headerCardStyle}>
        <div style={{ position: "relative" }}>
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
          {org && <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>{org.name}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp" onChange={handlePhotoUpload} style={{ display: "none" }} />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto} style={btnSecondary}>
              {uploadingPhoto ? t("common.loading") : t("profile.uploadPhoto")}
            </button>
            {avatarUrl && (
              <button onClick={handlePhotoRemove} disabled={uploadingPhoto} style={{ ...btnSecondary, color: "#DC2626", borderColor: "#FECACA" }}>
                {t("profile.removePhoto")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Edit / View toggle */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, gap: 8 }}>
        {!editing ? (
          <button onClick={() => { setEditing(true); if (!details) setForm({}); }} style={btnPrimary}>
            {t("common.edit")}
          </button>
        ) : (
          <>
            <button onClick={handleCancel} style={btnSecondary}>{t("common.cancel")}</button>
            <button onClick={handleSave} disabled={saving} style={btnPrimary}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </>
        )}
      </div>

      {/* Translation reminder */}
      {editing && (
        <div style={infoBoxStyle}>
          {t("profile.manualTranslationNote")}
        </div>
      )}

      {/* Personal Info (Name) */}
      <Section title={t("profile.personalInfo")}>
        {editing ? (
          <div style={{ marginBottom: 12 }}>
            <div style={fieldLabelStyle}>{t("profile.fullName")}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={langLabelStyle}>RU</div>
                <input style={inputStyle} value={nameRu} onChange={(e) => setNameRu(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={langLabelStyle}>EN</div>
                <input style={inputStyle} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={langLabelStyle}>UZ</div>
                <input style={inputStyle} value={nameUz} onChange={(e) => setNameUz(e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
          <>
            {profile.full_name && <FieldRow label="RU" value={profile.full_name} />}
            {profile.full_name_en && <FieldRow label="EN" value={profile.full_name_en} />}
            {profile.full_name_uz && <FieldRow label="UZ" value={profile.full_name_uz} />}
            {!profile.full_name && !profile.full_name_en && !profile.full_name_uz && <EmptyState />}
          </>
        )}
      </Section>

      {/* Sections */}
      <Section title={t("profile.position")}>
        {editing ? (
          <>
            <SelectField label={t("profile.boardStatus")} value={(form.board_status as string) || ""} onChange={(v) => setField("board_status", v)}
              options={[{ value: "", label: "—" }, ...BOARD_STATUSES.map((s) => ({ value: s, label: t(`profile.boardStatus_${s}`) }))]} />
            <LangFields label={t("profile.currentPosition")} base="current_position" form={form} setField={setField} editing />
            <LangFields label={t("profile.currentCompany")} base="current_company" form={form} setField={setField} editing />
            <LangFields label={t("profile.department")} base="department" form={form} setField={setField} editing />
          </>
        ) : (
          <ViewFields details={details} fields={[
            { label: t("profile.boardStatus"), value: details?.board_status ? t(`profile.boardStatus_${details.board_status}`) : "" },
            { label: t("profile.currentPosition"), base: "current_position" },
            { label: t("profile.currentCompany"), base: "current_company" },
            { label: t("profile.department"), base: "department" },
          ]} />
        )}
      </Section>

      <Section title={t("profile.biography")}>
        {editing ? (
          <LangTextareas label={t("profile.shortBio")} base="short_bio" form={form} setField={setField} />
        ) : (
          <ViewFields details={details} fields={[{ label: t("profile.shortBio"), base: "short_bio" }]} />
        )}
      </Section>

      <Section title={t("profile.education")}>
        {editing ? (
          <LangTextareas label={t("profile.education")} base="education" form={form} setField={setField} />
        ) : (
          <ViewFields details={details} fields={[{ label: t("profile.education"), base: "education" }]} />
        )}
      </Section>

      <Section title={t("profile.workExperience")}>
        {editing ? (
          <LangTextareas label={t("profile.workExperience")} base="work_experience" form={form} setField={setField} />
        ) : (
          <ViewFields details={details} fields={[{ label: t("profile.workExperience"), base: "work_experience" }]} />
        )}
      </Section>

      <Section title={t("profile.contacts")}>
        {editing ? (
          <>
            <InputField label={t("profile.phone")} value={(form.phone as string) || ""} onChange={(v) => setField("phone", v)} />
            <InputField label={t("profile.contactEmail")} value={(form.contact_email as string) || ""} onChange={(v) => setField("contact_email", v)} />
            <InputField label="LinkedIn" value={(form.linkedin as string) || ""} onChange={(v) => setField("linkedin", v)} />
            <InputField label="Telegram" value={(form.telegram as string) || ""} onChange={(v) => setField("telegram", v)} />
          </>
        ) : (
          <>
            {details?.phone && <FieldRow label={t("profile.phone")} value={details.phone} />}
            {details?.contact_email && <FieldRow label={t("profile.contactEmail")} value={details.contact_email} />}
            {details?.linkedin && <FieldRow label="LinkedIn" value={details.linkedin} />}
            {details?.telegram && <FieldRow label="Telegram" value={details.telegram} />}
            {!details?.phone && !details?.contact_email && !details?.linkedin && !details?.telegram && (
              <EmptyState text={t("profile.noData")} />
            )}
          </>
        )}
      </Section>

      <Section title={t("profile.privacy")}>
        {editing ? (
          <>
            <CheckboxField label={t("profile.isProfilePublic")} checked={!!form.is_profile_public} onChange={(v) => setField("is_profile_public", v)} />
            <CheckboxField label={t("profile.showContacts")} checked={!!form.show_contacts} onChange={(v) => setField("show_contacts", v)} />
          </>
        ) : (
          <>
            <FieldRow label={t("profile.isProfilePublic")} value={details?.is_profile_public ? t("common.yes") : t("common.no")} />
            <FieldRow label={t("profile.showContacts")} value={details?.show_contacts ? t("common.yes") : t("common.no")} />
          </>
        )}
      </Section>
    </div>
  );
}

// ── Helper components ────────────────────────────────────────────────

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={sectionStyle}>
      <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#111827" }}>{title}</h3>
      {children}
    </div>
  );
}

function LangFields({ label, base, form, setField, editing }: {
  label: string; base: string; form: Record<string, string | boolean | null>; setField: (k: string, v: string) => void; editing?: boolean;
}) {
  if (!editing) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={fieldLabelStyle}>{label}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={langLabelStyle}>RU</div>
          <input style={inputStyle} value={(form[`${base}_ru`] as string) || ""} onChange={(e) => setField(`${base}_ru`, e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={langLabelStyle}>EN</div>
          <input style={inputStyle} value={(form[`${base}_en`] as string) || ""} onChange={(e) => setField(`${base}_en`, e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={langLabelStyle}>UZ</div>
          <input style={inputStyle} value={(form[`${base}_uz`] as string) || ""} onChange={(e) => setField(`${base}_uz`, e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function LangTextareas({ label, base, form, setField }: {
  label: string; base: string; form: Record<string, string | boolean | null>; setField: (k: string, v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={fieldLabelStyle}>{label}</div>
      {(["ru", "en", "uz"] as const).map((lang) => (
        <div key={lang} style={{ marginBottom: 8 }}>
          <div style={langLabelStyle}>{lang.toUpperCase()}</div>
          <textarea
            style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
            value={(form[`${base}_${lang}`] as string) || ""}
            onChange={(e) => setField(`${base}_${lang}`, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

function InputField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={fieldLabelStyle}>{label}</div>
      <input style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={fieldLabelStyle}>{label}</div>
      <select style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer", fontSize: 14 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <span style={{ fontSize: 13, color: "#6B7280" }}>{label}: </span>
      <span style={{ fontSize: 14, color: "#111827" }}>{value}</span>
    </div>
  );
}

function ViewFields({ details, fields }: {
  details: ProfileDetails | null;
  fields: { label: string; base?: string; value?: string }[];
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language;

  const hasAny = fields.some((f) => {
    if (f.value) return !!f.value;
    if (!f.base || !details) return false;
    const suffix = lang === "uz-Cyrl" ? "uz" : lang === "en" ? "en" : "ru";
    const key = `${f.base}_${suffix}` as keyof ProfileDetails;
    const ruKey = `${f.base}_ru` as keyof ProfileDetails;
    return (details[key] && String(details[key]).trim()) || (details[ruKey] && String(details[ruKey]).trim());
  });

  if (!hasAny) return <EmptyState />;

  return (
    <>
      {fields.map((f, i) => {
        let val = f.value || "";
        if (!val && f.base && details) {
          const suffix = lang === "uz-Cyrl" ? "uz" : lang === "en" ? "en" : "ru";
          const key = `${f.base}_${suffix}` as keyof ProfileDetails;
          val = (details[key] as string) || "";
          if (!val) {
            const ruKey = `${f.base}_ru` as keyof ProfileDetails;
            val = (details[ruKey] as string) || "";
          }
        }
        if (!val) return null;
        return <FieldRow key={i} label={f.label} value={val} />;
      })}
    </>
  );
}

function EmptyState({ text }: { text?: string }) {
  const { t } = useTranslation();
  return <div style={{ color: "#9CA3AF", fontSize: 14, fontStyle: "italic" }}>{text || t("profile.noData")}</div>;
}

// ── Styles ────────────────────────────────────────────────────────────

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

const fieldLabelStyle: React.CSSProperties = { fontSize: 13, color: "#6B7280", marginBottom: 4, fontWeight: 500 };
const langLabelStyle: React.CSSProperties = { fontSize: 11, color: "#9CA3AF", marginBottom: 2 };

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid #D1D5DB",
  borderRadius: 6, boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  padding: "8px 20px", fontSize: 14, borderRadius: 6, border: "none",
  background: "#2563EB", color: "#fff", cursor: "pointer", fontWeight: 500,
};
const btnSecondary: React.CSSProperties = {
  padding: "8px 16px", fontSize: 14, borderRadius: 6, border: "1px solid #D1D5DB",
  background: "transparent", cursor: "pointer",
};

const errorStyle: React.CSSProperties = {
  padding: "10px 16px", background: "#FEF2F2", border: "1px solid #FECACA",
  borderRadius: 8, color: "#DC2626", fontSize: 14, marginBottom: 12,
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const successStyle: React.CSSProperties = {
  padding: "10px 16px", background: "#F0FDF4", border: "1px solid #BBF7D0",
  borderRadius: 8, color: "#16A34A", fontSize: 14, marginBottom: 12,
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const closeBtn: React.CSSProperties = {
  background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "inherit", padding: "0 4px",
};
const infoBoxStyle: React.CSSProperties = {
  padding: "12px 16px", background: "#EFF6FF", border: "1px solid #BFDBFE",
  borderRadius: 8, color: "#1E40AF", fontSize: 13, lineHeight: 1.5, marginBottom: 16,
};
