import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { Profile, Organization } from "../lib/profile";
import { getIntlLocale } from "../i18n";
import { getLocalizedField } from "../lib/i18nHelpers";
import { fetchNSMeetings, type NSMeeting } from "../lib/nsMeetings";
import {
  fetchAllVotingsWithMeeting,
  fetchMySignatures,
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

export default function VotingPage({ profile }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [meetingStatuses, setMeetingStatuses] = useState<MeetingVotingStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    loadData();
  }, [profile]);

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

    setMeetingStatuses(statuses);
    setLoading(false);
  };

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
              onGoToMeeting={() => navigate("/ns-meetings")}
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
                onGoToMeeting={() => navigate("/ns-meetings")}
              />
            ))}
          </div>
        </>
      )}

      {meetingStatuses.length === 0 && (
        <p style={{ color: "#9CA3AF", fontSize: 15 }}>{t("nsVoting.noMeetingsWithVotings")}</p>
      )}
    </div>
  );
}

// ─── Meeting Voting Card ──────────────────────────────────────────────────────

function MeetingVotingCard({
  status,
  profileId,
  onGoToMeeting,
}: {
  status: MeetingVotingStatus;
  profileId: string;
  onGoToMeeting: () => void;
}) {
  const { t } = useTranslation();
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
          return (
            <div key={v.id} style={votingRowStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                <span style={getVotingDotStyle(v.status)} />
                <span style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {v.title}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: "#6B7280" }}>
                  ✓{tally.forCount} ✗{tally.againstCount} –{tally.abstainCount}
                </span>
                {myVote && (
                  <span style={getMyVoteBadgeStyle(myVote.choice)}>
                    {myVote.choice === "for" ? t("nsVoting.voteFor")
                      : myVote.choice === "against" ? t("nsVoting.voteAgainst")
                      : t("nsVoting.voteAbstain")}
                  </span>
                )}
                {!myVote && v.status === "open" && (
                  <span style={{ fontSize: 12, color: "#F59E0B", fontWeight: 500 }}>
                    {t("nsVoting.needsVote")}
                  </span>
                )}
              </div>
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
  display: "flex", justifyContent: "space-between", alignItems: "center",
  gap: 12, padding: "6px 10px", borderRadius: 6, background: "#F9FAFB",
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

function getMyVoteBadgeStyle(choice: string): React.CSSProperties {
  if (choice === "for")     return { padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: "#D1FAE5", color: "#065F46" };
  if (choice === "against") return { padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: "#FEE2E2", color: "#991B1B" };
  return { padding: "2px 8px", borderRadius: 5, fontSize: 11, fontWeight: 600, background: "#F3F4F6", color: "#374151" };
}
