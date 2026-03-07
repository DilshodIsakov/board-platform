import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import { getIntlLocale } from "../i18n";
import {
  fetchAllVotings,
  castVote,
  closeVoting,
  createVoting,
  tallyBoardVotes,
  type Voting,
} from "../lib/voting";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

const CAN_MANAGE = ["admin", "corp_secretary"];

export default function VotingPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const [votings, setVotings] = useState<Voting[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form
  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDeadline, setFormDeadline] = useState("");
  const [formMembers, setFormMembers] = useState("8");
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const canManage = profile && CAN_MANAGE.includes(profile.role);

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    loadVotings();
  }, [profile]);

  const loadVotings = async () => {
    const data = await fetchAllVotings();
    setVotings(data);
    setLoading(false);
  };

  const handleVote = async (votingId: string, choice: "for" | "against" | "abstain") => {
    if (!profile || !org) return;
    try {
      await castVote(votingId, org.id, profile.id, choice);
      await loadVotings();
    } catch (err) {
      console.error("Vote error:", err);
    }
  };

  const handleClose = async (votingId: string) => {
    try {
      await closeVoting(votingId);
      await loadVotings();
    } catch (err) {
      console.error("Close voting error:", err);
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile || !org) return;
    setCreating(true);
    setFormError("");

    try {
      // agenda_item_id is required by the schema — use a placeholder UUID for standalone votings
      // In production, this would be linked to an actual agenda item
      await createVoting(
        "00000000-0000-0000-0000-000000000000",
        org.id,
        profile.id,
        formTitle,
        formDesc,
        formDeadline || null,
        parseInt(formMembers) || 8
      );
      setFormTitle("");
      setFormDesc("");
      setFormDeadline("");
      setFormMembers("8");
      setShowForm(false);
      await loadVotings();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : t("voting.createError"));
    } finally {
      setCreating(false);
    }
  };

  const openVotings = votings.filter((v) => v.status === "open");
  const closedVotings = votings.filter((v) => v.status === "closed");

  if (loading) {
    return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>{t("voting.title")}</h1>
          <p style={{ color: "#6B7280", fontSize: 16, marginBottom: 28 }}>
            {t("voting.subtitle")}
          </p>
        </div>
        {canManage && !showForm && (
          <button onClick={() => setShowForm(true)} style={createBtnStyle}>
            {t("voting.newVoting")}
          </button>
        )}
      </div>

      {/* Create form */}
      {showForm && canManage && (
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>{t("voting.createVoting")}</h3>
            <button onClick={() => setShowForm(false)} style={{ color: "#9CA3AF", fontSize: 20, cursor: "pointer", background: "none", border: "none", padding: 4 }}>
              ✕
            </button>
          </div>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={labelStyle}>{t("voting.name")}</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
                placeholder={t("voting.namePlaceholder")}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>{t("voting.description")}</label>
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder={t("voting.descriptionPlaceholder")}
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={labelStyle}>{t("voting_extra.deadline")}</label>
                <input
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>{t("voting_extra.totalVoters")}</label>
                <input
                  type="number"
                  value={formMembers}
                  onChange={(e) => setFormMembers(e.target.value)}
                  min="1"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button type="submit" disabled={creating} style={submitBtnStyle}>
                {creating ? t("common.creating") : t("voting.createVoting")}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={cancelBtnStyle}>
                {t("common.cancel")}
              </button>
            </div>
            {formError && <p style={{ color: "#DC2626", fontSize: 14, margin: 0 }}>{formError}</p>}
          </form>
        </div>
      )}

      {/* Active votings */}
      <h2 style={{ marginBottom: 20 }}>{t("voting_extra.activeVotings")}</h2>
      {openVotings.length === 0 ? (
        <p style={{ color: "#9CA3AF", fontSize: 15, marginBottom: 32 }}>{t("voting_extra.noActiveVotings")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 40 }}>
          {openVotings.map((v) => (
            <VotingCard
              key={v.id}
              voting={v}
              profile={profile}
              canManage={!!canManage}
              onVote={handleVote}
              onClose={handleClose}
            />
          ))}
        </div>
      )}

      {/* Closed votings */}
      {closedVotings.length > 0 && (
        <>
          <h2 style={{ marginBottom: 20 }}>{t("voting_extra.completedVotings")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {closedVotings.map((v) => (
              <VotingCard
                key={v.id}
                voting={v}
                profile={profile}
                canManage={!!canManage}
                onVote={handleVote}
                onClose={handleClose}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- Voting Card (matches Figma) ---

function VotingCard({
  voting,
  profile,
  canManage,
  onVote,
  onClose,
}: {
  voting: Voting;
  profile: Profile | null;
  canManage: boolean;
  onVote: (votingId: string, choice: "for" | "against" | "abstain") => void;
  onClose: (votingId: string) => void;
}) {
  const { t } = useTranslation();
  const votes = voting.votes || [];
  const tally = tallyBoardVotes(votes);
  const myVote = profile ? votes.find((v) => v.voter_id === profile.id) : null;
  const isOpen = voting.status === "open";
  const canVote = isOpen && !!profile;
  const totalMembers = voting.total_members || 8;
  const progressPercent = totalMembers > 0 ? Math.round((tally.total / totalMembers) * 100) : 0;

  return (
    <div style={cardStyle}>
      {/* Header: title + badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#111827", flex: 1 }}>
          {voting.title}
        </h3>
        {isOpen && !myVote && (
          <span style={needsVoteBadge}>{t("voting_extra.needsVote")}</span>
        )}
        {isOpen && myVote && (
          <span style={votedBadge}>{t("voting_extra.voted")}</span>
        )}
        {!isOpen && (
          <span style={closedBadge}>{t("voting_extra.completed")}</span>
        )}
      </div>

      {/* Description */}
      {voting.description && (
        <p style={{ color: "#6B7280", fontSize: 15, lineHeight: 1.6, margin: "0 0 20px 0" }}>
          {voting.description}
        </p>
      )}

      {/* Progress bar section */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#374151" }}>{t("voting_extra.votingProgress")}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#374151" }}>{tally.total}/{totalMembers}</span>
        </div>
        <div style={progressBarBg}>
          <div style={{ ...progressBarFill, width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* Vote tally legend */}
      <div style={{ display: "flex", gap: 24, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#059669" }} />
          <span style={{ fontSize: 14, color: "#374151" }}>{t("dashboard.for")} {tally.forCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#DC2626" }} />
          <span style={{ fontSize: 14, color: "#374151" }}>{t("voting_extra.against")}: {tally.againstCount}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#9CA3AF" }} />
          <span style={{ fontSize: 14, color: "#374151" }}>{t("voting_extra.abstained")}: {tally.abstainCount}</span>
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #E5E7EB", margin: "0 0 16px 0" }} />

      {/* Bottom row: deadline + vote buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, color: "#6B7280" }}>
          {voting.deadline ? (
            <>{t("voting_extra.deadlineDate", { date: new Date(voting.deadline).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "long", year: "numeric" }) })}</>
          ) : (
            <>{t("voting_extra.createdDate", { date: new Date(voting.created_at).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "long", year: "numeric" }) })}</>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {canManage && isOpen && (
            <button
              onClick={() => {
                if (window.confirm(t("voting_extra.closeConfirm"))) onClose(voting.id);
              }}
              style={closeBtnStyle}
            >
              {t("common.close")}
            </button>
          )}
          {canVote && (
            <>
              <button
                onClick={() => onVote(voting.id, "against")}
                style={{
                  ...voteBtnStyle,
                  background: myVote?.choice === "against" ? "#1F2937" : "#FFFFFF",
                  color: myVote?.choice === "against" ? "#FFFFFF" : "#374151",
                  border: `1px solid ${myVote?.choice === "against" ? "#1F2937" : "#D1D5DB"}`,
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
                {t("voting_extra.voteAgainst")}
              </button>
              <button
                onClick={() => onVote(voting.id, "abstain")}
                style={{
                  ...voteBtnStyle,
                  background: myVote?.choice === "abstain" ? "#1F2937" : "#FFFFFF",
                  color: myVote?.choice === "abstain" ? "#FFFFFF" : "#374151",
                  border: `1px solid ${myVote?.choice === "abstain" ? "#1F2937" : "#D1D5DB"}`,
                }}
              >
                {t("voting_extra.voteAbstain")}
              </button>
              <button
                onClick={() => onVote(voting.id, "for")}
                style={{
                  ...voteBtnStyle,
                  background: myVote?.choice === "for" ? "#1F2937" : "#1F2937",
                  color: "#FFFFFF",
                  border: "1px solid #1F2937",
                  ...(myVote?.choice === "for" ? {} : {}),
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
                {t("voteChoice.for")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Styles ---

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  padding: "28px 32px",
};

const needsVoteBadge: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  background: "#F3F4F6",
  color: "#374151",
  border: "1px solid #E5E7EB",
  whiteSpace: "nowrap",
};

const votedBadge: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  background: "#D1FAE5",
  color: "#065F46",
  whiteSpace: "nowrap",
};

const closedBadge: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  background: "#F3F4F6",
  color: "#6B7280",
  whiteSpace: "nowrap",
};

const progressBarBg: React.CSSProperties = {
  height: 8,
  background: "#E5E7EB",
  borderRadius: 4,
  overflow: "hidden",
};

const progressBarFill: React.CSSProperties = {
  height: "100%",
  background: "#3B82F6",
  borderRadius: 4,
  transition: "width 0.3s ease",
};

const voteBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 18px",
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 8,
  cursor: "pointer",
  transition: "all 0.15s",
  whiteSpace: "nowrap",
};

const closeBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
  border: "1px solid #FCA5A5",
  background: "#FEF2F2",
  color: "#DC2626",
  cursor: "pointer",
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
