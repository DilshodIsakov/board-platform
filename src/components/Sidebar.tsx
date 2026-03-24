import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { Profile } from "../lib/profile";
import { updateProfileLocale } from "../lib/profile";

interface Props {
  profile: Profile | null;
  onSignOut: () => void;
  unreadNotificationsCount?: number;
  unreadChatCount?: number;
}

const ICONS: Record<string, string> = {
  info:         "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  dashboard:    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  calendar:     "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  vote:         "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  protocol:     "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  chat:         "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  docs:         "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  video:        "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  stats:        "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  tasks:        "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  shareholders: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  workplan:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M12 3v4M9 3h6M7 13h4m-4 3h6",
  bell:         "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  shield:       "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
};

function SidebarIcon({ name, size = 18 }: { name: string; size?: number }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: 0.85 }}
    >
      <path d={d} />
    </svg>
  );
}

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name[0].toUpperCase();
}

const ROLE_COLORS: Record<string, { bg: string; color: string }> = {
  admin:          { bg: "#1E3A5F", color: "#93C5FD" },
  corp_secretary: { bg: "#2D1B69", color: "#C4B5FD" },
  board_member:   { bg: "#1A2E1A", color: "#86EFAC" },
};

export default function Sidebar({ profile, onSignOut, unreadNotificationsCount = 0, unreadChatCount = 0 }: Props) {
  const { t } = useTranslation();

  type MenuItem = { to: string; label: string; icon: string };

  const menuItems: MenuItem[] = [
    { to: "/",               label: t("sidebar.dashboard"),      icon: "dashboard"    },
    { to: "/notifications",  label: t("sidebar.notifications"),  icon: "bell"         },
    { to: "/calendar",       label: t("sidebar.calendar"),       icon: "calendar"     },
    { to: "/ns-meetings",    label: t("sidebar.nsMeetings"),     icon: "protocol"     },
    { to: "/voting",         label: t("sidebar.voting"),         icon: "vote"         },
    { to: "/tasks",          label: t("sidebar.tasks"),          icon: "tasks"        },
    { to: "/chat",           label: t("sidebar.chat"),           icon: "chat"         },
    { to: "/documents",      label: t("sidebar.documents"),      icon: "docs"         },
    { to: "/videoconference",label: t("sidebar.videoconference"),icon: "video"        },
    { to: "/stats",          label: t("sidebar.stats"),          icon: "stats"        },
    { to: "/company",        label: t("sidebar.company"),        icon: "info"         },
    { to: "/shareholder-meeting", label: t("sidebar.shareholders"), icon: "shareholders" },
    ...(profile?.role === "admin" || profile?.role === "corp_secretary"
      ? [{ to: "/audit-log", label: t("sidebar.auditLog"), icon: "shield" }]
      : []),
    ...(profile?.role === "admin"
      ? [{ to: "/admin/users", label: t("admin.title"), icon: "shield" }]
      : []),
  ];

  const roleStyle = ROLE_COLORS[profile?.role || ""] || { bg: "#1F2937", color: "#9CA3AF" };

  return (
    <aside style={sidebarStyle}>
      {/* Brand */}
      <div style={brandSection}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={logoMark}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS.shield} />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#F8FAFC", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
              {t("sidebar.title")}
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginTop: 1, letterSpacing: "0.02em" }}>
              Supervisory Board
            </div>
          </div>
        </div>

        {/* Language selector */}
        <select
          value={i18n.language}
          onChange={(e) => {
            const lng = e.target.value;
            i18n.changeLanguage(lng);
            localStorage.setItem("locale", lng);
            updateProfileLocale(lng);
          }}
          style={langSelectStyle}
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="uz-Cyrl">Ўзбекча</option>
        </select>
      </div>

      {/* Navigation */}
      <nav style={navStyle}>
        {menuItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            style={({ isActive }) => ({
              ...navItemStyle,
              background: isActive ? "rgba(37,99,235,0.18)" : "transparent",
              color: isActive ? "#FFFFFF" : "var(--sidebar-text)",
              borderLeft: isActive ? "3px solid #2563EB" : "3px solid transparent",
            })}
          >
            <SidebarIcon name={item.icon} />
            <span style={{ flex: 1, fontSize: 13.5 }}>{item.label}</span>
            {item.to === "/notifications" && unreadNotificationsCount > 0 && (
              <span style={badgeStyle}>{unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}</span>
            )}
            {item.to === "/chat" && unreadChatCount > 0 && (
              <span style={badgeStyle}>{unreadChatCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile */}
      {profile && (
        <div style={userSection}>
          <NavLink to="/profile" style={{ textDecoration: "none", flexShrink: 0 }}>
            <div style={userAvatarStyle}>
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                : <span>{getInitials(profile.full_name || profile.email)}</span>
              }
            </div>
          </NavLink>
          <NavLink to="/profile" style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#F1F5F9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile.full_name || t("sidebar.user")}
            </div>
            <span style={{
              display: "inline-block",
              marginTop: 3,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              padding: "1px 8px",
              borderRadius: 10,
              background: roleStyle.bg,
              color: roleStyle.color,
            }}>
              {t(`roles.${profile.role}`, profile.role)}
            </span>
          </NavLink>
          <button onClick={onSignOut} style={logoutBtnStyle} title={t("sidebar.logout")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      )}
    </aside>
  );
}

// ── Styles ────────────────────────────────────────────────────

const sidebarStyle: React.CSSProperties = {
  width: "var(--sidebar-width)",
  height: "100vh",
  position: "fixed",
  top: 0,
  left: 0,
  background: "var(--sidebar-bg)",
  borderRight: "1px solid var(--sidebar-border)",
  display: "flex",
  flexDirection: "column",
  zIndex: 100,
  overflowY: "auto",
};

const brandSection: React.CSSProperties = {
  padding: "20px 16px 16px",
  borderBottom: "1px solid #1E2D3D",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const logoMark: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "#2563EB",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const langSelectStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 12,
  fontWeight: 500,
  color: "#94A3B8",
  cursor: "pointer",
  width: "100%",
  outline: "none",
};

const navStyle: React.CSSProperties = {
  flex: 1,
  padding: "10px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
  overflowY: "auto",
};

const navItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  borderRadius: 8,
  fontWeight: 500,
  textDecoration: "none",
  transition: "all 0.15s ease",
  lineHeight: 1.4,
  marginLeft: -3,
  paddingLeft: 12,
};

const badgeStyle: React.CSSProperties = {
  background: "#EF4444",
  color: "#FFFFFF",
  borderRadius: 10,
  minWidth: 18,
  height: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 700,
  padding: "0 4px",
  flexShrink: 0,
};

const userSection: React.CSSProperties = {
  padding: "12px 14px",
  borderTop: "1px solid #1E2D3D",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const userAvatarStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "#2563EB",
  color: "#FFFFFF",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
  overflow: "hidden",
};

const logoutBtnStyle: React.CSSProperties = {
  padding: 6,
  borderRadius: 6,
  color: "#475569",
  cursor: "pointer",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  transition: "color 0.15s",
};
