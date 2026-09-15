/**
 * Shared UI components for Board Platform.
 * Visual system: DESIGN.md — soft modern, one accent, radius by role.
 */

import type { ReactNode, CSSProperties } from "react";

// ── StatusBadge (chip) ───────────────────────────────────────────────────────

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "primary" | "purple";

const BADGE_STYLES: Record<BadgeVariant, CSSProperties> = {
  primary: { background: "#e9edfb", borderColor: "#d3dbf7", color: "#3557d6" },
  success: { background: "#e7f6ec", borderColor: "#cfead8", color: "#1b6b3a" },
  warning: { background: "#fff5dd", borderColor: "#f4e2a8", color: "#7a5410" },
  danger:  { background: "#fdeaea", borderColor: "#f5c9c9", color: "#a12b2b" },
  neutral: { background: "#f5f7fa", borderColor: "#e3e7ee", color: "#6b7384" },
  purple:  { background: "#f5f7fa", borderColor: "#e3e7ee", color: "#6b7384" },
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  primary: "#3557d6",
  success: "#2e9e5b",
  warning: "#e0a520",
  danger:  "#d14343",
  neutral: "#9ba3b4",
  purple:  "#9ba3b4",
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
      gap: 6,
      padding: "4px 10px",
      borderRadius: 8,
      border: "1px solid",
      fontSize: 12.5,
      fontWeight: 500,
      lineHeight: 1.3,
      whiteSpace: "nowrap",
      ...BADGE_STYLES[variant],
      ...style,
    }}>
      {dot && (
        <span style={{
          width: 7,
          height: 7,
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

export function Card({ children, style, onClick, padding = 20, hover = false }: CardProps) {
  const interactive = hover || !!onClick;
  return (
    <div
      onClick={onClick}
      style={{
        background: "#ffffff",
        border: "1px solid #e3e7ee",
        borderRadius: 14,
        boxShadow: "var(--shadow-card)",
        padding,
        cursor: onClick ? "pointer" : undefined,
        transition: interactive ? "border-color 120ms ease, box-shadow 120ms ease" : undefined,
        ...style,
      }}
      onMouseEnter={interactive ? (e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = "#d3dbf7";
        el.style.boxShadow = "0 1px 2px rgba(26,31,43,.05), 0 8px 24px rgba(26,31,43,.08)";
      } : undefined}
      onMouseLeave={interactive ? (e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.borderColor = (style?.borderColor as string) || "#e3e7ee";
        el.style.boxShadow = "var(--shadow-card)";
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

export function SkeletonBlock({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
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
      background: "#ffffff",
      border: "1px solid #e3e7ee",
      borderRadius: 14,
      boxShadow: "var(--shadow-card)",
      padding: 20,
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
  /** Kept for call-site compatibility; decorative icons are not rendered. */
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      padding: "36px 24px",
      gap: 6,
      background: "#f5f7fa",
      borderRadius: 12,
    }}>
      <div style={{ fontSize: 15, fontWeight: 500, color: "#1a1f2b" }}>{title}</div>
      {description && (
        <div style={{ fontSize: 13.5, color: "#6b7384", maxWidth: 360, lineHeight: 1.5 }}>{description}</div>
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
      marginBottom: 24,
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.01em", color: "#1a1f2b" }}>
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6b7384" }}>{subtitle}</p>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
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
      background: "#e3e7ee",
      margin: "16px 0",
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
      gap: 14,
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: "3px solid #e3e7ee",
        borderTopColor: "#3557d6",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <div style={{ fontSize: 14, color: "#6b7384" }}>{message}</div>
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_BADGE: Record<string, CSSProperties> = {
  admin:          { background: "#e9edfb", borderColor: "#d3dbf7", color: "#3557d6" },
  corp_secretary: { background: "#e9edfb", borderColor: "#d3dbf7", color: "#3557d6" },
};

export function RoleBadge({ label, role }: { label: string; role: string }) {
  const s = ROLE_BADGE[role] || { background: "#f5f7fa", borderColor: "#e3e7ee", color: "#6b7384" };
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "4px 10px",
      borderRadius: 8,
      border: "1px solid",
      fontSize: 12.5,
      fontWeight: 500,
      lineHeight: 1.3,
      whiteSpace: "nowrap",
      ...s,
    }}>
      {label}
    </span>
  );
}
