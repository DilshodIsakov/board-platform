import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import { fetchMeetings, type Meeting } from "../lib/meetings";
import { getIntlLocale } from "../i18n";
import { getLocalizedField } from "../lib/i18nHelpers";
import BoardWorkPlanPage from "./BoardWorkPlanPage";

const STATUS_COLORS: Record<string, string> = {
  draft: "#9ca3af",
  scheduled: "#2563eb",
  completed: "#16a34a",
};

const WORK_PLAN_COLOR = "#7C3AED";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

/** Получить дни месяца для сетки календаря (включая «хвосты» пред./след. месяцев) */
function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  // Понедельник = 0 (ISO), Воскресенье = 6
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  const days: Date[] = [];
  const start = new Date(year, month, 1 - startOffset);

  // Всегда 42 клетки (6 рядов × 7)
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }

  return days;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const weekdays = t("calendar.weekdays", { returnObjects: true }) as string[];
  const monthNames = t("calendar.months", { returnObjects: true }) as string[];
  const SS_TAB = "calendar_tab";
  const SS_YEAR = "calendar_year";
  const SS_MONTH = "calendar_month";

  const [searchParams] = useSearchParams();
  const today = new Date();
  const paramYear = searchParams.get("year");
  const paramMonth = searchParams.get("month");

  const [tab, setTabRaw] = useState<"calendar" | "workplan">(() => {
    const saved = sessionStorage.getItem(SS_TAB);
    return saved === "workplan" ? "workplan" : "calendar";
  });
  const setTab = useCallback((t: "calendar" | "workplan") => {
    setTabRaw(t);
    sessionStorage.setItem(SS_TAB, t);
  }, []);

  const [year, setYearRaw] = useState(() => {
    if (paramYear) return Number(paramYear);
    const saved = sessionStorage.getItem(SS_YEAR);
    return saved ? Number(saved) : today.getFullYear();
  });
  const setYear = useCallback((y: number) => {
    setYearRaw(y);
    sessionStorage.setItem(SS_YEAR, String(y));
  }, []);

  const [month, setMonthRaw] = useState(() => {
    if (paramMonth) return Number(paramMonth);
    const saved = sessionStorage.getItem(SS_MONTH);
    return saved ? Number(saved) : today.getMonth();
  });
  const setMonth = useCallback((m: number) => {
    setMonthRaw(m);
    sessionStorage.setItem(SS_MONTH, String(m));
  }, []);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    fetchMeetings().then((data) => {
      setMeetings(data);
      setLoading(false);
    });
  }, [profile?.id]);

  // Группируем заседания по дате
  const meetingsByDate: Record<string, Meeting[]> = {};
  for (const m of meetings) {
    const d = new Date(m.start_at);
    const key = dateKey(d);
    if (!meetingsByDate[key]) meetingsByDate[key] = [];
    meetingsByDate[key].push(m);
  }

  const days = getCalendarDays(year, month);
  const todayKey = dateKey(today);

  const prevMonth = () => {
    if (month === 0) { setYear(year - 1); setMonth(11); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(year + 1); setMonth(0); }
    else setMonth(month + 1);
  };

  const goToday = () => {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  };

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid #E5E7EB", paddingBottom: 0 }}>
        <button
          onClick={() => setTab("calendar")}
          style={{
            padding: "8px 20px",
            fontSize: 14,
            fontWeight: 500,
            background: "none",
            border: "none",
            borderBottom: tab === "calendar" ? "2px solid #3B82F6" : "2px solid transparent",
            color: tab === "calendar" ? "#3B82F6" : "#6B7280",
            cursor: "pointer",
            marginBottom: -1,
          }}
        >
          {t("calendar.tabCalendar")}
        </button>
        <button
          onClick={() => setTab("workplan")}
          style={{
            padding: "8px 20px",
            fontSize: 14,
            fontWeight: 500,
            background: "none",
            border: "none",
            borderBottom: tab === "workplan" ? "2px solid #3B82F6" : "2px solid transparent",
            color: tab === "workplan" ? "#3B82F6" : "#6B7280",
            cursor: "pointer",
            marginBottom: -1,
          }}
        >
          {t("calendar.tabWorkplan")}
        </button>
      </div>

      {/* Work plan tab */}
      {tab === "workplan" && <BoardWorkPlanPage profile={profile} org={org} />}

      {/* Calendar tab */}
      {tab === "calendar" && <div>
      {loading && <div style={{ color: "#9CA3AF" }}>{t("common.loading")}</div>}
      {!loading && <>
      {/* Заголовок с навигацией */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <button onClick={prevMonth} style={navBtnStyle}>&lt;</button>
        <h1 style={{ margin: 0, fontSize: 22, minWidth: 220, textAlign: "center" }}>
          {monthNames[month]} {year}
        </h1>
        <button onClick={nextMonth} style={navBtnStyle}>&gt;</button>
        <button onClick={goToday} style={{ ...navBtnStyle, fontSize: 13, padding: "6px 14px" }}>
          {t("calendar.today")}
        </button>
      </div>

      {/* Сетка календаря */}
      <div style={gridStyle}>
        {/* Заголовки дней недели */}
        {weekdays.map((wd) => (
          <div key={wd} style={weekdayHeaderStyle}>{wd}</div>
        ))}

        {/* Ячейки дней */}
        {days.map((day, i) => {
          const key = dateKey(day);
          const isCurrentMonth = day.getMonth() === month;
          const isToday = key === todayKey;
          const dayMeetings = meetingsByDate[key] || [];

          return (
            <div
              key={i}
              style={{
                ...cellStyle,
                background: isToday ? "#eff6ff" : "transparent",
                opacity: isCurrentMonth ? 1 : 0.35,
              }}
            >
              <div style={{
                fontSize: 13,
                fontWeight: isToday ? 700 : 400,
                color: isToday ? "#2563eb" : "#374151",
                marginBottom: 4,
              }}>
                {day.getDate()}
              </div>

              {dayMeetings.map((m) => {
                const isWorkPlan = m.source === "work_plan";
                const bgColor = isWorkPlan ? WORK_PLAN_COLOR : (STATUS_COLORS[m.status] || "#9ca3af");
                return (
                  <Link
                    key={m.id}
                    to={`/meetings/${m.id}`}
                    style={{
                      display: "block",
                      fontSize: 11,
                      lineHeight: 1.3,
                      padding: "2px 4px",
                      marginBottom: 2,
                      borderRadius: 4,
                      background: bgColor,
                      color: "#fff",
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={`${isWorkPlan ? "[" + t("calendar.planNS") + "] " : ""}${getLocalizedField(m as unknown as Record<string, unknown>, "title")} — ${new Date(m.start_at).toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" })}`}
                  >
                    {isWorkPlan && "📋 "}
                    {new Date(m.start_at).toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" })}{" "}
                    {getLocalizedField(m as unknown as Record<string, unknown>, "title")}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Легенда */}
      <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 13 }}>
        <span><span style={legendDotStyle("#9ca3af")} /> {t("meetingStatus.draft")}</span>
        <span><span style={legendDotStyle("#2563eb")} /> {t("meetingStatus.scheduled")}</span>
        <span><span style={legendDotStyle("#16a34a")} /> {t("meetingStatus.completed")}</span>
        <span><span style={legendDotStyle("#7C3AED")} /> {t("calendar.planNS")}</span>
      </div>
      </>}
      </div>}
    </div>
  );
}

// --- Стили ---

const navBtnStyle: React.CSSProperties = {
  padding: "6px 12px",
  fontSize: 16,
  borderRadius: 6,
  border: "1px solid #d1d5db",
  background: "transparent",
  cursor: "pointer",
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(7, 1fr)",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  overflow: "hidden",
};

const weekdayHeaderStyle: React.CSSProperties = {
  padding: "8px 4px",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 600,
  color: "#6b7280",
  background: "#f9fafb",
  borderBottom: "1px solid #e5e7eb",
};

const cellStyle: React.CSSProperties = {
  minHeight: 80,
  padding: 4,
  borderRight: "1px solid #f3f4f6",
  borderBottom: "1px solid #f3f4f6",
};

const legendDotStyle = (color: string): React.CSSProperties => ({
  display: "inline-block",
  width: 10,
  height: 10,
  borderRadius: "50%",
  background: color,
  marginRight: 4,
  verticalAlign: "middle",
});
