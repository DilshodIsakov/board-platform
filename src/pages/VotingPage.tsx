import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { Profile, Organization } from "../lib/profile";
import { getLocalizedName } from "../lib/profile";
import { supabase } from "../lib/supabaseClient";
import { getIntlLocale } from "../i18n";
import { getLocalizedField } from "../lib/i18nHelpers";
import { fetchNSMeetings, type NSMeeting } from "../lib/nsMeetings";
import {
  fetchAllVotingsWithMeeting,
  fetchMySignatures,
  castVote,
  tallyBoardVotes,
  type VotingWithMeeting,
  type MeetingVoteSignature,
} from "../lib/voting";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

interface MeetingVotingStatus {
  meeting: NSMeeting;
  votings: VotingWithMeeting[];
  openVotings: VotingWithMeeting[];
  closedVotings: VotingWithMeeting[];
  myVotedCount: number;
  signature: MeetingVoteSignature | null;
}

export default function VotingPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [meetingStatuses, setMeetingStatuses] = useState<MeetingVotingStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [votingInProgress, setVotingInProgress] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [voterProfiles, setVoterProfiles] = useState<Record<string, { full_name: string; full_name_en?: string | null; full_name_uz?: string | null }>>({});

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    loadData();
  }, [profile?.id]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const handleVote = async (votingId: string, choice: "for" | "against" | "abstain") => {
    if (!org || !profile) return;
    setVotingInProgress(votingId);
    try {
      await castVote(votingId, org.id, profile.id, choice);
      await loadData();
      showToast(t("nsVoting.voteSaved"));
    } catch (e: unknown) {
      showToast((e instanceof Error ? e.message : String(e)) || t("common.error"));
    }
    setVotingInProgress(null);
  };

  const loadData = async () => {
    if (!profile) return;
    setLoading(true);

    const [meetings, allVotings, mySignaturesMap] = await Promise.all([
      fetchNSMeetings(),
      fetchAllVotingsWithMeeting(),
      fetchMySignatures(profile.id),
    ]);

    // Group votings by meeting_id
    const votingsByMeeting: Record<string, VotingWithMeeting[]> = {};
    for (const v of allVotings) {
      if (!v.meeting_id) continue;
      if (!votingsByMeeting[v.meeting_id]) votingsByMeeting[v.meeting_id] = [];
      votingsByMeeting[v.meeting_id].push(v);
    }

    // Build meeting statuses — only include meetings that have at least one voting
    const statuses: MeetingVotingStatus[] = [];
    for (const meeting of meetings) {
      const votings = votingsByMeeting[meeting.id] || [];
      if (votings.length === 0) continue;

      const openVotings = votings.filter((v) => v.status === "open");
      const closedVotings = votings.filter((v) => v.status === "closed");

      const myVotedCount = openVotings.filter((v) =>
        (v.votes || []).some((vote) => vote.voter_id === profile.id)
      ).length;

      const sig = mySignaturesMap[meeting.id] ?? null;

      statuses.push({ meeting, votings, openVotings, closedVotings, myVotedCount, signature: sig });
    }

    // Load voter profiles
    const allVoterIds = new Set<string>();
    for (const v of allVotings) {
      for (const vote of v.votes || []) allVoterIds.add(vote.voter_id);
    }
    if (allVoterIds.size > 0) {
      const { data: vpData } = await supabase
        .from("profiles")
        .select("id, full_name, full_name_en, full_name_uz")
        .in("id", Array.from(allVoterIds));
      if (vpData) {
        const vpMap: Record<string, { full_name: string; full_name_en?: string | null; full_name_uz?: string | null }> = {};
        for (const p of vpData) vpMap[p.id] = p;
        setVoterProfiles(vpMap);
      }
    }

    setMeetingStatuses(statuses);
    setLoading(false);
  };

  const canVote = profile ? ["board_member", "chairman"].includes(profile.role) : false;
  const activeMeetings = meetingStatuses.filter((s) => s.openVotings.length > 0);
  const doneMeetings   = meetingStatuses.filter((s) => s.openVotings.length === 0);

  if (loading) {
    return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>;
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ marginBottom: 8 }}>{t("voting.title")}</h1>
        <p style={{ color: "#6B7280", fontSize: 16, margin: 0 }}>{t("nsVoting.dashSubtitle")}</p>
      </div>

      {/* ── Active votings ── */}
      <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>{t("nsVoting.activeMeetings")}</h2>
      {activeMeetings.length === 0 ? (
        <p style={{ color: "#9CA3AF", fontSize: 15, marginBottom: 32 }}>{t("nsVoting.noActiveMeetings")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 40 }}>
          {activeMeetings.map((s) => (
            <MeetingVotingCard
              key={s.meeting.id}
              status={s}
              profileId={profile?.id ?? ""}
              onGoToMeeting={() => navigate(`/ns-meetings/${s.meeting.id}`)}
              onVote={handleVote}
              votingInProgress={votingInProgress}
              canVote={canVote}
              voterProfiles={voterProfiles}
            />
          ))}
        </div>
      )}

      {/* ── Completed votings ── */}
      {doneMeetings.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 16 }}>{t("nsVoting.completedMeetings")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {doneMeetings.map((s) => (
              <MeetingVotingCard
                key={s.meeting.id}
                status={s}
                profileId={profile?.id ?? ""}
                onGoToMeeting={() => navigate(`/ns-meetings/${s.meeting.id}`)}
                onVote={handleVote}
                votingInProgress={votingInProgress}
                canVote={canVote}
              />
            ))}
          </div>
        </>
      )}

      {meetingStatuses.length === 0 && (
        <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("nsVoting.noMeetingsWithVotings")}</p>
      )}

      {toastMsg && (
        <div style={{
          position: "fixed", bottom: 32, left: "50%", transform: "translateX(-50%)",
          background: "#1F2937", color: "#FFF", padding: "10px 24px", borderRadius: 10,
          fontSize: 14, fontWeight: 500, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}

// ─── Meeting Voting Card ──────────────────────────────────────────────────────

function MeetingVotingCard({
  status,
  profileId,
  onGoToMeeting,
  onVote,
  votingInProgress,
  canVote,
  voterProfiles,
}: {
  status: MeetingVotingStatus;
  profileId: string;
  onGoToMeeting: () => void;
  onVote: (votingId: string, choice: "for" | "against" | "abstain") => void;
  votingInProgress: string | null;
  canVote: boolean;
  voterProfiles: Record<string, { full_name: string; full_name_en?: string | null; full_name_uz?: string | null }>;
}) {
  const { t, i18n } = useTranslation();
  const { meeting, votings, openVotings, myVotedCount, signature } = status;

  const meetingTitle = getLocalizedField(meeting as unknown as Record<string, unknown>, "title");
  const hasActiveVotings = openVotings.length > 0;
  const allVoted = hasActiveVotings && myVotedCount === openVotings.length;

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16, color: "#111827", marginBottom: 4 }}>
            {meetingTitle}
          </div>
          <div style={{ fontSize: 13, color: "#9CA3AF" }}>
            {new Date(meeting.start_at).toLocaleDateString(getIntlLocale(), {
              day: "numeric", month: "long", year: "numeric",
            })}
          </div>
        </div>
        {signature ? (
          <span style={signedBadge}>✅ {t("nsVoting.signed")}</span>
        ) : hasActiveVotings ? (
          <span style={activeBadge}>{openVotings.length} {t("nsVoting.openQuestions")}</span>
        ) : (
          <span style={closedBadge}>{t("nsVoting.allClosed")}</span>
        )}
      </div>

      {/* Voting items summary */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {votings.map((v) => {
          const tally = tallyBoardVotes(v.votes || []);
          const myVote = (v.votes || []).find((vote) => vote.voter_id === profileId);
          const isOpen = v.status === "open";
          const isLoading = votingInProgress === v.id;
          const localizedTitle = getLocalizedField(v as unknown as Record<string, unknown>, "agenda_title") || v.title;
          return (
            <div key={v.id} style={votingRowStyle}>
              {/* Title row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <span style={getVotingDotStyle(v.status)} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {localizedTitle}
                  </span>
                </div>
                <div style={{ flexShrink: 0, marginLeft: 12 }}>
                  {myVote ? (
                    <span style={getMyVoteBadgeStyle(myVote.choice)}>
                      {myVote.choice === "for" ? "✔ " + t("nsVoting.voteFor")
                        : myVote.choice === "against" ? "✖ " + t("nsVoting.voteAgainst")
                        : "◯ " + t("nsVoting.voteAbstain")}
                    </span>
                  ) : isOpen ? (
                    <span style={{ fontSize: 12, color: "#D97706", fontWeight: 600, background: "#FEF3C7", padding: "2px 8px", borderRadius: 5 }}>
                      {"\u25CF"} {t("nsVoting.needsVote")}
                    </span>
                  ) : null}
                </div>
              </div>
              {/* Vote buttons */}
              {isOpen && !signature && canVote && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  {(["for", "against", "abstain"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => onVote(v.id, c)}
                      disabled={isLoading}
                      style={getVoteBtnStyle(c, myVote?.choice === c)}
                    >
                      {c === "for" ? t("nsVoting.voteFor")
                        : c === "against" ? t("nsVoting.voteAgainst")
                        : t("nsVoting.voteAbstain")}
                    </button>
                  ))}
                </div>
              )}
              {/* Tally chips */}
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <span style={tallyChipFor}>✔ {t("nsVoting.voteFor")}: {tally.forCount}</span>
                <span style={tallyChipAgainst}>✖ {t("nsVoting.voteAgainst")}: {tally.againstCount}</span>
                <span style={tallyChipAbstain}>◯ {t("nsVoting.voteAbstain")}: {tally.abstainCount}</span>
                {v.status === "closed" && tally.total > 0 && (
                  tally.forCount > tally.againstCount
                    ? <span style={decisionAcceptedStyle}>✔ {t("nsVoting.decisionAccepted")}</span>
                    : <span style={decisionRejectedStyle}>⚠ {t("nsVoting.decisionNotAccepted")}</span>
                )}
              </div>
              {/* Individual votes */}
              {(v.votes || []).length > 0 && (
                <div style={{ marginTop: 6, padding: "6px 10px", background: "#F9FAFB", borderRadius: 8, border: "1px solid #F3F4F6" }}>
                  {(v.votes || []).map((vote) => {
                    const vp = voterProfiles[vote.voter_id];
                    const name = vp ? getLocalizedName(vp, i18n.language) : vote.voter_id.slice(0, 8);
                    const choiceIcon = vote.choice === "for" ? "✔" : vote.choice === "against" ? "✖" : "◯";
                    const choiceColor = vote.choice === "for" ? "#059669" : vote.choice === "against" ? "#DC2626" : "#9CA3AF";
                    const choiceLabel = vote.choice === "for" ? t("nsVoting.voteFor")
                      : vote.choice === "against" ? t("nsVoting.voteAgainst")
                      : t("nsVoting.voteAbstain");
                    return (
                      <div key={vote.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 12 }}>
                        <span style={{ color: "#374151" }}>{name}</span>
                        <span style={{ color: choiceColor, fontWeight: 600 }}>{choiceIcon} {choiceLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* My status row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #F3F4F6", paddingTop: 12 }}>
        <div style={{ fontSize: 13, color: "#6B7280" }}>
          {hasActiveVotings && !signature && (
            <>
              {t("nsVoting.myVote")}: {myVotedCount}/{openVotings.length}
              {allVoted && <span style={{ color: "#059669", marginLeft: 8 }}>{t("nsVoting.allVotedReady")}</span>}
            </>
          )}
          {signature && (
            <span style={{ color: "#059669" }}>
              {t("nsVoting.signedAt")}: {new Date(signature.signed_at).toLocaleDateString(getIntlLocale(), {
                day: "numeric", month: "long", year: "numeric",
              })}
            </span>
          )}
          {!hasActiveVotings && !signature && (
            <span style={{ color: "#6B7280" }}>{t("nsVoting.allClosed")}</span>
          )}
        </div>
        <button onClick={onGoToMeeting} style={goToMeetingBtnStyle}>
          {t("nsVoting.goToMeeting")} →
        </button>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: "20px 24px",
};

const activeBadge: React.CSSProperties = {
  padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
  background: "#FEF9C3", color: "#92400E", whiteSpace: "nowrap",
};

const closedBadge: React.CSSProperties = {
  padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
  background: "#F3F4F6", color: "#6B7280", whiteSpace: "nowrap",
};

const signedBadge: React.CSSProperties = {
  padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
  background: "#D1FAE5", color: "#065F46", whiteSpace: "nowrap",
};

const votingRowStyle: React.CSSProperties = {
  display: "flex", flexDirection: "column",
  padding: "10px 12px", borderRadius: 8, background: "#F9FAFB",
  border: "1px solid #F3F4F6",
};

const tallyChipFor: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
  background: "#D1FAE5", color: "#065F46", whiteSpace: "nowrap",
};

const tallyChipAgainst: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
  background: "#FEE2E2", color: "#991B1B", whiteSpace: "nowrap",
};

const tallyChipAbstain: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
  background: "#FEF9C3", color: "#92400E", whiteSpace: "nowrap",
};

const decisionAcceptedStyle: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
  background: "#D1FAE5", color: "#065F46", whiteSpace: "nowrap", marginLeft: 4,
};

const decisionRejectedStyle: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
  background: "#FEF3C7", color: "#92400E", whiteSpace: "nowrap", marginLeft: 4,
};

const goToMeetingBtnStyle: React.CSSProperties = {
  padding: "6px 16px", fontSize: 13, fontWeight: 500,
  borderRadius: 8, border: "1px solid #DBEAFE",
  background: "#EFF6FF", color: "#1D4ED8", cursor: "pointer",
  whiteSpace: "nowrap",
};

function getVotingDotStyle(status: string): React.CSSProperties {
  return {
    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
    background: status === "open" ? "#10B981" : status === "closed" ? "#9CA3AF" : "#FCD34D",
  };
}

function getVoteBtnStyle(choice: "for" | "against" | "abstain", selected: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "5px 14px", fontSize: 13, fontWeight: 500, borderRadius: 7,
    cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
  };
  if (selected) {
    if (choice === "for") return { ...base, background: "#059669", color: "#FFF", border: "1px solid #059669" };
    if (choice === "against") return { ...base, background: "#DC2626", color: "#FFF", border: "1px solid #DC2626" };
    return { ...base, background: "#6B7280", color: "#FFF", border: "1px solid #6B7280" };
  }
  return { ...base, background: "#FFF", color: "#374151", border: "1px solid #D1D5DB" };
}

function getMyVoteBadgeStyle(choice: string): React.CSSProperties {
  if (choice === "for")     return { padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: "#D1FAE5", color: "#065F46" };
  if (choice === "against") return { padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: "#FEE2E2", color: "#991B1B" };
  return { padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: "#374151" };
}
