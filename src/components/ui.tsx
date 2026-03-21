/**
 * Shared UI components for Board Platform
 * Use these across pages for consistent, premium corporate look.
 */

import type { ReactNode, CSSProperties } from "react";

// ── StatusBadge ──────────────────────────────────────────────────────────────

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "primary" | "purple";

const BADGE_STYLES: Record<BadgeVariant, CSSProperties> = {
  primary: { background: "#EFF6FF", color: "#2563EB" },
  success: { background: "#DCFCE7", color: "#16A34A" },
  warning: { background: "#FEF3C7", color: "#D97706" },
  danger:  { background: "#FEE2E2", color: "#DC2626" },
  neutral: { background: "#F3F4F6", color: "#6B7280" },
  purple:  { background: "#EDE9FE", color: "#7C3AED" },
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  primary: "#2563EB",
  success: "#16A34A",
  warning: "#D97706",
  danger:  "#DC2626",
  neutral: "#9CA3AF",
  purple:  "#7C3AED",
};

interface BadgeProps {
  variant?: BadgeVariant;
  dot?: boolean;
  pulse?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}

export function StatusBadge({ variant = "neutral", dot = false, pulse = false, children, style }: BadgeProps) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      padding: "2px 10px",
      borderRadius: 20,
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1.6,
      whiteSpace: "nowrap",
      ...BADGE_STYLES[variant],
      ...style,
    }}>
      {dot && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: DOT_COLORS[variant],
          flexShrink: 0,
          animation: pulse ? "pulse-dot 1.5s ease-in-out infinite" : undefined,
        }} />
      )}
      {children}
    </span>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
  padding?: string | number;
  hover?: boolean;
}

export function Card({ children, style, onClick, padding = "20px 24px", hover = false }: CardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: 14,
        padding,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        transition: hover || onClick ? "box-shadow 0.2s ease, transform 0.2s ease" : undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
      onMouseEnter={hover || onClick ? (e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)";
        if (onClick) (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      } : undefined}
      onMouseLeave={hover || onClick ? (e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)";
        (e.currentTarget as HTMLDivElement).style.transform = "";
      } : undefined}
    >
      {children}
    </div>
  );
}

// ── SkeletonBlock ─────────────────────────────────────────────────────────────

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  style?: CSSProperties;
}

export function SkeletonBlock({ width = "100%", height = 16, borderRadius = 6, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{
      background: "#FFFFFF",
      border: "1px solid #E5E7EB",
      borderRadius: 14,
      padding: "20px 24px",
    }}>
      <SkeletonBlock width="60%" height={18} style={{ marginBottom: 12 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          width={i === lines - 1 ? "40%" : "100%"}
          height={13}
          style={{ marginBottom: 8 }}
        />
      ))}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon = "📭", title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 32px",
      textAlign: "center",
      gap: 8,
    }}>
      <div style={{ fontSize: 36, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#374151" }}>{title}</div>
      {description && (
        <div style={{ fontSize: 13, color: "#9CA3AF", maxWidth: 300, lineHeight: 1.5 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

// ── PageHeader ────────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  badge?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, badge }: PageHeaderProps) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 28,
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 4 : 0 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em", color: "#0F172A" }}>
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p style={{ margin: 0, fontSize: 14, color: "#94A3B8" }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────

export function Divider({ style }: { style?: CSSProperties }) {
  return (
    <div style={{
      height: 1,
      background: "#E9EDF2",
      margin: "20px 0",
      ...style,
    }} />
  );
}

// ── LoadingSpinner ────────────────────────────────────────────────────────────

export function LoadingScreen({ message = "Загрузка..." }: { message?: string }) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 300,
      gap: 12,
    }}>
      <div style={{
        width: 36,
        height: 36,
        border: "3px solid #E5E7EB",
        borderTopColor: "#2563EB",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <div style={{ fontSize: 13, color: "#94A3B8" }}>{message}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, { bg: string; color: string }> = {
  admin:          { bg: "#EFF6FF", color: "#2563EB" },
  corp_secretary: { bg: "#EDE9FE", color: "#7C3AED" },
  board_member:   { bg: "#F3F4F6", color: "#6B7280" },
};

export function RoleBadge({ label, role }: { label: string; role: string }) {
  const style = ROLE_BADGE[role] || { bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.03em",
      textTransform: "uppercase",
      padding: "2px 10px",
      borderRadius: 20,
      background: style.bg,
      color: style.color,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
