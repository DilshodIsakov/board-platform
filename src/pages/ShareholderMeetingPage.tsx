import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchShareholderMeetings,
  fetchAgendaItems,
  fetchMaterials,
  createShareholderMeeting,
  addAgendaItem,
  addMaterial,
  completeMeeting,
  type ShareholderMeeting,
  type ShareholderAgendaItem,
  type ShareholderMaterial,
} from "../lib/shareholderMeetings";
import { getLocalizedField } from "../lib/i18nHelpers";
import {
  fetchVotesByMeeting,
  castShareholderVote,
  tallyVotes,
  type ShareholderVote,
} from "../lib/shareholderVoting";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

type TabKey = "upcoming" | "past";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  scheduled: { bg: "#D1FAE5", color: "#065F46" },
  completed: { bg: "#DBEAFE", color: "#1E40AF" },
  cancelled: { bg: "#FEE2E2", color: "#991B1B" },
};

const CAN_CREATE = ["admin", "corp_secretary"];

export default function ShareholderMeetingPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const [meetings, setMeetings] = useState<ShareholderMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("upcoming");

  // Per-meeting expanded data
  const [agendaMap, setAgendaMap] = useState<Record<string, ShareholderAgendaItem[]>>({});
  const [materialsMap, setMaterialsMap] = useState<Record<string, ShareholderMaterial[]>>({});
  const [votesMap, setVotesMap] = useState<Record<string, ShareholderVote[]>>({});

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formLangTab, setFormLangTab] = useState<"ru" | "uz" | "en">("ru");
  const [formTitleRu, setFormTitleRu] = useState("");
  const [formTitleUz, setFormTitleUz] = useState("");
  const [formTitleEn, setFormTitleEn] = useState("");
  const [formAgendaRu, setFormAgendaRu] = useState("");
  const [formAgendaUz, setFormAgendaUz] = useState("");
  const [formAgendaEn, setFormAgendaEn] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formType, setFormType] = useState<"annual" | "extraordinary">("annual");
  const [formShares, setFormShares] = useState("1000000");
  const [formMaterials, setFormMaterials] = useState("");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const canCreate = profile && CAN_CREATE.includes(profile.role);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    loadMeetings();
  }, [profile]);

  const loadMeetings = async () => {
    const data = await fetchShareholderMeetings();
    setMeetings(data);
    setLoading(false);

    // Load agenda + materials + votes for each meeting
    for (const m of data) {
      const [agenda, materials] = await Promise.all([
        fetchAgendaItems(m.id),
        fetchMaterials(m.id),
      ]);
      setAgendaMap((prev) => ({ ...prev, [m.id]: agenda }));
      setMaterialsMap((prev) => ({ ...prev, [m.id]: materials }));

      // Load votes for all agenda items of this meeting
      if (agenda.length > 0) {
        const agendaIds = agenda.map((a) => a.id);
        const votes = await fetchVotesByMeeting(agendaIds);
        // Group votes by agenda_item_id
        const grouped: Record<string, ShareholderVote[]> = {};
        for (const v of votes) {
          if (!grouped[v.agenda_item_id]) grouped[v.agenda_item_id] = [];
          grouped[v.agenda_item_id].push(v);
        }
        setVotesMap((prev) => ({ ...prev, ...grouped }));
      }
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !org) return;

    // Validate: all 3 language titles required
    if (!formTitleRu.trim() || !formTitleUz.trim() || !formTitleEn.trim()) {
      setFormError(t("shareholder.allLangsRequired"));
      return;
    }

    // Validate: agenda line counts must match (if any agenda provided)
    const agendaRuLines = formAgendaRu.split("\n").filter((l) => l.trim());
    const agendaUzLines = formAgendaUz.split("\n").filter((l) => l.trim());
    const agendaEnLines = formAgendaEn.split("\n").filter((l) => l.trim());
    const agendaCount = agendaRuLines.length;
    if (agendaCount > 0 && (agendaUzLines.length !== agendaCount || agendaEnLines.length !== agendaCount)) {
      setFormError(t("shareholder.agendaLineMismatch"));
      return;
    }

    setCreating(true);
    setFormError("");

    try {
      const meeting = await createShareholderMeeting(org.id, profile.id, {
        title_ru: formTitleRu.trim(),
        title_uz: formTitleUz.trim(),
        title_en: formTitleEn.trim(),
        meetingDate: new Date(formDate).toISOString(),
        meetingType: formType,
        totalShares: parseInt(formShares) || 1000000,
      });

      // Add agenda items (all 3 languages)
      for (let i = 0; i < agendaCount; i++) {
        await addAgendaItem(
          meeting.id,
          agendaRuLines[i].trim(),
          agendaUzLines[i].trim(),
          agendaEnLines[i].trim(),
          i + 1
        );
      }

      // Add materials
      const materialLines = formMaterials.split("\n").filter((l) => l.trim());
      for (const line of materialLines) {
        await addMaterial(meeting.id, line.trim());
      }

      // Reset form
      setFormTitleRu("");
      setFormTitleUz("");
      setFormTitleEn("");
      setFormAgendaRu("");
      setFormAgendaUz("");
      setFormAgendaEn("");
      setFormDate("");
      setFormType("annual");
      setFormShares("1000000");
      setFormMaterials("");
      setFormLangTab("ru");
      setShowForm(false);

      await loadMeetings();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("shareholder.createError"));
    } finally {
      setCreating(false);
    }
  };

  const handleVote = async (agendaItemId: string, choice: "for" | "against" | "abstain") => {
    if (!profile) return;
    try {
      // TODO: Fetch shares_count from shareholder_shares table based on profile.id
      const vote = await castShareholderVote(agendaItemId, profile.id, choice, 0);
      if (vote) {
        setVotesMap((prev) => {
          const existing = prev[agendaItemId] || [];
          const filtered = existing.filter((v) => v.voter_id !== profile.id);
          return { ...prev, [agendaItemId]: [...filtered, vote] };
        });
      }
    } catch (err) {
      console.error("Vote error:", err);
    }
  };

  const handleComplete = async (meetingId: string) => {
    if (!profile || !canCreate) return;
    // Sum all voted shares across all agenda items for this meeting
    const agenda = agendaMap[meetingId] || [];
    const voterSharesSet = new Map<string, number>(); // voter_id -> shares
    for (const item of agenda) {
      const votes = votesMap[item.id] || [];
      for (const v of votes) {
        if (!voterSharesSet.has(v.voter_id)) {
          voterSharesSet.set(v.voter_id, v.shares_count);
        }
      }
    }
    let totalVotedShares = 0;
    for (const s of voterSharesSet.values()) totalVotedShares += s;

    try {
      await completeMeeting(meetingId, totalVotedShares);
      await loadMeetings();
    } catch (err) {
      console.error("Complete meeting error:", err);
    }
  };

  const upcomingMeetings = meetings.filter((m) => m.status === "scheduled");
  const pastMeetings = meetings.filter((m) => m.status !== "scheduled");
  const currentMeetings = activeTab === "upcoming" ? upcomingMeetings : pastMeetings;

  const TABS: { key: TabKey; label: string }[] = [
    { key: "upcoming", label: t("shareholder.upcomingTab") },
    { key: "past", label: t("shareholder.pastTab") },
  ];

  if (loading) {
    return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>{t("shareholder.title")}</h1>
          <p style={{ color: "#6B7280", fontSize: 16, marginBottom: 28 }}>
            {t("shareholder.subtitle")}
          </p>
        </div>
        {canCreate && !showForm && (
          <button onClick={() => setShowForm(true)} style={createBtnStyle}>
            {t("shareholder.newMeeting")}
          </button>
        )}
      </div>

      {/* Create Form */}
      {showForm && canCreate && (() => {
        const langHasTitle = { ru: !!formTitleRu.trim(), uz: !!formTitleUz.trim(), en: !!formTitleEn.trim() };
        const tabDot = (lang: "ru" | "uz" | "en") => (
          <span style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: langHasTitle[lang] ? "#16a34a" : "#DC2626",
            marginLeft: 5,
            verticalAlign: "middle",
          }} />
        );
        return (
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0 }}>{t("shareholder.createTitle")}</h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B7280" }}>{t("shareholder.allLangsNote")}</p>
              </div>
              <button onClick={() => setShowForm(false)} style={{ color: "#9CA3AF", fontSize: 20, cursor: "pointer", background: "none", border: "none", padding: 4 }}>
                ✕
              </button>
            </div>

            {/* Language tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB", marginBottom: 20 }}>
              {(["ru", "uz", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setFormLangTab(lang)}
                  style={{
                    padding: "8px 20px",
                    fontSize: 14,
                    fontWeight: formLangTab === lang ? 600 : 400,
                    color: formLangTab === lang ? "#2563EB" : "#6B7280",
                    background: "none",
                    border: "none",
                    borderBottom: formLangTab === lang ? "2px solid #2563EB" : "2px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {lang.toUpperCase()}{tabDot(lang)}
                </button>
              ))}
            </div>

            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Per-language fields */}
              {formLangTab === "ru" && (
                <>
                  <div>
                    <label style={labelStyle}>{t("shareholder.titleRuLabel")}</label>
                    <input
                      type="text"
                      value={formTitleRu}
                      onChange={(e) => setFormTitleRu(e.target.value)}
                      placeholder={t("shareholder.titleRuPlaceholder")}
                      style={{ ...inputStyle, borderColor: formTitleRu.trim() ? "#D1D5DB" : "#FCA5A5" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t("shareholder.agendaRuLabel")}</label>
                    <textarea
                      value={formAgendaRu}
                      onChange={(e) => setFormAgendaRu(e.target.value)}
                      placeholder={t("shareholder.agendaPlaceholder")}
                      rows={5}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>
                </>
              )}
              {formLangTab === "uz" && (
                <>
                  <div>
                    <label style={labelStyle}>{t("shareholder.titleUzLabel")}</label>
                    <input
                      type="text"
                      value={formTitleUz}
                      onChange={(e) => setFormTitleUz(e.target.value)}
                      placeholder={t("shareholder.titleUzPlaceholder")}
                      style={{ ...inputStyle, borderColor: formTitleUz.trim() ? "#D1D5DB" : "#FCA5A5" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t("shareholder.agendaUzLabel")}</label>
                    <textarea
                      value={formAgendaUz}
                      onChange={(e) => setFormAgendaUz(e.target.value)}
                      placeholder={t("shareholder.agendaUzPlaceholder")}
                      rows={5}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>
                </>
              )}
              {formLangTab === "en" && (
                <>
                  <div>
                    <label style={labelStyle}>{t("shareholder.titleEnLabel")}</label>
                    <input
                      type="text"
                      value={formTitleEn}
                      onChange={(e) => setFormTitleEn(e.target.value)}
                      placeholder={t("shareholder.titleEnPlaceholder")}
                      style={{ ...inputStyle, borderColor: formTitleEn.trim() ? "#D1D5DB" : "#FCA5A5" }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>{t("shareholder.agendaEnLabel")}</label>
                    <textarea
                      value={formAgendaEn}
                      onChange={(e) => setFormAgendaEn(e.target.value)}
                      placeholder={t("shareholder.agendaEnPlaceholder")}
                      rows={5}
                      style={{ ...inputStyle, resize: "vertical" }}
                    />
                  </div>
                </>
              )}

              {/* Shared fields */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>{t("shareholder.dateLabel")}</label>
                  <input
                    type="datetime-local"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    lang={getIntlLocale()}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t("shareholder.typeLabel")}</label>
                  <select value={formType} onChange={(e) => setFormType(e.target.value as "annual" | "extraordinary")} style={inputStyle}>
                    <option value="annual">{t("shareholder.meetingType.annual")}</option>
                    <option value="extraordinary">{t("shareholder.meetingType.extraordinary")}</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label style={labelStyle}>{t("shareholder.totalSharesLabel")}</label>
                  <input
                    type="number"
                    value={formShares}
                    onChange={(e) => setFormShares(e.target.value)}
                    min="1"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t("shareholder.materialsLabel")}</label>
                  <input
                    type="text"
                    value={formMaterials}
                    onChange={(e) => setFormMaterials(e.target.value)}
                    placeholder={t("shareholder.materialsPlaceholder")}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" disabled={creating} style={submitBtnStyle}>
                  {creating ? t("common.creating") : t("shareholder.createMeeting")}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={cancelBtnStyle}>
                  {t("common.cancel")}
                </button>
              </div>
              {formError && <p style={{ color: "#DC2626", fontSize: 14, margin: 0 }}>{formError}</p>}
            </form>
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={tabBarStyle}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...tabBtnStyle,
              color: activeTab === tab.key ? "#3B82F6" : "#6B7280",
              borderBottomColor: activeTab === tab.key ? "#3B82F6" : "transparent",
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Meeting cards */}
      {currentMeetings.length === 0 ? (
        <p style={{ color: "#9CA3AF", padding: "32px 0", fontSize: 15 }}>
          {activeTab === "upcoming" ? t("shareholder.noUpcoming") : t("shareholder.noPast")}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {currentMeetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              agenda={agendaMap[meeting.id] || []}
              materials={materialsMap[meeting.id] || []}
              votesMap={votesMap}
              profile={profile}
              onVote={handleVote}
              canManage={!!canCreate}
              onComplete={handleComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// --- Meeting Card ---

function MeetingCard({
  meeting,
  agenda,
  materials,
  votesMap,
  profile,
  onVote,
  canManage,
  onComplete,
}: {
  meeting: ShareholderMeeting;
  agenda: ShareholderAgendaItem[];
  materials: ShareholderMaterial[];
  votesMap: Record<string, ShareholderVote[]>;
  profile: Profile | null;
  onVote: (agendaItemId: string, choice: "for" | "against" | "abstain") => void;
  canManage: boolean;
  onComplete: (meetingId: string) => void;
}) {
  const { t } = useTranslation();
  const statusColors = STATUS_COLORS[meeting.status] || STATUS_COLORS.scheduled;
  const quorumPercent = meeting.total_shares > 0
    ? Math.round((meeting.voted_shares / meeting.total_shares) * 100)
    : 0;
  const totalShares = Number(meeting?.total_shares ?? 0);
  const votedShares = Number(meeting?.voted_shares ?? 0);

  return (
    <div style={cardStyle}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <h2 style={{ margin: 0 }}>{getLocalizedField(meeting as unknown as Record<string, unknown>, "title") || t(`shareholder.meetingType.${meeting.meeting_type}`)}</h2>
          <span style={{
            ...badgeStyle,
            background: statusColors.bg,
            color: statusColors.color,
          }}>
            {t(`shareholder.meetingStatus.${meeting.status}`, meeting.status)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {canManage && meeting.status === "scheduled" && (
            <button
              onClick={() => {
                if (window.confirm(t("shareholder.completeConfirm"))) {
                  onComplete(meeting.id);
                }
              }}
              style={completeBtnStyle}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t("shareholder.completeMeeting")}
            </button>
          )}
          <button style={viewMaterialsBtnStyle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t("shareholder.viewMaterials")}
          </button>
        </div>
      </div>

      {/* Date */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6B7280", fontSize: 15, marginBottom: 20 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {new Date(meeting.meeting_date).toLocaleDateString(getIntlLocale(), {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </div>

      {/* Quorum section */}
      <div style={quorumSectionStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: 15, color: "#111827" }}>
            {t("shareholder.quorum", { percent: quorumPercent })}
          </span>
        </div>
        <div style={{ display: "flex", gap: 24, fontSize: 14, color: "#6B7280" }}>
          <span>{t("shareholder.totalShares", { count: totalShares })}</span>
          <span>{t("shareholder.votedShares", { count: votedShares })}</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #E5E7EB", margin: "20px 0" }} />

      {/* Agenda + Voting */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 16 }}>{t("shareholder.agendaTitle")}</h3>
        {agenda.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("shareholder.noAgenda")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {agenda.map((item, idx) => {
              const votes = votesMap[item.id] || [];
              const tally = tallyVotes(votes);
              const myVote = profile ? votes.find((v) => v.voter_id === profile.id) : null;
              const canVote = meeting.status === "scheduled" && !!profile;

              return (
                <div key={item.id} style={agendaVoteCardStyle}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                    <span style={{ fontWeight: 600, color: "#6B7280", fontSize: 15, minWidth: 24 }}>
                      {idx + 1}.
                    </span>
                    <span style={{ fontSize: 15, color: "#374151", lineHeight: 1.5 }}>
                      {getLocalizedField(item as unknown as Record<string, unknown>, "title")}
                    </span>
                  </div>

                  {/* Vote buttons */}
                  <div style={{ display: "flex", gap: 10, marginBottom: 12, paddingLeft: 34 }}>
                    <button
                      onClick={() => onVote(item.id, "for")}
                      disabled={!canVote}
                      style={{
                        ...voteBtnBase,
                        background: myVote?.choice === "for" ? "#059669" : "#F0FDF4",
                        color: myVote?.choice === "for" ? "#FFFFFF" : "#059669",
                        border: `1px solid ${myVote?.choice === "for" ? "#059669" : "#BBF7D0"}`,
                        opacity: canVote ? 1 : 0.5,
                        cursor: canVote ? "pointer" : "default",
                      }}
                    >
                      {t("shareholder.for")}
                    </button>
                    <button
                      onClick={() => onVote(item.id, "against")}
                      disabled={!canVote}
                      style={{
                        ...voteBtnBase,
                        background: myVote?.choice === "against" ? "#DC2626" : "#FEF2F2",
                        color: myVote?.choice === "against" ? "#FFFFFF" : "#DC2626",
                        border: `1px solid ${myVote?.choice === "against" ? "#DC2626" : "#FECACA"}`,
                        opacity: canVote ? 1 : 0.5,
                        cursor: canVote ? "pointer" : "default",
                      }}
                    >
                      {t("shareholder.against")}
                    </button>
                    <button
                      onClick={() => onVote(item.id, "abstain")}
                      disabled={!canVote}
                      style={{
                        ...voteBtnBase,
                        background: myVote?.choice === "abstain" ? "#6B7280" : "#F3F4F6",
                        color: myVote?.choice === "abstain" ? "#FFFFFF" : "#6B7280",
                        border: `1px solid ${myVote?.choice === "abstain" ? "#6B7280" : "#D1D5DB"}`,
                        opacity: canVote ? 1 : 0.5,
                        cursor: canVote ? "pointer" : "default",
                      }}
                    >
                      {t("shareholder.abstain")}
                    </button>
                  </div>

                  {/* Vote tally */}
                  {tally.totalVoters > 0 && (
                    <div style={{ paddingLeft: 34 }}>
                      <div style={{ display: "flex", gap: 4, height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                        {tally.forShares > 0 && (
                          <div style={{ flex: tally.forShares, background: "#059669", borderRadius: 3 }} />
                        )}
                        {tally.againstShares > 0 && (
                          <div style={{ flex: tally.againstShares, background: "#DC2626", borderRadius: 3 }} />
                        )}
                        {tally.abstainShares > 0 && (
                          <div style={{ flex: tally.abstainShares, background: "#9CA3AF", borderRadius: 3 }} />
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#6B7280" }}>
                        <span style={{ color: "#059669" }}>
                          {t("shareholder.forShares", { shares: tally.forShares.toLocaleString(getIntlLocale()), voters: tally.forVoters })}
                        </span>
                        <span style={{ color: "#DC2626" }}>
                          {t("shareholder.againstShares", { shares: tally.againstShares.toLocaleString(getIntlLocale()), voters: tally.againstVoters })}
                        </span>
                        <span style={{ color: "#9CA3AF" }}>
                          {t("shareholder.abstainShares", { shares: tally.abstainShares.toLocaleString(getIntlLocale()), voters: tally.abstainVoters })}
                        </span>
                        <span>{t("shareholder.totalSharesVoted", { shares: tally.totalShares.toLocaleString(getIntlLocale()) })}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #E5E7EB", margin: "20px 0" }} />

      {/* Materials */}
      <div>
        <h3 style={{ marginBottom: 16 }}>{t("shareholder.materialsTitle")}</h3>
        {materials.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("shareholder.noMaterials")}</p>
        ) : (
          <div style={materialsGridStyle}>
            {materials.map((mat) => (
              <MaterialCard key={mat.id} material={mat} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Material Card ---

const MATERIAL_COLORS = ["#3B82F6", "#059669", "#7C3AED", "#F59E0B", "#DC2626"];

function MaterialCard({ material }: { material: ShareholderMaterial }) {
  const { t } = useTranslation();
  const color = MATERIAL_COLORS[material.title.length % MATERIAL_COLORS.length];

  return (
    <div style={materialCardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span style={{ fontWeight: 500, fontSize: 15, color: "#111827" }}>{material.title}</span>
      </div>
      <div style={{
        fontSize: 13,
        color: material.status === "available" ? "#059669" : "#9CA3AF",
        fontWeight: 500,
      }}>
        {material.status === "available" ? t("shareholder.materialsAvailable") : t("shareholder.materialsWaiting")}
      </div>
    </div>
  );
}

// --- Styles ---

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 0,
  borderBottom: "1px solid #E5E7EB",
  marginBottom: 28,
};

const tabBtnStyle: React.CSSProperties = {
  padding: "12px 24px",
  fontSize: 16,
  cursor: "pointer",
  borderBottom: "2px solid transparent",
  transition: "all 0.15s",
  background: "none",
  whiteSpace: "nowrap",
};

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  padding: "28px 32px",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 14px",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 500,
};

const viewMaterialsBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 500,
  color: "#374151",
  background: "#FFFFFF",
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  cursor: "pointer",
  transition: "background 0.15s",
};

const quorumSectionStyle: React.CSSProperties = {
  padding: "16px 20px",
  background: "#F9FAFB",
  borderRadius: 10,
};

const materialsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 16,
};

const materialCardStyle: React.CSSProperties = {
  padding: "20px",
  background: "#F9FAFB",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
};

const createBtnStyle: React.CSSProperties = {
  padding: "11px 24px",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 10,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 14,
  color: "#6B7280",
  marginBottom: 6,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 15,
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const submitBtnStyle: React.CSSProperties = {
  padding: "11px 28px",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 10,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "11px 24px",
  fontSize: 15,
  fontWeight: 500,
  borderRadius: 10,
  border: "1px solid #D1D5DB",
  background: "#FFFFFF",
  color: "#374151",
  cursor: "pointer",
};

const completeBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 20px",
  fontSize: 14,
  fontWeight: 600,
  color: "#FFFFFF",
  background: "#059669",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  transition: "background 0.15s",
};

const agendaVoteCardStyle: React.CSSProperties = {
  padding: "16px 20px",
  background: "#F9FAFB",
  borderRadius: 10,
  border: "1px solid #E5E7EB",
};

const voteBtnBase: React.CSSProperties = {
  padding: "6px 16px",
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  transition: "all 0.15s",
};
