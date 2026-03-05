import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getIntlLocale } from "../i18n";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchWorkPlans,
  fetchPlanMeetings,
  type WorkPlan,
  type PlanMeeting,
} from "../lib/workPlan";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

const STATUS_KEYS: Record<string, string> = {
  planned: "workplan.planStatus.scheduled",
  completed: "workplan.planStatus.completed",
  canceled: "workplan.planStatus.cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  planned: "#7C3AED",
  completed: "#16a34a",
  canceled: "#9CA3AF",
};

export default function BoardWorkPlanPage({ profile }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [plans, setPlans] = useState<WorkPlan[]>([]);
  const [meetings, setMeetings] = useState<PlanMeeting[]>([]);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    fetchWorkPlans().then((data) => {
      setPlans(data);
      if (data.length > 0) {
        fetchPlanMeetings(data[0].id).then((m) => {
          setMeetings(m);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
  }, [profile]);

  if (loading) return <div style={{ color: "#9CA3AF" }}>{t("common.loading")}</div>;
  if (plans.length === 0) return <div style={{ color: "#9CA3AF" }}>{t("workplan.noPlans")}</div>;

  const plan = plans[0];
  const today = new Date().toISOString().slice(0, 10);
  const futureMeetings = meetings.filter((m) => m.planned_date_from >= today);
  const pastMeetings = meetings.filter((m) => m.planned_date_from < today);

  const toggleExpand = (id: string) => {
    setExpandedMeeting(expandedMeeting === id ? null : id);
  };

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px" }}>{plan.title}</h1>
      <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 28 }}>
        {t("workplan.period", { start: formatDate(plan.period_start), end: formatDate(plan.period_end) })}
        <span style={{
          display: "inline-block",
          marginLeft: 12,
          padding: "2px 10px",
          borderRadius: 12,
          background: "#F3E8FF",
          color: "#7C3AED",
          fontSize: 12,
          fontWeight: 600,
        }}>
          {plan.status === "approved" ? t("workplan.approved") : plan.status}
        </span>
      </div>

      {/* Будущие заседания */}
      <h2 style={sectionTitleStyle}>{t("workplan.upcomingMeetings", { count: futureMeetings.length })}</h2>
      {futureMeetings.length === 0 ? (
        <div style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 20 }}>{t("workplan.noUpcomingMeetings")}</div>
      ) : (
        futureMeetings.map((m) => (
          <MeetingCard
            key={m.id}
            meeting={m}
            expanded={expandedMeeting === m.id}
            onToggle={() => toggleExpand(m.id)}
            onGoCalendar={() => {
              const d = new Date(m.planned_date_from);
              navigate(`/calendar?year=${d.getFullYear()}&month=${d.getMonth()}`);
            }}
          />
        ))
      )}

      {/* Прошедшие заседания */}
      {pastMeetings.length > 0 && (
        <>
          <h2 style={{ ...sectionTitleStyle, marginTop: 32, color: "#9CA3AF" }}>
            {t("workplan.pastMeetings", { count: pastMeetings.length })}
          </h2>
          {pastMeetings.map((m) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              expanded={expandedMeeting === m.id}
              onToggle={() => toggleExpand(m.id)}
              past
            />
          ))}
        </>
      )}
    </div>
  );
}

// --- Карточка заседания ---

function MeetingCard({
  meeting,
  expanded,
  onToggle,
  onGoCalendar,
  past,
}: {
  meeting: PlanMeeting;
  expanded: boolean;
  onToggle: () => void;
  onGoCalendar?: () => void;
  past?: boolean;
}) {
  const { t } = useTranslation();
  const statusColor = STATUS_COLORS[meeting.status] || "#9CA3AF";
  const items = meeting.agenda_items || [];

  return (
    <div style={{
      ...cardStyle,
      opacity: past ? 0.6 : 1,
      borderLeft: `4px solid ${statusColor}`,
    }}>
      <div style={cardHeaderStyle} onClick={onToggle}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#111827" }}>
              {t("workplan.meetingNumber", { number: meeting.meeting_number })}
            </span>
            <span style={{
              padding: "2px 8px",
              borderRadius: 10,
              background: statusColor + "1A",
              color: statusColor,
              fontSize: 11,
              fontWeight: 600,
            }}>
              {t(STATUS_KEYS[meeting.status] || meeting.status)}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4 }}>
            {meeting.planned_date_range_text}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!past && onGoCalendar && (
            <button
              style={calendarBtnStyle}
              onClick={(e) => {
                e.stopPropagation();
                onGoCalendar();
              }}
              title={t("workplan.goToCalendar")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </div>

      {expanded && items.length > 0 && (
        <div style={agendaListStyle}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
            {t("workplan.agenda", { count: items.length })}
          </div>
          {items.map((item) => (
            <div key={item.id} style={agendaItemStyle}>
              <span style={agendaNumberStyle}>{item.order_no}</span>
              <span style={{ flex: 1 }}>{item.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(getIntlLocale(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// --- Styles ---

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 12,
};

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 10,
  border: "1px solid #E5E7EB",
  marginBottom: 10,
  overflow: "hidden",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  padding: "14px 18px",
  cursor: "pointer",
  userSelect: "none",
};

const calendarBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "transparent",
  cursor: "pointer",
  color: "#7C3AED",
};

const agendaListStyle: React.CSSProperties = {
  padding: "0 18px 14px",
  borderTop: "1px solid #F3F4F6",
  paddingTop: 12,
};

const agendaItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  fontSize: 13,
  color: "#374151",
  padding: "6px 0",
  lineHeight: 1.5,
};

const agendaNumberStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "#F3E8FF",
  color: "#7C3AED",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
  marginTop: 1,
};
