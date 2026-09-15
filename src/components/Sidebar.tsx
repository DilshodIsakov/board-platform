import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { Profile } from "../lib/profile";
import { getLocalizedName } from "../lib/profile";

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
  committees:   "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  library:      "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.753 0-3.332.477-4.5 1.253",
  bell:         "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  shield:       "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  users:        "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
};

function SidebarIcon({ name, size = 16 }: { name: string; size?: number }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, opacity: 0.9 }}
      aria-hidden="true"
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

export default function Sidebar({ profile, onSignOut, unreadNotificationsCount = 0, unreadChatCount = 0 }: Props) {
  const { t } = useTranslation();

  type MenuItem = { to: string; label: string; icon: string };

  // Grouped by what a board member does: prepare → decide → communicate → reference.
  const groups: { caption?: string; items: MenuItem[] }[] = [
    { items: [
      { to: "/",               label: t("sidebar.dashboard"),      icon: "dashboard"    },
      { to: "/notifications",  label: t("sidebar.notifications"),  icon: "bell"         },
      { to: "/calendar",       label: t("sidebar.calendar"),       icon: "calendar"     },
    ]},
    { caption: t("sidebar.groupBoard"), items: [
      { to: "/ns-meetings",    label: t("sidebar.nsMeetings"),     icon: "protocol"     },
      { to: "/voting",         label: t("sidebar.voting"),         icon: "vote"         },
      { to: "/tasks",          label: t("sidebar.tasks"),          icon: "tasks"        },
      { to: "/documents",      label: t("sidebar.documents"),      icon: "docs"         },
      { to: "/committees",     label: t("sidebar.committees"),     icon: "committees"   },
      { to: "/shareholder-meeting", label: t("sidebar.shareholders"), icon: "shareholders" },
    ]},
    { caption: t("sidebar.groupComms"), items: [
      { to: "/chat",           label: t("sidebar.chat"),           icon: "chat"         },
      { to: "/videoconference",label: t("sidebar.videoconference"),icon: "video"        },
    ]},
    { caption: t("sidebar.groupReference"), items: [
      { to: "/company",        label: t("sidebar.company"),        icon: "info"         },
      { to: "/regulations",    label: t("sidebar.regulations"),    icon: "library"      },
      { to: "/stats",          label: t("sidebar.stats"),          icon: "stats"        },
      ...(profile?.role === "admin" || profile?.role === "corp_secretary"
        ? [{ to: "/audit-log", label: t("sidebar.auditLog"), icon: "shield" }]
        : []),
      ...(profile?.role === "admin"
        ? [{ to: "/admin/users", label: t("admin.title"), icon: "users" }]
        : []),
    ]},
  ];

  return (
    <aside style={sidebarStyle} aria-label="Navigation">
      <nav style={navStyle}>
        {groups.map((group, gi) => (
          <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: gi === 0 ? 0 : 12 }}>
            {group.caption && (
              <div style={captionStyle}>{group.caption}</div>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => (isActive ? "sidebar-nav-item active" : "sidebar-nav-item")}
                style={({ isActive }) => ({
                  ...navItemStyle,
                  background: isActive ? "var(--sidebar-active)" : "transparent",
                  color: isActive ? "var(--sidebar-text-active)" : "var(--sidebar-text)",
                })}
              >
                <SidebarIcon name={item.icon} />
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.to === "/notifications" && unreadNotificationsCount > 0 && (
                  <span style={countStyle}>{unreadNotificationsCount > 99 ? "99+" : unreadNotificationsCount}</span>
                )}
                {item.to === "/chat" && unreadChatCount > 0 && (
                  <span style={countStyle}>{unreadChatCount}</span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {profile && (
        <div style={userSection}>
          <NavLink to="/profile" style={{ textDecoration: "none", flexShrink: 0 }}>
            <div style={userAvatarStyle}>
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span>{getInitials(profile.full_name || profile.email)}</span>
              }
            </div>
          </NavLink>
          <NavLink to="/profile" style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {getLocalizedName(profile, i18n.language) || t("sidebar.user")}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--color-text-secondary)", marginTop: 1 }}>
              {t(`roles.${profile.role}`, profile.role)}
            </div>
          </NavLink>
          <button onClick={onSignOut} style={logoutBtnStyle} title={t("sidebar.logout")} aria-label={t("sidebar.logout")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
  position: "fixed",
  top: "var(--header-height)",
  bottom: 0,
  left: 0,
  background: "var(--sidebar-bg)",
  borderRight: "1px solid var(--sidebar-border)",
  display: "flex",
  flexDirection: "column",
  zIndex: 100,
  overflow: "hidden",
};

const navStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  overflowY: "auto",
  padding: "16px 12px",
};

const captionStyle: React.CSSProperties = {
  padding: "0 12px 6px",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--color-text-muted)",
};

const navItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minHeight: 40,
  padding: "8px 12px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  lineHeight: 1.3,
  transition: "background-color 120ms ease, color 120ms ease",
};

const countStyle: React.CSSProperties = {
  minWidth: 20,
  height: 20,
  padding: "0 7px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 999,
  background: "var(--color-primary)",
  color: "#ffffff",
  flexShrink: 0,
};

const userSection: React.CSSProperties = {
  padding: "12px 16px",
  borderTop: "1px solid var(--sidebar-border)",
  display: "flex",
  alignItems: "center",
  gap: 12,
};

const userAvatarStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "var(--color-primary)",
  color: "#ffffff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 600,
  flexShrink: 0,
  overflow: "hidden",
};

const logoutBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
