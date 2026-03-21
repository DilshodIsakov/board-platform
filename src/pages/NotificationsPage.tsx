import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getNotificationRoute,
  getLocalizedNotifContent,
  type Notification,
} from "../lib/notifications";
import { translateNotificationTexts } from "../lib/translationService";
import { useNotifications } from "../components/Layout";

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

type FilterType = "all" | "unread" | "meeting" | "voting" | "task" | "message";

const TYPE_ICONS: Record<string, string> = {
  task_assigned: "📋",
  task_status_changed: "🔄",
  task_comment: "💬",
  personal_message: "✉️",
  group_message: "👥",
  meeting_invitation: "📅",
  meeting_video_conference_activated: "🎥",
  voting_reminder: "🗳️",
};

// ── localStorage translation cache ───────────────────────────────────────────
type LangKey = "en" | "uz";
type TranslationMap = Record<string, { title: string; body: string }>;

function readTranslationCache(targetLang: LangKey): TranslationMap {
  try {
    return JSON.parse(localStorage.getItem(`notif_translations_${targetLang}`) || "{}");
  } catch {
    return {};
  }
}

function writeTranslationCache(targetLang: LangKey, data: TranslationMap) {
  try {
    localStorage.setItem(`notif_translations_${targetLang}`, JSON.stringify(data));
  } catch { /* localStorage full or unavailable */ }
}

export default function NotificationsPage({ profile }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const lang = i18n.language; // "ru", "en", "uz-Cyrl"

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  // Initialize from localStorage so translations survive page navigation
  const [autoTranslations, setAutoTranslations] = useState<Record<LangKey, TranslationMap>>(() => ({
    en: readTranslationCache("en"),
    uz: readTranslationCache("uz"),
  }));
  const [translating, setTranslating] = useState(false);

  const loadNotifications = useCallback(async () => {
    const data = await fetchNotifications(100);
    setNotifications(data);
    setLoading(false);
    return data;
  }, []);

  // Translate only notifications not yet in DB fields or local cache
  const autoTranslateMissing = useCallback(async (
    data: Notification[],
    currentLang: string
  ) => {
    const isUz = currentLang === "uz-Cyrl" || currentLang === "uz";
    const isEn = currentLang === "en";
    if (!isUz && !isEn) return;

    const targetLang: LangKey = isUz ? "uz" : "en";
    // Read the latest cache from localStorage (not from closure which may be stale)
    const cache = readTranslationCache(targetLang);

    const missing = data.filter((n) => {
      const hasStored = isUz ? !!n.title_uz : !!n.title_en;
      return !hasStored && !cache[n.id];
    });

    if (missing.length === 0) return;

    setTranslating(true);
    try {
      const result = await translateNotificationTexts(
        missing.map((n) => ({ id: n.id, title: n.title, body: n.body })),
        targetLang
      );
      const updated = { ...cache, ...result };
      writeTranslationCache(targetLang, updated);
      setAutoTranslations((prev) => ({ ...prev, [targetLang]: updated }));
    } catch { /* silently ignore */ }
    setTranslating(false);
  }, []);

  useEffect(() => {
    if (!profile) { setLoading(false); return; }
    loadNotifications().then((data) => autoTranslateMissing(data, lang));
  }, [profile?.id, loadNotifications]);

  // Re-check when language changes (may need new language's translations)
  useEffect(() => {
    if (notifications.length > 0) autoTranslateMissing(notifications, lang);
  }, [lang]);

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      await markNotificationRead(n.id);
      setNotifications((prev) => prev.map((item) => item.id === n.id ? { ...item, is_read: true } : item));
      refresh();
    }
    navigate(getNotificationRoute(n));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    refresh();
  };

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.is_read;
    if (filter === "meeting") return n.type === "meeting_invitation" || n.type === "meeting_video_conference_activated";
    if (filter === "voting") return n.type === "voting_reminder";
    if (filter === "task") return n.type.startsWith("task_");
    if (filter === "message") return n.type === "personal_message" || n.type === "group_message";
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading) return <div style={{ color: "#9CA3AF", padding: 40 }}>{t("common.loading")}</div>;

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all", label: t("notifications.filterAll") },
    { key: "unread", label: t("notifications.filterUnread") },
    { key: "meeting", label: t("notifications.filterMeetings") },
    { key: "voting", label: t("notifications.filterVoting") },
    { key: "task", label: t("notifications.filterTasks") },
    { key: "message", label: t("notifications.filterMessages") },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1>{t("notifications.title")}</h1>
        {unreadCount > 0 && (
          <button onClick={handleMarkAllRead} style={markAllBtnStyle}>
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 24 }}>
        {t("notifications.subtitle")}
      </p>

      {/* Filters */}
      <div style={filterBarStyle}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              ...filterBtnStyle,
              background: filter === f.key ? "#2563EB" : "#F3F4F6",
              color: filter === f.key ? "#fff" : "#374151",
            }}
          >
            {f.label}
            {f.key === "unread" && unreadCount > 0 && (
              <span style={filterBadgeStyle}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* Auto-translate indicator */}
      {translating && (
        <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 12 }}>
          ✦ {t("notifications.translating", "Переводим уведомления...")}
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div style={emptyStyle}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#374151" }}>
            {filter === "unread" ? t("notifications.noUnread") : t("notifications.empty")}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {filtered.map((n) => {
            const isUz = lang === "uz-Cyrl" || lang === "uz";
            const langKey = isUz ? "uz" : "en";
            const { title, body } = getLocalizedNotifContent(n, lang, autoTranslations[langKey]);
            return (
              <div
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  ...itemStyle,
                  background: n.is_read ? "#FFFFFF" : "#EFF6FF",
                  borderLeft: n.is_read ? "3px solid transparent" : "3px solid #3B82F6",
                }}
              >
                <div style={iconStyle}>
                  {TYPE_ICONS[n.type] || "🔔"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: 15, color: "#111827" }}>
                      {title}
                    </div>
                    <div style={{ fontSize: 12, color: "#9CA3AF", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {formatTime(n.created_at, t)}
                    </div>
                  </div>
                  {body && (
                    <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4, lineHeight: 1.4 }}>
                      {body}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 4 }}>
                    {t(`notifications.type_${n.type}`, n.type)}
                  </div>
                </div>
                {!n.is_read && <div style={dotStyle} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(dateStr: string, t: (key: string) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("notifications.justNow");
  if (mins < 60) return `${mins} ${t("notifications.minutesAgo")}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t("notifications.hoursAgo")}`;
  const days = Math.floor(hours / 24);
  return `${days} ${t("notifications.daysAgo")}`;
}

// Styles
const markAllBtnStyle: React.CSSProperties = {
  padding: "8px 16px", fontSize: 14, fontWeight: 500, borderRadius: 8,
  border: "1px solid #D1D5DB", background: "#fff", color: "#374151", cursor: "pointer",
};
const filterBarStyle: React.CSSProperties = {
  display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap",
};
const filterBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
  fontSize: 13, fontWeight: 500, borderRadius: 20, border: "none", cursor: "pointer",
};
const filterBadgeStyle: React.CSSProperties = {
  background: "#DC2626", color: "#fff", borderRadius: 10, padding: "0 6px",
  fontSize: 11, fontWeight: 600, minWidth: 18, textAlign: "center",
};
const emptyStyle: React.CSSProperties = {
  padding: "48px 32px", textAlign: "center", background: "#F9FAFB",
  border: "1px solid #E5E7EB", borderRadius: 12,
};
const itemStyle: React.CSSProperties = {
  display: "flex", gap: 12, padding: "16px 20px", cursor: "pointer",
  borderBottom: "1px solid #F3F4F6", transition: "background 0.15s", alignItems: "flex-start",
};
const iconStyle: React.CSSProperties = {
  fontSize: 20, width: 36, height: 36, display: "flex", alignItems: "center",
  justifyContent: "center", flexShrink: 0, background: "#F3F4F6", borderRadius: 10,
};
const dotStyle: React.CSSProperties = {
  width: 8, height: 8, borderRadius: "50%", background: "#3B82F6",
  flexShrink: 0, marginTop: 6,
};
