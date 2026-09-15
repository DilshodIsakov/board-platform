import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchCommitteeById,
  fetchCommitteeMembers,
  fetchCommitteeMeetings,
  createCommitteeMeeting,
  committeeTypeColor,
  committeeTypeIcon,
  type Committee,
  type CommitteeMeeting,
  type CommitteeMember,
} from "../lib/committees";
import { getLocalizedField } from "../lib/i18nHelpers";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

export default function CommitteeMeetingsPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isAdmin = profile?.role === "admin" || profile?.role === "corp_secretary";

  const [committee, setCommittee] = useState<Committee | null>(null);
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [meetings, setMeetings] = useState<CommitteeMeeting[]>([]);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", title_en: "", title_uz: "", start_at: "", location: "", notes: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (id) loadAll(id); }, [id]);

  const loadAll = async (committeeId: string) => {
    setLoading(true);
    const [c, mems, mtgs] = await Promise.all([
      fetchCommitteeById(committeeId),
      fetchCommitteeMembers(committeeId),
      fetchCommitteeMeetings(committeeId),
    ]);
    setCommittee(c);
    setMembers(mems);
    setMeetings(mtgs);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.title.trim() || !form.start_at || !profile || !org || !id) return;
    setCreating(true);
    const created = await createCommitteeMeeting({
      committee_id: id,
      org_id: org.id,
      title: form.title.trim(),
      title_en: form.title_en.trim() || undefined,
      title_uz: form.title_uz.trim() || undefined,
      start_at: form.start_at,
      location: form.location.trim() || undefined,
      notes: form.notes.trim() || undefined,
      created_by: profile.id,
    });
    if (created) {
      setShowCreate(false);
      setForm({ title: "", title_en: "", title_uz: "", start_at: "", location: "", notes: "" });
      navigate(`/committees/${id}/meetings/${created.id}`);
    }
    setCreating(false);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300, color: "#8d8d8d" }}>
      {t("common.loading")}
    </div>
  );

  if (!committee) return (
    <div style={{ color: "#da1e28", padding: 32 }}>{t("common.notFound")}</div>
  );

  const color = committeeTypeColor(committee.type);
  const icon = committeeTypeIcon(committee.type);
  const name = getLocalizedField(committee as unknown as Record<string, unknown>, "name");
  const isMember = members.some((m) => m.profile_id === profile?.id);
  const myRole = members.find((m) => m.profile_id === profile?.id)?.role;

  const scheduled = meetings.filter((m) => m.status === "scheduled");
  const completed = meetings.filter((m) => m.status === "completed");

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      {/* Back */}
      <button
        onClick={() => navigate("/committees")}
        style={{ background: "none", border: "none", color: "#525252", cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0, display: "flex", alignItems: "center", gap: 6 }}
      >
        ← {t("committees.backToCommittees")}
      </button>

      {/* Header card */}
      <div style={{
        background: color,
        borderRadius: 0,
        padding: "24px 28px",
        marginBottom: 24,
        color: "#fff",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 34, marginBottom: 6, lineHeight: 1 }}>{icon}</div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{name}</h1>
            <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, opacity: 0.9 }}>
              <span>{members.length} {t("committees.membersCount")}</span>
              <span>{meetings.length} {t("committees.meetingsCount")}</span>
              {myRole && (
                <span style={{ background: "rgba(255,255,255,0.22)", padding: "2px 10px", borderRadius: 0, fontWeight: 600 }}>
                  {myRole === "chair" ? t("committees.roleChair") : t("committees.roleMember")}
                </span>
              )}
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              style={{
                background: showCreate ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.4)",
                color: "#fff", borderRadius: 0,
                padding: "10px 20px", fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}
            >
              {showCreate ? "" : "+"} {t("committees.createMeeting")}
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showCreate && isAdmin && (
        <div style={{
          background: "#fff", border: "1px solid #e0e0e0", borderRadius: 0,
          padding: "20px 24px", marginBottom: 24, }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, color: "#161616", fontWeight: 600 }}>
            {t("committees.newMeeting")}
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <LangInputs
              label={t("committees.meetingTitle")}
              values={{ ru: form.title, en: form.title_en, uz: form.title_uz }}
              onChange={(lang: "ru" | "en" | "uz", val: string) => setForm((p) => lang === "ru" ? { ...p, title: val } : lang === "en" ? { ...p, title_en: val } : { ...p, title_uz: val })}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input
                type="datetime-local"
                value={form.start_at}
                onChange={(e) => setForm((p) => ({ ...p, start_at: e.target.value }))}
                style={inputStyle}
              />
              <input
                placeholder={t("committees.meetingLocation")}
                value={form.location}
                onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <textarea
              placeholder={t("committees.meetingNotes")}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              rows={2}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleCreate}
                disabled={creating || !form.title.trim() || !form.start_at}
                style={{
                  padding: "9px 22px", fontSize: 14, fontWeight: 600,
                  background: color, color: "#fff", border: "none",
                  borderRadius: 0, cursor: "pointer",
                  opacity: !form.title.trim() || !form.start_at ? 0.5 : 1,
                }}
              >
                {creating ? t("common.saving") : t("common.create")}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                style={{ padding: "9px 18px", fontSize: 14, background: "none", border: "1px solid #c6c6c6", borderRadius: 0, cursor: "pointer", color: "#393939" }}
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {meetings.length === 0 ? (
        <div style={{ textAlign: "center", padding: "56px 32px", background: "#f4f4f4", borderRadius: 0, border: "1px dashed #c6c6c6" }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}></div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#393939" }}>{t("committees.noMeetings")}</div>
          {isAdmin && <div style={{ fontSize: 13, color: "#8d8d8d", marginTop: 6 }}>{t("committees.createFirst")}</div>}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {scheduled.length > 0 && (
            <section>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#525252", marginBottom: 10 }}>
                {t("committees.scheduledMeetings")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {scheduled.map((m) => (
                  <MeetingCard key={m.id} meeting={m} color={color} committeeId={id!} navigate={navigate} t={t} isMember={isMember || isAdmin} />
                ))}
              </div>
            </section>
          )}
          {completed.length > 0 && (
            <section>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#525252", marginBottom: 10 }}>
                {t("committees.completedMeetings")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {completed.map((m) => (
                  <MeetingCard key={m.id} meeting={m} color="#8d8d8d" committeeId={id!} navigate={navigate} t={t} isMember={isMember || isAdmin} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting, color, committeeId, navigate, t }: {
  meeting: CommitteeMeeting;
  color: string;
  committeeId: string;
  navigate: ReturnType<typeof useNavigate>;
  t: (key: string) => string;
  isMember: boolean;
}) {
  const locale = getIntlLocale();
  const date = new Date(meeting.start_at);
  const dateStr = date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  const timeStr = date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const title = getLocalizedField(meeting as unknown as Record<string, unknown>, "title");
  const isScheduled = meeting.status === "scheduled";

  return (
    <div
      onClick={() => navigate(`/committees/${committeeId}/meetings/${meeting.id}`)}
      style={{
        background: "#fff",
        border: "1px solid #e0e0e0",
        borderLeft: `4px solid ${color}`,
        borderRadius: 0,
        padding: "14px 18px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        transition: "box-shadow 0.15s, transform 0.1s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#161616", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: "#525252", display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>{dateStr}</span>
          <span>{timeStr}</span>
          {meeting.location && <span>{meeting.location}</span>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{
          fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 0,
          background: isScheduled ? "#d0e2ff" : "#f4f4f4",
          color: isScheduled ? "#0043ce" : "#525252",
        }}>
          {isScheduled ? t("nsMeetings.statusScheduled") : t("nsMeetings.statusCompleted")}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8d8d8d" strokeWidth="2.5">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </div>
  );
}

function LangInputs({ label, values, onChange }: {
  label: string;
  values: { ru: string; en: string; uz: string };
  onChange: (lang: "ru" | "en" | "uz", val: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {(["ru", "en", "uz"] as const).map((lang) => (
        <div key={lang} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            width: 28, flexShrink: 0, fontSize: 11, fontWeight: 700,
            color: "#525252", textAlign: "center",
          }}>{lang === "uz" ? "UZ" : lang.toUpperCase()}</span>
          <input
            placeholder={`${label} (${lang === "ru" ? "Рус" : lang === "en" ? "Eng" : "Ўзб"})`}
            value={values[lang]}
            onChange={(e) => onChange(lang, e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
          />
        </div>
      ))}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  fontSize: 14,
  border: "1px solid #c6c6c6",
  borderRadius: 0,
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};
