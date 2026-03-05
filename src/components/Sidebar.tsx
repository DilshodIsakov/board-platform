import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import type { Profile } from "../lib/profile";
import { updateProfileLocale } from "../lib/profile";

interface Props {
  profile: Profile | null;
  onSignOut: () => void;
}


const ICONS: Record<string, string> = {
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  dashboard: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
  calendar: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  vote: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  protocol: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  chat: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z",
  docs: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  video: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z",
  stats: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  tasks: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  shareholders: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  workplan: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M12 3v4M9 3h6M7 13h4m-4 3h6",
};

function SidebarIcon({ name }: { name: string }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
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

export default function Sidebar({ profile, onSignOut }: Props) {
  const { t } = useTranslation();

  const menuItems = [
    { to: "/company", label: t("sidebar.company"), icon: "info" },
    { to: "/", label: t("sidebar.dashboard"), icon: "dashboard" },
    { to: "/calendar", label: t("sidebar.calendar"), icon: "calendar" },
    { to: "/voting", label: t("sidebar.voting"), icon: "vote" },
    { to: "/ns-meetings", label: t("sidebar.nsMeetings"), icon: "protocol" },
    { to: "/chat", label: t("sidebar.chat"), icon: "chat" },
    { to: "/documents", label: t("sidebar.documents"), icon: "docs" },
    { to: "/tasks", label: t("sidebar.tasks"), icon: "tasks" },
    { to: "/board-work-plan", label: t("sidebar.workplan"), icon: "workplan" },
    { to: "/videoconference", label: t("sidebar.videoconference"), icon: "video" },
    { to: "/stats", label: t("sidebar.stats"), icon: "stats" },
    { to: "/shareholder-meeting", label: t("sidebar.shareholders"), icon: "shareholders" },
  ];

  return (
    <aside style={sidebarStyle}>
      {/* Logo / Title */}
      <div style={logoSection}>
        <div style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.3, color: "#111827", letterSpacing: "-0.02em" }}>
          {t("sidebar.title")}
        </div>
        <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 6 }}>
          <select
            value={i18n.language}
            onChange={(e) => {
              const lng = e.target.value;
              i18n.changeLanguage(lng);
              localStorage.setItem("locale", lng);
              updateProfileLocale(lng);
            }}
            style={{
              background: "none",
              border: "1px solid #E5E7EB",
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 13,
              color: "#6B7280",
              cursor: "pointer",
              width: "100%",
            }}
          >
            <option value="ru">🌐 Русский</option>
            <option value="en">🌐 English</option>
            <option value="uz-Cyrl">🌐 Ўзбекча</option>
          </select>
        </div>
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
              background: isActive ? "#3B82F6" : "transparent",
              color: isActive ? "#FFFFFF" : "#374151",
            })}
          >
            <SidebarIcon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User Profile at bottom */}
      {profile && (
        <div style={userSection}>
          <div style={userAvatarStyle}>
            {getInitials(profile.full_name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile.full_name || t("sidebar.user")}
            </div>
            <div style={{ fontSize: 12, color: "#9CA3AF" }}>
              {t(`roles.${profile.role}`) || profile.role}
            </div>
          </div>
          <button onClick={onSignOut} style={logoutBtnStyle} title={t("sidebar.logout")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      )}
    </aside>
  );
}

// --- Styles ---

const sidebarStyle: React.CSSProperties = {
  width: "var(--sidebar-width)",
  height: "100vh",
  position: "fixed",
  top: 0,
  left: 0,
  background: "#FFFFFF",
  borderRight: "1px solid #E5E7EB",
  display: "flex",
  flexDirection: "column",
  zIndex: 100,
  overflowY: "auto",
};

const logoSection: React.CSSProperties = {
  padding: "28px 20px 20px",
};

const navStyle: React.CSSProperties = {
  flex: 1,
  padding: "0 12px",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const navItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 14px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 500,
  textDecoration: "none",
  transition: "all 0.15s",
  lineHeight: 1.4,
};

const userSection: React.CSSProperties = {
  padding: "14px 16px",
  borderTop: "1px solid #E5E7EB",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const userAvatarStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "#3B82F6",
  color: "#FFFFFF",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 600,
  flexShrink: 0,
};

const logoutBtnStyle: React.CSSProperties = {
  padding: 6,
  borderRadius: 6,
  color: "#9CA3AF",
  cursor: "pointer",
  flexShrink: 0,
};
