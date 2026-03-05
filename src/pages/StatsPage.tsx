import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Profile, Organization } from "../lib/profile";

interface MeetingRow {
  id: string;
  title: string;
  start_at: string;
  meet_url: string | null;
  status: string;
}

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

type PeriodFilter = "quarter" | "half" | "year" | "all";

type ExportFormat = "pdf" | "excel" | "csv";

export default function StatsPage({ profile }: Props) {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [decisionsCount, setDecisionsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>("quarter");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("pdf");

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    loadData();
  }, [profile, period]);

  const loadData = async () => {
    setLoading(true);

    // Build date filter
    let dateFilter: string | null = null;
    const now = new Date();
    if (period === "quarter") {
      const d = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      dateFilter = d.toISOString();
    } else if (period === "half") {
      const d = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      dateFilter = d.toISOString();
    } else if (period === "year") {
      const d = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      dateFilter = d.toISOString();
    }

    let query = supabase
      .from("meetings")
      .select("id, title, start_at, meet_url, status")
      .order("start_at", { ascending: false });

    if (dateFilter) {
      query = query.gte("start_at", dateFilter);
    }

    const { data: meetingsData } = await query;
    setMeetings((meetingsData as MeetingRow[]) || []);

    // Decisions count
    const { count } = await supabase.from("decisions").select("*", { count: "exact", head: true });
    setDecisionsCount(count || 0);

    setLoading(false);
  };

  const totalMeetings = meetings.length;
  const onlineMeetings = meetings.filter((m) => !!m.meet_url).length;
  const offlineMeetings = totalMeetings - onlineMeetings;

  // Average duration placeholder (120 min default, real data would need end_at)
  const avgDuration = totalMeetings > 0 ? 120 : 0;

  const handleExport = () => {
    if (meetings.length === 0) return;

    const headers = ["Дата", "Собрание", "Орган", "Формат", "Длительность"];
    const rows = meetings.map((m) => [
      new Date(m.start_at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }),
      m.title,
      "Наблюдательный совет",
      m.meet_url ? "Онлайн" : "Офлайн",
      "120 мин",
    ]);

    if (exportFormat === "csv") {
      const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      downloadBlob(blob, "statistics.csv");
    } else if (exportFormat === "excel") {
      // Simple HTML table that Excel can open
      const tableHtml = `<html><head><meta charset="utf-8"></head><body>
        <h2>Статистика и отчеты</h2>
        <p>Всего собраний: ${totalMeetings} | Онлайн: ${onlineMeetings} | Офлайн: ${offlineMeetings} | Решений: ${decisionsCount}</p>
        <table border="1" cellpadding="4"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>
        </body></html>`;
      const blob = new Blob(["\uFEFF" + tableHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
      downloadBlob(blob, "statistics.xls");
    } else {
      // PDF — open printable page
      const printWin = window.open("", "_blank");
      if (!printWin) return;
      printWin.document.write(`<html><head><meta charset="utf-8"><title>Статистика</title>
        <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}
        th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#f3f4f6}</style></head><body>
        <h2>Статистика и отчеты</h2>
        <p>Всего собраний: ${totalMeetings} | Онлайн: ${onlineMeetings} | Офлайн: ${offlineMeetings} | Решений: ${decisionsCount}</p>
        <table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>
        </body></html>`);
      printWin.document.close();
      printWin.print();
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return <div style={{ color: "#9CA3AF", padding: "40px 0" }}>Загрузка...</div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: 8 }}>Статистика и отчеты</h1>
      <p style={{ color: "#6B7280", fontSize: 16, marginBottom: 28 }}>
        Самооценка и проверка деятельности органов корпоративного управления
      </p>

      {/* Filters bar */}
      <div style={filterBarStyle}>
        <div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: 500 }}>Выберите орган управления</div>
          <select style={selectStyle}>
            <option>Все органы</option>
            <option>Наблюдательный совет</option>
            <option>Исполнительный орган</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: 500 }}>Период</div>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodFilter)}
            style={selectStyle}
          >
            <option value="quarter">Последний квартал</option>
            <option value="half">Последние 6 месяцев</option>
            <option value="year">Последний год</option>
            <option value="all">Все время</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 6, fontWeight: 500 }}>Формат экспорта</div>
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
            style={selectStyle}
          >
            <option value="pdf">PDF</option>
            <option value="excel">Excel</option>
            <option value="csv">CSV</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <button onClick={handleExport} style={exportBtnStyle}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
            Выгрузить
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={kpiGridStyle}>
        <KpiCard
          icon={<CalendarIcon />}
          iconBg="#DBEAFE"
          value={totalMeetings}
          label="Всего собраний"
          trend={totalMeetings > 0 ? "up" : undefined}
        />
        <KpiCard
          icon={<VideoIcon />}
          iconBg="#D1FAE5"
          value={`${onlineMeetings}/${offlineMeetings}`}
          label="Онлайн / Офлайн"
        />
        <KpiCard
          icon={<DocIcon />}
          iconBg="#FEE2E2"
          value={decisionsCount}
          label="Принято решений"
        />
        <KpiCard
          icon={<ChartIcon />}
          iconBg="#EDE9FE"
          value={avgDuration}
          label="Средняя длительность (мин)"
        />
      </div>

      {/* Meeting history table */}
      <div style={tableCardStyle}>
        <h2 style={{ margin: "0 0 20px 0" }}>История собраний</h2>

        {meetings.length === 0 ? (
          <p style={{ color: "#9CA3AF", fontSize: 15 }}>Нет собраний за выбранный период</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                <th style={thStyle}>Дата</th>
                <th style={thStyle}>Собрание</th>
                <th style={thStyle}>Орган</th>
                <th style={thStyle}>Формат</th>
                <th style={thStyle}>Длительность</th>
                <th style={thStyle}>Участники</th>
                <th style={thStyle}>Решения</th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => {
                const isOnline = !!m.meet_url;
                return (
                  <tr key={m.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                    <td style={tdStyle}>
                      {new Date(m.start_at).toLocaleDateString("ru-RU", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                      })}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500, color: "#111827" }}>{m.title}</td>
                    <td style={tdStyle}>
                      <span style={organBadgeStyle}>Наблюдательный совет</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {isOnline ? (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span style={{ color: "#059669", fontSize: 14 }}>Онлайн</span>
                          </>
                        ) : (
                          <>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span style={{ color: "#7C3AED", fontSize: 14 }}>Офлайн</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: "#6B7280" }}>120 мин</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span style={{ color: "#3B82F6", fontSize: 14 }}>—</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "#374151" }}>—</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// --- KPI Card ---

function KpiCard({ icon, iconBg, value, label, trend }: {
  icon: React.ReactNode;
  iconBg: string;
  value: number | string;
  label: string;
  trend?: "up" | "down";
}) {
  return (
    <div style={kpiCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ ...kpiIconStyle, background: iconBg }}>
          {icon}
        </div>
        {trend === "up" && (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 6l-9.5 9.5-5-5L1 18" />
            <path d="M17 6h6v6" />
          </svg>
        )}
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 14, color: "#6B7280", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// --- Icons ---

function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function DocIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

// --- Styles ---

const filterBarStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr auto",
  gap: 20,
  padding: "24px 28px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  marginBottom: 24,
  alignItems: "end",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  fontSize: 15,
  border: "1px solid #D1D5DB",
  borderRadius: 10,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#FFFFFF",
  cursor: "pointer",
};

const exportBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 28px",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 10,
  border: "none",
  background: "#3B82F6",
  color: "#FFFFFF",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const kpiGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 20,
  marginBottom: 28,
};

const kpiCardStyle: React.CSSProperties = {
  padding: "24px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
};

const kpiIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  borderRadius: 12,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const tableCardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
  padding: "28px 32px",
};

const thStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontWeight: 600,
  textAlign: "left",
  color: "#6B7280",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const tdStyle: React.CSSProperties = {
  padding: "14px",
  fontSize: 14,
  color: "#374151",
};

const organBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 12px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  background: "#DBEAFE",
  color: "#1E40AF",
};
