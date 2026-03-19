import { useEffect, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import { fetchMeetings, type Meeting } from "../lib/meetings";
import { getIntlLocale } from "../i18n";
import { getLocalizedField } from "../lib/i18nHelpers";
import BoardWorkPlanPage from "./BoardWorkPlanPage";

/* ═══════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════ */

const STATUS_COLORS: Record<string, string> = {
  draft: "#94A3B8",
  scheduled: "#3B82F6",
  completed: "#10B981",
};
const WORK_PLAN_COLOR = "#8B5CF6";

type CalendarView = "month" | "week" | "list";
type EventFilter = "all" | "meetings" | "workplan";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const days: Date[] = [];
  const start = new Date(year, month, 1 - startOffset);
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

function getWeekDays(year: number, month: number, day: number): Date[] {
  const d = new Date(year, month, day);
  let offset = d.getDay() - 1;
  if (offset < 0) offset = 6;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return days;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ═══════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════ */

export default function CalendarPage({ profile, org }: Props) {
  const { t } = useTranslation();
  const weekdays = t("calendar.weekdays", { returnObjects: true }) as string[];
  const weekdaysFull = t("calendar.weekdaysFull", { returnObjects: true, defaultValue: [] }) as string[];
  const monthNames = t("calendar.months", { returnObjects: true }) as string[];

  const SS_TAB = "calendar_tab";
  const SS_YEAR = "calendar_year";
  const SS_MONTH = "calendar_month";
  const SS_VIEW = "calendar_view";

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

  const [view, setViewRaw] = useState<CalendarView>(() => {
    const saved = sessionStorage.getItem(SS_VIEW);
    return (saved === "week" || saved === "list") ? saved : "month";
  });
  const setView = useCallback((v: CalendarView) => {
    setViewRaw(v);
    sessionStorage.setItem(SS_VIEW, v);
  }, []);

  const [filter, setFilter] = useState<EventFilter>("all");
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>(dateKey(today));
  const [selectedEvent, setSelectedEvent] = useState<Meeting | null>(null);
  const [weekDay, setWeekDay] = useState(today.getDate());

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    fetchMeetings().then((data) => {
      setMeetings(data);
      setLoading(false);
    });
  }, [profile?.id]);

  // Filter meetings
  const filteredMeetings = meetings.filter((m) => {
    if (filter === "meetings") return m.source !== "work_plan";
    if (filter === "workplan") return m.source === "work_plan";
    return true;
  });

  // Group by date
  const meetingsByDate: Record<string, Meeting[]> = {};
  for (const m of filteredMeetings) {
    const key = dateKey(new Date(m.start_at));
    if (!meetingsByDate[key]) meetingsByDate[key] = [];
    meetingsByDate[key].push(m);
  }

  const days = getCalendarDays(year, month);
  const weekDays = getWeekDays(year, month, weekDay);
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
    setWeekDay(today.getDate());
    setSelectedDate(todayKey);
  };
  const prevWeek = () => {
    const d = new Date(year, month, weekDay - 7);
    setYear(d.getFullYear()); setMonth(d.getMonth()); setWeekDay(d.getDate());
  };
  const nextWeek = () => {
    const d = new Date(year, month, weekDay + 7);
    setYear(d.getFullYear()); setMonth(d.getMonth()); setWeekDay(d.getDate());
  };

  const handleDateClick = (key: string) => {
    setSelectedDate(key);
    setSelectedEvent(null);
  };
  const handleEventClick = (m: Meeting, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEvent(m);
    setSelectedDate(dateKey(new Date(m.start_at)));
  };

  // Selected date events
  const selectedDateEvents = meetingsByDate[selectedDate] || [];
  const selectedDateObj = selectedDate ? new Date(selectedDate + "T00:00:00") : today;

  // Event status helpers
  const statusLabel = (s: string) => {
    if (s === "draft") return t("meetingStatus.draft");
    if (s === "scheduled") return t("meetingStatus.scheduled");
    return t("meetingStatus.completed");
  };
  const statusColor = (s: string, source?: string) => {
    if (source === "work_plan") return WORK_PLAN_COLOR;
    return STATUS_COLORS[s] || "#94A3B8";
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(getIntlLocale(), { hour: "2-digit", minute: "2-digit" });

  /* ─── Event pill renderer ─── */
  const renderEventPill = (m: Meeting, compact = false) => {
    const isWorkPlan = m.source === "work_plan";
    const color = statusColor(m.status, m.source);
    const title = getLocalizedField(m as unknown as Record<string, unknown>, "title") as string;
    const time = formatTime(m.start_at);
    const isSelected = selectedEvent?.id === m.id;

    return (
      <div
        key={m.id}
        onClick={(e) => handleEventClick(m, e)}
        style={{
          padding: compact ? "4px 6px" : "5px 8px",
          marginBottom: 3,
          borderRadius: 6,
          borderLeft: `3px solid ${color}`,
          background: isSelected ? color + "20" : color + "0D",
          cursor: "pointer",
          transition: "all 0.15s",
          overflow: "hidden",
        }}
        title={`${isWorkPlan ? "[" + t("calendar.planNS") + "] " : ""}${title} — ${time}`}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 1 }}>
          {isWorkPlan && <span style={{ fontSize: 10 }}>📋</span>}
          <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>{time}</span>
        </div>
        <div style={{
          fontSize: 11, lineHeight: 1.35, color: "#374151",
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: compact ? 2 : 3, WebkitBoxOrient: "vertical" as const,
          wordBreak: "break-word",
        }}>
          {title}
        </div>
      </div>
    );
  };

  /* ─── Week range label ─── */
  const weekRangeLabel = () => {
    const s = weekDays[0];
    const e = weekDays[6];
    const sStr = s.toLocaleDateString(getIntlLocale(), { day: "numeric", month: "short" });
    const eStr = e.toLocaleDateString(getIntlLocale(), { day: "numeric", month: "short", year: "numeric" });
    return `${sStr} — ${eStr}`;
  };

  /* ─── List view events ─── */
  const listEvents = () => {
    const daysInMonth: string[] = [];
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
      daysInMonth.push(dateKey(new Date(d)));
    }
    return daysInMonth.filter((k) => meetingsByDate[k]?.length > 0);
  };

  return (
    <div>
      {/* ═══ Segmented Tab Control ═══ */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 24 }}>
        <div style={{
          display: "inline-flex", background: "#F1F5F9", borderRadius: 10, padding: 3,
          border: "1px solid #E2E8F0",
        }}>
          {(["calendar", "workplan"] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              style={{
                padding: "8px 24px", fontSize: 13, fontWeight: 600, border: "none",
                borderRadius: 8, cursor: "pointer", transition: "all 0.2s",
                background: tab === tabKey ? "#FFFFFF" : "transparent",
                color: tab === tabKey ? "#1E293B" : "#64748B",
                boxShadow: tab === tabKey ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              }}
            >
              {tabKey === "calendar" ? t("calendar.tabCalendar") : t("calendar.tabWorkplan")}
            </button>
          ))}
        </div>
      </div>

      {tab === "workplan" && <BoardWorkPlanPage profile={profile} org={org} />}

      {tab === "calendar" && (
        <div style={{
          background: "#FFFFFF", borderRadius: 16, border: "1px solid #E2E8F0",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
          overflow: "hidden",
        }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: "center", color: "#94A3B8" }}>{t("common.loading")}</div>
          ) : (
            <>
              {/* ═══ Calendar Header ═══ */}
              <div style={{
                padding: "20px 24px 16px",
                borderBottom: "1px solid #F1F5F9",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                flexWrap: "wrap", gap: 12,
              }}>
                {/* Left: navigation */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={view === "week" ? prevWeek : prevMonth} style={navBtn}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0F172A", minWidth: 200, textAlign: "center" }}>
                    {view === "week" ? weekRangeLabel() : `${monthNames[month]} ${year}`}
                  </h2>
                  <button onClick={view === "week" ? nextWeek : nextMonth} style={navBtn}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                  <button onClick={goToday} style={todayBtn}>
                    {t("calendar.today")}
                  </button>
                </div>

                {/* Right: view toggle */}
                <div style={{
                  display: "inline-flex", background: "#F8FAFC", borderRadius: 8, padding: 2,
                  border: "1px solid #E2E8F0",
                }}>
                  {(["month", "week", "list"] as CalendarView[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      style={{
                        padding: "5px 14px", fontSize: 12, fontWeight: 500, border: "none",
                        borderRadius: 6, cursor: "pointer", transition: "all 0.15s",
                        background: view === v ? "#FFFFFF" : "transparent",
                        color: view === v ? "#1E293B" : "#94A3B8",
                        boxShadow: view === v ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                      }}
                    >
                      {t(`calendar.view${v.charAt(0).toUpperCase() + v.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ═══ Filters ═══ */}
              <div style={{
                padding: "12px 24px",
                borderBottom: "1px solid #F1F5F9",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                {(["all", "meetings", "workplan"] as EventFilter[]).map((f) => {
                  const active = filter === f;
                  const dotColor = f === "meetings" ? "#3B82F6" : f === "workplan" ? WORK_PLAN_COLOR : undefined;
                  return (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      style={{
                        padding: "5px 14px", fontSize: 12, fontWeight: 500,
                        borderRadius: 20, border: "1px solid",
                        borderColor: active ? "#3B82F6" : "#E2E8F0",
                        background: active ? "#EFF6FF" : "#FFFFFF",
                        color: active ? "#2563EB" : "#64748B",
                        cursor: "pointer", transition: "all 0.15s",
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      {dotColor && <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
                      {t(`calendar.filter${f.charAt(0).toUpperCase() + f.slice(1)}`)}
                    </button>
                  );
                })}
              </div>

              {/* ═══ Calendar Body ═══ */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 320px" }}>
                {/* Main calendar area */}
                <div style={{ borderRight: "1px solid #F1F5F9" }}>

                  {/* ── MONTH VIEW ── */}
                  {view === "month" && (
                    <div>
                      {/* Weekday headers */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                        {weekdays.map((wd, idx) => (
                          <div key={wd} style={{
                            padding: "10px 8px", textAlign: "center",
                            fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const,
                            letterSpacing: "0.05em", color: "#94A3B8",
                            background: "#FAFBFC",
                            borderBottom: "1px solid #F1F5F9",
                            borderRight: idx < 6 ? "1px solid #F8FAFC" : "none",
                          }}>
                            {wd}
                          </div>
                        ))}
                      </div>

                      {/* Day grid */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                        {days.map((day, i) => {
                          const key = dateKey(day);
                          const isCurrentMonth = day.getMonth() === month;
                          const isToday = key === todayKey;
                          const isSelected = key === selectedDate;
                          const dayMeetings = meetingsByDate[key] || [];
                          const realMeetings = dayMeetings.filter((m) => m.source !== "work_plan");
                          const planMeetings = dayMeetings.filter((m) => m.source === "work_plan");
                          const hasMeeting = realMeetings.length > 0;

                          return (
                            <div
                              key={i}
                              onClick={() => handleDateClick(key)}
                              style={{
                                minHeight: 110,
                                padding: "4px 5px",
                                borderRight: (i + 1) % 7 !== 0 ? "1px solid #F8FAFC" : "none",
                                borderBottom: "1px solid #F1F5F9",
                                cursor: "pointer",
                                transition: "background 0.15s",
                                background: hasMeeting && isCurrentMonth
                                  ? "#EFF6FF"
                                  : isSelected ? "#F8FAFC" : "transparent",
                                opacity: isCurrentMonth ? 1 : 0.3,
                              }}
                            >
                              {/* Day number */}
                              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: isToday ? 28 : "auto", height: isToday ? 28 : "auto",
                                  borderRadius: isToday ? "50%" : 0,
                                  background: isToday ? "#3B82F6" : "transparent",
                                  color: isToday ? "#FFFFFF" : hasMeeting ? "#1E40AF" : isSelected ? "#1E293B" : "#64748B",
                                  fontSize: 13, fontWeight: isToday || isSelected || hasMeeting ? 700 : 400,
                                  padding: isToday ? 0 : "2px 4px",
                                }}>
                                  {day.getDate()}
                                </span>
                              </div>

                              {/* Real meetings — show as simple blue label */}
                              {hasMeeting && (
                                <div
                                  onClick={(e) => { e.stopPropagation(); handleEventClick(realMeetings[0], e); }}
                                  style={{
                                    padding: "5px 8px", marginBottom: 3,
                                    borderRadius: 6,
                                    background: "#3B82F6",
                                    cursor: "pointer",
                                  }}
                                >
                                  <div style={{ fontSize: 11, fontWeight: 600, color: "#FFFFFF", lineHeight: 1.3 }}>
                                    {t("calendar.meetingNS")}
                                  </div>
                                  {realMeetings.length > 1 && (
                                    <div style={{ fontSize: 10, color: "#BFDBFE", marginTop: 1 }}>
                                      +{realMeetings.length - 1} {t("calendar.more")}
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Work plan events — compact pills */}
                              {planMeetings.slice(0, hasMeeting ? 1 : 2).map((m) => renderEventPill(m, true))}
                              {planMeetings.length > (hasMeeting ? 1 : 2) && (
                                <div style={{
                                  fontSize: 10, color: "#94A3B8", fontWeight: 500,
                                  textAlign: "center", padding: "2px 0",
                                }}>
                                  +{planMeetings.length - (hasMeeting ? 1 : 2)} {t("calendar.more")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── WEEK VIEW ── */}
                  {view === "week" && (
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                        {weekDays.map((day, idx) => {
                          const key = dateKey(day);
                          const isToday = key === todayKey;
                          const isSelected = key === selectedDate;
                          const dayMeetings = meetingsByDate[key] || [];
                          const wdLabel = weekdaysFull.length === 7 ? weekdaysFull[idx] : weekdays[idx];

                          return (
                            <div
                              key={idx}
                              onClick={() => handleDateClick(key)}
                              style={{
                                minHeight: 320,
                                borderRight: idx < 6 ? "1px solid #F1F5F9" : "none",
                                cursor: "pointer",
                                background: isSelected ? "#F8FAFC" : "transparent",
                              }}
                            >
                              {/* Header */}
                              <div style={{
                                padding: "12px 8px 8px", textAlign: "center",
                                borderBottom: "1px solid #F1F5F9",
                              }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>
                                  {wdLabel}
                                </div>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                                  width: 32, height: 32, borderRadius: "50%",
                                  background: isToday ? "#3B82F6" : "transparent",
                                  color: isToday ? "#FFFFFF" : "#1E293B",
                                  fontSize: 16, fontWeight: 600,
                                }}>
                                  {day.getDate()}
                                </span>
                              </div>
                              {/* Events */}
                              <div style={{ padding: "6px 4px" }}>
                                {dayMeetings.map((m) => renderEventPill(m))}
                                {dayMeetings.length === 0 && (
                                  <div style={{ fontSize: 11, color: "#CBD5E1", textAlign: "center", padding: "20px 0" }}>—</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── LIST VIEW ── */}
                  {view === "list" && (
                    <div style={{ padding: "16px 20px" }}>
                      {listEvents().length === 0 && (
                        <div style={{ textAlign: "center", color: "#94A3B8", padding: 40, fontSize: 14 }}>
                          {t("calendar.noEvents")}
                        </div>
                      )}
                      {listEvents().map((key) => {
                        const d = new Date(key + "T00:00:00");
                        const evts = meetingsByDate[key] || [];
                        const isToday = key === todayKey;
                        return (
                          <div key={key} style={{ marginBottom: 16 }}>
                            <div style={{
                              fontSize: 13, fontWeight: 600, color: isToday ? "#3B82F6" : "#64748B",
                              marginBottom: 8, display: "flex", alignItems: "center", gap: 8,
                            }}>
                              {d.toLocaleDateString(getIntlLocale(), { weekday: "short", day: "numeric", month: "long" })}
                              {isToday && (
                                <span style={{
                                  fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                                  background: "#EFF6FF", color: "#3B82F6",
                                }}>{t("calendar.today")}</span>
                              )}
                            </div>
                            {evts.map((m) => {
                              const color = statusColor(m.status, m.source);
                              const title = getLocalizedField(m as unknown as Record<string, unknown>, "title") as string;
                              const isWorkPlan = m.source === "work_plan";
                              return (
                                <div
                                  key={m.id}
                                  onClick={(e) => handleEventClick(m, e)}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 12,
                                    padding: "10px 14px", marginBottom: 4,
                                    borderRadius: 10, border: "1px solid #F1F5F9",
                                    cursor: "pointer", transition: "all 0.15s",
                                    background: selectedEvent?.id === m.id ? color + "08" : "#FFFFFF",
                                    borderLeft: `3px solid ${color}`,
                                  }}
                                >
                                  <div style={{
                                    width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                    background: color + "10", color,
                                  }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{formatTime(m.start_at)}</span>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1E293B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {isWorkPlan && "📋 "}{title}
                                    </div>
                                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                                      {statusLabel(m.status)}
                                    </div>
                                  </div>
                                  <span style={{
                                    width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0,
                                  }} />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ═══ Legend ═══ */}
                  <div style={{
                    padding: "14px 24px",
                    borderTop: "1px solid #F1F5F9",
                    display: "flex", gap: 4, flexWrap: "wrap",
                  }}>
                    {[
                      { color: "#94A3B8", label: t("meetingStatus.draft") },
                      { color: "#3B82F6", label: t("meetingStatus.scheduled") },
                      { color: "#10B981", label: t("meetingStatus.completed") },
                      { color: WORK_PLAN_COLOR, label: t("calendar.planNS") },
                    ].map(({ color, label }) => (
                      <span key={label} style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", borderRadius: 6,
                        background: color + "08", fontSize: 11, fontWeight: 500, color: "#64748B",
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* ═══ Right Details Panel ═══ */}
                <div style={{ padding: "20px 20px", minHeight: 500, background: "#FAFBFC" }}>
                  {/* Date header */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>
                      {selectedDateObj.toLocaleDateString(getIntlLocale(), { weekday: "long" })}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A" }}>
                      {selectedDateObj.toLocaleDateString(getIntlLocale(), { day: "numeric", month: "long", year: "numeric" })}
                    </div>
                    {selectedDateEvents.length > 0 && (
                      <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                        {selectedDateEvents.length} {t("calendar.eventsCount")}
                      </div>
                    )}
                  </div>

                  {/* Selected event details */}
                  {selectedEvent ? (() => {
                    const color = statusColor(selectedEvent.status, selectedEvent.source);
                    const title = getLocalizedField(selectedEvent as unknown as Record<string, unknown>, "title") as string;
                    const isWorkPlan = selectedEvent.source === "work_plan";
                    return (
                      <div style={{
                        background: "#FFFFFF", borderRadius: 12, padding: 16,
                        border: "1px solid #E2E8F0",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                      }}>
                        {/* Status badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "3px 10px", borderRadius: 6,
                            background: color + "14", color, fontSize: 11, fontWeight: 600,
                          }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                            {statusLabel(selectedEvent.status)}
                          </span>
                          {isWorkPlan && (
                            <span style={{
                              padding: "3px 10px", borderRadius: 6,
                              background: WORK_PLAN_COLOR + "14", color: WORK_PLAN_COLOR,
                              fontSize: 11, fontWeight: 600,
                            }}>
                              📋 {t("calendar.planNS")}
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "#0F172A", lineHeight: 1.4 }}>
                          {title}
                        </h3>

                        {/* Info rows */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#94A3B8" strokeWidth="1.5"/><path d="M8 5v3.5l2.5 1.5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            <span style={{ fontSize: 13, color: "#475569" }}>{formatTime(selectedEvent.start_at)}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="#94A3B8" strokeWidth="1.5"/><path d="M2 7h12M5 1v4M11 1v4" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            <span style={{ fontSize: 13, color: "#475569" }}>
                              {new Date(selectedEvent.start_at).toLocaleDateString(getIntlLocale(), { day: "numeric", month: "long", year: "numeric" })}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 8 }}>
                          <Link
                            to={isWorkPlan ? "/calendar?tab=workplan" : `/ns-meetings?meetingId=${selectedEvent.id}`}
                            style={{
                              flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                              padding: "9px 16px", borderRadius: 8,
                              background: "#1E293B", color: "#FFFFFF",
                              fontSize: 12, fontWeight: 600, textDecoration: "none",
                              transition: "opacity 0.15s",
                            }}
                          >
                            {t("calendar.openEvent")}
                          </Link>
                        </div>
                      </div>
                    );
                  })() : (
                    <>
                      {/* Events list for selected date */}
                      {selectedDateEvents.length === 0 ? (
                        <div style={{
                          textAlign: "center", padding: "40px 0", color: "#CBD5E1",
                        }}>
                          <div style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }}>📅</div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{t("calendar.noEventsOnDate")}</div>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {selectedDateEvents.map((m) => {
                            const color = statusColor(m.status, m.source);
                            const title = getLocalizedField(m as unknown as Record<string, unknown>, "title") as string;
                            const isWorkPlan = m.source === "work_plan";
                            return (
                              <div
                                key={m.id}
                                onClick={(e) => handleEventClick(m, e)}
                                style={{
                                  padding: "12px 14px", borderRadius: 10,
                                  background: "#FFFFFF", border: "1px solid #E2E8F0",
                                  borderLeft: `3px solid ${color}`,
                                  cursor: "pointer", transition: "all 0.15s",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color }}>{formatTime(m.start_at)}</span>
                                  {isWorkPlan && <span style={{ fontSize: 10 }}>📋</span>}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: "#1E293B", lineHeight: 1.4 }}>
                                  {title}
                                </div>
                                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                                  {statusLabel(m.status)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Styles
   ═══════════════════════════════════════════════════════ */

const navBtn: React.CSSProperties = {
  width: 34, height: 34,
  display: "flex", alignItems: "center", justifyContent: "center",
  borderRadius: 8, border: "1px solid #E2E8F0",
  background: "#FFFFFF", cursor: "pointer",
  transition: "all 0.15s",
};

const todayBtn: React.CSSProperties = {
  padding: "6px 16px", fontSize: 12, fontWeight: 600,
  borderRadius: 8, border: "1px solid #E2E8F0",
  background: "#FFFFFF", color: "#3B82F6",
  cursor: "pointer", transition: "all 0.15s",
};
