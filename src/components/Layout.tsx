import { type ReactNode, useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Sidebar from "./Sidebar";
import { getLocalizedName, updateProfileLocale, type Profile, type Organization } from "../lib/profile";
import { getLocalizedOrgName } from "../lib/profile";
import {
  fetchNotifications,
  fetchUnreadCount,
  fetchUnreadChatCount,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
  subscribeToNotificationUpdates,
  unsubscribeFromNotifications,
  getNotificationRoute,
  type Notification,
} from "../lib/notifications";

interface Props {
  children: ReactNode;
  profile: Profile | null;
  org: Organization | null;
  onSignOut: () => void;
}

export const NotificationContext = createContext({ refresh: () => {} });

export function useNotifications() {
  return useContext(NotificationContext);
}

export default function Layout({ children, profile, org, onSignOut }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const refreshNotifications = useCallback(() => {
    fetchUnreadCount().then(setUnreadCount).catch(console.error);
    // также обновляем количество непрочитанных чатов
    fetchUnreadChatCount().then(setUnreadChatCount).catch(console.error);
  }, []);

  // Загрузка уведомлений и подписка на realtime
  useEffect(() => {
    if (!profile) return;

    fetchNotifications().then(setNotifications);
    fetchUnreadCount().then(setUnreadCount);
    fetchUnreadChatCount().then(setUnreadChatCount);

    // Подписка на новые уведомления
    const insertChannel = subscribeToNotifications(profile.id, (n) => {
      setNotifications((prev) => [n, ...prev]);
      setUnreadCount((prev) => prev + 1);
      // Re-fetch chat unread count from messages table (authoritative source)
      if (n.related_entity_type === "message") {
        fetchUnreadChatCount().then(setUnreadChatCount).catch(console.error);
      }
    });

    // Подписка на обновления уведомлений (для синхронизации при прочтении в чате)
    const updateChannel = subscribeToNotificationUpdates(profile.id, (updatedNotification) => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === updatedNotification.id ? updatedNotification : n
        )
      );
      // Always re-fetch authoritative counts from DB
      fetchUnreadCount().then(setUnreadCount).catch(console.error);
      fetchUnreadChatCount().then(setUnreadChatCount).catch(console.error);
    });

    return () => {
      unsubscribeFromNotifications(insertChannel);
      unsubscribeFromNotifications(updateChannel);
    };
  }, [profile?.id]);

  // Закрытие дропдауна при клике вне
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

  const handleBellClick = useCallback(() => {
    setDropdownOpen((prev) => !prev);
  }, []);

  const handleNotificationClick = useCallback(
    async (n: Notification) => {
      if (!n.is_read) {
        await markNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        if (n.related_entity_type === "message") {
          setUnreadChatCount((prev) => Math.max(0, prev - 1));
        }
      }
      setDropdownOpen(false);
      navigate(getNotificationRoute(n));
    },
    [navigate]
  );

  const handleMarkAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, []);

  const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchQuery.trim();
      if (q.length >= 2) {
        navigate(`/search?q=${encodeURIComponent(q)}`);
        setSearchQuery("");
      }
    },
    [navigate, searchQuery]
  );

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("locale", lng);
    updateProfileLocale(lng);
  };

  return (
    <NotificationContext.Provider value={{ refresh: refreshNotifications }}>
      {/* Header: the single dark surface in the system */}
      <header style={headerStyle}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--shell-header-text)", whiteSpace: "nowrap" }}>
            {t("sidebar.title")}
          </span>
          {org && (
            <span style={{ fontSize: 14, color: "var(--shell-header-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {getLocalizedOrgName(org, i18n.language)}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", height: "100%" }}>
          <form onSubmit={handleSearchSubmit} style={{ display: "flex", height: "100%" }}>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("search.placeholder")}
              title={t("search.title")}
              style={headerSearchStyle}
            />
          </form>

          <select
            value={i18n.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={langSelectStyle}
            aria-label="Language"
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="uz-Cyrl">Ўзбекча</option>
          </select>

          <div style={{ position: "relative", height: "100%" }}>
            <button
              ref={bellRef}
              style={headerIconBtnStyle}
              title={t("layout.notifications")}
              aria-label={t("layout.notifications")}
              onClick={handleBellClick}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span style={badgeStyle}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {dropdownOpen && (
              <div ref={dropdownRef} style={dropdownStyle}>
                <div style={dropdownHeaderStyle}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{t("layout.notifications")}</span>
                  {unreadCount > 0 && (
                    <button style={markAllBtnStyle} onClick={handleMarkAllRead}>
                      {t("layout.readAll")}
                    </button>
                  )}
                </div>

                <div style={dropdownListStyle}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: "24px 16px", color: "#525252", fontSize: 14 }}>
                      {t("layout.noNotifications")}
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        style={{
                          ...notificationItemStyle,
                          background: n.is_read ? "#ffffff" : "#edf5ff",
                        }}
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 600, color: "#161616" }}>
                              {n.title}
                            </div>
                            {n.body && (
                              <div style={{
                                fontSize: 14,
                                color: "#525252",
                                marginTop: 2,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}>
                                {n.body}
                              </div>
                            )}
                            <div style={{ fontSize: 12, color: "#8c8c8c", marginTop: 4, letterSpacing: "0.32px" }}>
                              {formatTimeAgo(n.created_at, t)}
                            </div>
                          </div>
                          {!n.is_read && (
                            <span style={unreadDotStyle} />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {profile && (
            <button
              onClick={() => navigate("/profile")}
              style={headerAvatarBtnStyle}
              title={getLocalizedName(profile, i18n.language) || profile.email}
              aria-label={t("sidebar.user")}
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" style={headerAvatarImgStyle} />
              ) : (
                <span style={headerAvatarStyle}>
                  {getInitials(getLocalizedName(profile, i18n.language) || profile.email)}
                </span>
              )}
            </button>
          )}
        </div>
      </header>

      {isDemoMode && (
        <div style={demoBannerStyle}>
          Демо-версия · Demo version · Демо версия —{" "}
          secretary@demo.almaz.uz / chairman@demo.almaz.uz / member@demo.almaz.uz, пароль <strong>Demo1234!</strong>
        </div>
      )}

      <div style={containerStyle}>
        <Sidebar profile={profile} onSignOut={onSignOut} unreadNotificationsCount={unreadCount} unreadChatCount={unreadChatCount} />
        <main style={mainStyle}>
          <div style={contentStyle}>
            {children}
          </div>
        </main>
      </div>
    </NotificationContext.Provider>
  );
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name[0].toUpperCase();
}

function formatTimeAgo(isoDate: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("layout.justNow");
  if (mins < 60) return t("layout.minutesAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("layout.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("layout.daysAgo", { count: days });
  return new Date(isoDate).toLocaleDateString();
}

// --- Styles ---

const headerStyle: React.CSSProperties = {
  height: "var(--header-height)",
  background: "var(--shell-header-bg)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 0 0 16px",
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: 200,
};

const containerStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
  paddingTop: "var(--header-height)",
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  marginLeft: "var(--sidebar-width)",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  padding: "32px 32px 64px",
  width: "100%",
  maxWidth: 1584,
  boxSizing: "border-box" as const,
};

const headerSearchStyle: React.CSSProperties = {
  width: 240,
  height: "100%",
  padding: "0 16px",
  fontSize: 14,
  border: "none",
  borderLeft: "1px solid #393939",
  background: "var(--shell-header-bg)",
  color: "var(--shell-header-text)",
  boxSizing: "border-box",
  outline: "none",
};

const langSelectStyle: React.CSSProperties = {
  height: "100%",
  padding: "0 12px",
  fontSize: 14,
  border: "none",
  borderLeft: "1px solid #393939",
  background: "var(--shell-header-bg)",
  color: "var(--shell-header-muted)",
  cursor: "pointer",
  outline: "none",
};

const headerIconBtnStyle: React.CSSProperties = {
  position: "relative",
  width: 48,
  height: "100%",
  color: "var(--shell-header-muted)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "none",
  border: "none",
  borderLeft: "1px solid #393939",
};

const headerAvatarBtnStyle: React.CSSProperties = {
  width: 48,
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderLeft: "1px solid #393939",
  cursor: "pointer",
};

const headerAvatarStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  background: "var(--color-primary)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0,
};

const headerAvatarImgStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  objectFit: "cover",
};

const badgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  background: "var(--color-primary)",
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0,
  minWidth: 16,
  height: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 4px",
  lineHeight: 1,
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  width: 384,
  maxHeight: 480,
  background: "#ffffff",
  boxShadow: "var(--shadow-overlay)",
  border: "1px solid #e0e0e0",
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  color: "#161616",
};

const dropdownHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: "1px solid #e0e0e0",
};

const demoBannerStyle: React.CSSProperties = {
  position: "sticky",
  top: "var(--header-height)",
  zIndex: 150,
  background: "#fcf4d6",
  borderBottom: "1px solid #f1c21b",
  padding: "8px 16px",
  fontSize: 12,
  color: "#161616",
  textAlign: "center",
  letterSpacing: "0.32px",
};

const markAllBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--color-primary)",
  fontSize: 14,
  cursor: "pointer",
};

const dropdownListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
};

const notificationItemStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #e0e0e0",
  cursor: "pointer",
  transition: "background 70ms",
};

const unreadDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "var(--color-primary)",
  flexShrink: 0,
  marginTop: 6,
};
