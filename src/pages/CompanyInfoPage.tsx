import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import type { Profile, Organization } from "../lib/profile";

const BOARD_ROLES = ["corp_secretary", "board_member"];
const EXECUTIVE_ROLES = ["executive"];

interface MemberProfile {
  id: string;
  full_name: string;
  role: string;
  role_details: string | null;
}

interface Props {
  profile: Profile | null;
  org: Organization | null;
}

type TabKey = "board" | "executive" | "kpi";

export default function CompanyInfoPage({ profile }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [members, setMembers] = useState<MemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTabRaw] = useState<TabKey>(
    () => (sessionStorage.getItem("companyInfo_tab") as TabKey) || "board"
  );
  const setActiveTab = (tab: TabKey) => {
    setActiveTabRaw(tab);
    sessionStorage.setItem("companyInfo_tab", tab);
  };

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }
    loadMembers();
  }, [profile]);

  const loadMembers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, role_details")
      .order("full_name");

    if (error) {
      console.error("loadMembers error:", error);
    }

    setMembers((data as MemberProfile[]) || []);
    setLoading(false);
  };

  const boardMembers = members.filter((m) => BOARD_ROLES.includes(m.role));
  const executives = members.filter((m) => EXECUTIVE_ROLES.includes(m.role));

  if (loading) {
    return (
      <div style={{ color: "#9CA3AF", padding: "40px 0" }}>{t("common.loading")}</div>
    );
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: "board", label: t("company.boardTab") },
    { key: "executive", label: t("company.managementTab") },
    { key: "kpi", label: t("company.kpiTab") },
  ];

  const currentMembers = activeTab === "board" ? boardMembers : activeTab === "executive" ? executives : [];

  return (
    <div>
      {/* Page Title */}
      <h1 style={{ marginBottom: 8 }}>{t("company.title")}</h1>
      <p style={{ color: "#6B7280", fontSize: 16, marginBottom: 28 }}>
        {t("company.subtitle")}
      </p>

      {/* KPI Cards */}
      <div style={kpiGridStyle}>
        <KpiCard
          color="#7C3AED"
          bgColor="#F3E8FF"
          icon="users"
          value={boardMembers.length}
          label={t("company.boardOfDirectors")}
        />
        <KpiCard
          color="#3B82F6"
          bgColor="#DBEAFE"
          icon="briefcase"
          value={executives.length}
          label={t("company.management")}
        />
      </div>

      {/* Tabs */}
      <div style={tabBarStyle}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              ...tabBtnStyle,
              color: activeTab === tab.key ? "#3B82F6" : "#6B7280",
              borderBottomColor: activeTab === tab.key ? "#3B82F6" : "transparent",
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "kpi" ? (
        <KpiTabContent />
      ) : currentMembers.length === 0 ? (
        <p style={{ color: "#9CA3AF", padding: "32px 0" }}>
          {t("company.noMembers")}
        </p>
      ) : (
        <div>
          {currentMembers.map((m) => (
            <MemberCard key={m.id} member={m} isSelf={m.id === profile?.id} onMessage={() => navigate(`/chat?userId=${m.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- KPI Card ---

const KPI_ICONS: Record<string, string> = {
  users: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  star: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z",
  briefcase: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M3.2 14.5V19a2 2 0 002 2h13.6a2 2 0 002-2v-4.5M3 7h18v5H3z",
};

function KpiCard({ color, bgColor, icon, value, label }: {
  color: string; bgColor: string; icon: string; value: number; label: string;
}) {
  return (
    <div style={kpiCardStyle}>
      <div style={{ ...kpiIconBoxStyle, background: bgColor }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={KPI_ICONS[icon] || KPI_ICONS.users} />
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 36, fontWeight: 700, color: "#111827", lineHeight: 1.15 }}>{value}</div>
        <div style={{ fontSize: 15, color: "#6B7280", marginTop: 4 }}>{label}</div>
      </div>
    </div>
  );
}

// --- Member Card ---

const ROLE_BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  corp_secretary: { bg: "#DBEAFE", color: "#1E40AF" },
  board_member: { bg: "#D1FAE5", color: "#065F46" },
  executive: { bg: "#FEF3C7", color: "#92400E" },
  management: { bg: "#E0E7FF", color: "#3730A3" },
  admin: { bg: "#F3E8FF", color: "#6B21A8" },
  employee: { bg: "#F3F4F6", color: "#374151" },
  auditor: { bg: "#FEE2E2", color: "#991B1B" },
};

const AVATAR_COLORS = ["#7C3AED", "#059669", "#DC2626", "#2563EB", "#D97706", "#0891B2"];

function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name[0].toUpperCase();
}

function MemberCard({ member, isSelf, onMessage }: { member: MemberProfile; isSelf: boolean; onMessage: () => void }) {
  const { t, i18n } = useTranslation();

  const translateRoleDetail = (detail: string) => {
    if (i18n.language === "en") {
      const key = `roleDetails.${detail}`;
      const translated = t(key);
      if (translated !== key) return translated;
    }
    return detail;
  };
  const badgeColors = ROLE_BADGE_COLORS[member.role] || { bg: "#F3F4F6", color: "#374151" };
  const avatarColor = AVATAR_COLORS[member.full_name.length % AVATAR_COLORS.length];

  return (
    <div style={memberCardStyle}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* Avatar */}
        <div style={{ ...memberAvatarStyle, background: avatarColor }}>
          {getInitials(member.full_name)}
        </div>

        {/* Info */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 20, color: "#111827", letterSpacing: "-0.01em" }}>
              {member.full_name || t("company.noName")}
            </div>
            {!isSelf && (
              <button onClick={onMessage} style={messageBtnStyle} title={t("company.sendMessage", "Написать")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
                {t("company.sendMessage", "Написать")}
              </button>
            )}
          </div>
          <span style={{
            ...roleBadgeStyle,
            background: badgeColors.bg,
            color: badgeColors.color,
          }}>
            {t(`roles.${member.role}`, member.role)}
          </span>
          {member.role_details && (
            <div style={{ fontSize: 15, fontWeight: 600, color: "#374151", marginTop: 5 }}>
              {translateRoleDetail(member.role_details)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- KPI Tab Content (placeholder) ---

function KpiTabContent() {
  const { t } = useTranslation();
  return (
    <div style={{ padding: "40px 0", textAlign: "center" }}>
      <div style={{
        background: "#F9FAFB",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: "48px 32px",
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
          {t("company.kpiMonitoring")}
        </div>
        <p style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 400, margin: "0 auto" }}>
          {t("company.kpiDescription")}
        </p>
      </div>
    </div>
  );
}

// --- Styles ---

const kpiGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: 20,
  marginBottom: 32,
};

const kpiCardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 20,
  padding: "24px 24px",
  background: "#FFFFFF",
  border: "1px solid #E5E7EB",
  borderRadius: 14,
};

const kpiIconBoxStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 14,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 0,
  borderBottom: "1px solid #E5E7EB",
  marginBottom: 28,
};

const tabBtnStyle: React.CSSProperties = {
  padding: "12px 24px",
  fontSize: 16,
  cursor: "pointer",
  borderBottom: "2px solid transparent",
  transition: "all 0.15s",
  background: "none",
  whiteSpace: "nowrap",
};

const memberCardStyle: React.CSSProperties = {
  padding: "24px 0",
  borderBottom: "1px solid #F3F4F6",
};

const memberAvatarStyle: React.CSSProperties = {
  width: 60,
  height: 60,
  borderRadius: "50%",
  color: "#FFFFFF",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
  fontWeight: 600,
  flexShrink: 0,
};

const roleBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 12px",
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 500,
  marginTop: 6,
};

const messageBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  padding: "7px 14px", fontSize: 13, fontWeight: 500,
  borderRadius: 8, border: "1px solid #D1D5DB",
  background: "#FFFFFF", color: "#374151", cursor: "pointer",
  whiteSpace: "nowrap",
};
