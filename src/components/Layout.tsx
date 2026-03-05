import { type ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Sidebar from "./Sidebar";
import type { Profile, Organization } from "../lib/profile";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  subscribeToNotifications,
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

export default function Layout({ children, profile, org, onSignOut }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Загрузка уведомлений и подписка на realtime
  useEffect(() => {
    if (!profile) return;

    fetchNotifications().then(setNotifications);
    fetchUnreadCount().then(setUnreadCount);

    const channel = subscribeToNotifications(profile.id, (n) => {
      setNotifications((prev) => [n, ...prev]);
      setUnreadCount((prev) => prev + 1);
    });

    return () => {
      unsubscribeFromNotifications(channel);
    };
  }, [profile]);

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

  return (
    <div style={containerStyle}>
      <Sidebar profile={profile} onSignOut={onSignOut} unreadNotificationsCount={unreadCount} />

      <div style={mainStyle}>
        {/* Top Header Bar */}
        <header style={headerStyle}>
          <div style={{ fontSize: 14, color: "#6B7280", fontWeight: 500 }}>
            {org ? `${t("layout.platformTitle")} (${org.name})` : t("layout.platformTitle")}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* Notification bell */}
            <div style={{ position: "relative" }}>
              <button
                ref={bellRef}
                style={headerIconBtnStyle}
                title={t("layout.notifications")}
                onClick={handleBellClick}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                  <span style={badgeStyle}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {dropdownOpen && (
                <div ref={dropdownRef} style={dropdownStyle}>
                  <div style={dropdownHeaderStyle}>
                    <span style={{ fontWeight: 600, fontSize: 15 }}>{t("layout.notifications")}</span>
                    {unreadCount > 0 && (
                      <button style={markAllBtnStyle} onClick={handleMarkAllRead}>
                        {t("layout.readAll")}
                      </button>
                    )}
                  </div>

                  <div style={dropdownListStyle}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: "24px 16px", textAlign: "center", color: "#9CA3AF", fontSize: 13 }}>
                        {t("layout.noNotifications")}
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          style={{
                            ...notificationItemStyle,
                            background: n.is_read ? "#FFFFFF" : "#EFF6FF",
                          }}
                          onClick={() => handleNotificationClick(n)}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                              {getIcon(n.type)}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                                {n.title}
                              </div>
                              {n.body && (
                                <div style={{
                                  fontSize: 12,
                                  color: "#6B7280",
                                  marginTop: 2,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}>
                                  {n.body}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>
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

            {/* User avatar */}
            {profile && (
              <div style={headerAvatarStyle}>
                {getInitials(profile.full_name || profile.email)}
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div style={contentStyle}>
          {children}
        </div>
      </div>
    </div>
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

function getIcon(type: string): string {
  switch (type) {
    case "task_assigned": return "\u{1F4CB}";
    case "task_status_changed": return "\u{1F504}";
    case "task_comment": return "\u{1F4AC}";
    case "personal_message": return "\u{2709}\uFE0F";
    case "group_message": return "\u{1F465}";
    case "meeting_invitation": return "\u{1F4C5}";
    default: return "\u{1F514}";
  }
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

const containerStyle: React.CSSProperties = {
  display: "flex",
  minHeight: "100vh",
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  marginLeft: "var(--sidebar-width)",
  display: "flex",
  flexDirection: "column",
  minHeight: "100vh",
};

const headerStyle: React.CSSProperties = {
  height: "var(--header-height)",
  background: "#FFFFFF",
  borderBottom: "1px solid #E5E7EB",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 32px",
  position: "sticky",
  top: 0,
  zIndex: 50,
};

const headerIconBtnStyle: React.CSSProperties = {
  position: "relative",
  padding: 6,
  borderRadius: 6,
  color: "#6B7280",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  background: "none",
  border: "none",
};

const headerAvatarStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "#3B82F6",
  color: "#FFFFFF",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 600,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  padding: "32px 40px",
};

const badgeStyle: React.CSSProperties = {
  position: "absolute",
  top: -4,
  right: -4,
  background: "#EF4444",
  color: "#FFFFFF",
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 10,
  minWidth: 18,
  height: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 4px",
  lineHeight: 1,
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 8px)",
  right: 0,
  width: 380,
  maxHeight: 480,
  background: "#FFFFFF",
  borderRadius: 12,
  boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
  border: "1px solid #E5E7EB",
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const dropdownHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 16px",
  borderBottom: "1px solid #F3F4F6",
};

const markAllBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#3B82F6",
  fontSize: 13,
  cursor: "pointer",
  fontWeight: 500,
};

const dropdownListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
};

const notificationItemStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid #F3F4F6",
  cursor: "pointer",
  transition: "background 0.15s",
};

const unreadDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  background: "#3B82F6",
  flexShrink: 0,
  marginTop: 4,
};
