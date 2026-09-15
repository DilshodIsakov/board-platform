/**
 * Shared UI components for Board Platform.
 * Visual system: DESIGN.md (Carbon) — square, hairline, one accent.
 */

import type { ReactNode, CSSProperties } from "react";

// ── StatusBadge ──────────────────────────────────────────────────────────────

type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "primary" | "purple";

// Carbon tag pairs: 10-tint background, 70-shade text.
const BADGE_STYLES: Record<BadgeVariant, CSSProperties> = {
  primary: { background: "#edf5ff", color: "#0043ce" },
  success: { background: "#defbe6", color: "#0e6027" },
  warning: { background: "#fcf4d6", color: "#684e00" },
  danger:  { background: "#fff1f1", color: "#a2191f" },
  neutral: { background: "#e0e0e0", color: "#393939" },
  purple:  { background: "#e0e0e0", color: "#393939" },
};

const DOT_COLORS: Record<BadgeVariant, string> = {
  primary: "#0f62fe",
  success: "#24a148",
  warning: "#f1c21b",
  danger:  "#da1e28",
  neutral: "#8d8d8d",
  purple:  "#8d8d8d",
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
      padding: "2px 8px",
      fontSize: 12,
      fontWeight: 400,
      lineHeight: 1.33,
      letterSpacing: "0.32px",
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

export function Card({ children, style, onClick, padding = 16, hover = false }: CardProps) {
  const interactive = hover || !!onClick;
  return (
    <div
      onClick={onClick}
      style={{
        background: "#ffffff",
        border: "1px solid #e0e0e0",
        padding,
        cursor: onClick ? "pointer" : undefined,
        transition: interactive ? "background-color 70ms" : undefined,
        ...style,
      }}
      onMouseEnter={interactive ? (e) => {
        (e.currentTarget as HTMLDivElement).style.background = "#f4f4f4";
      } : undefined}
      onMouseLeave={interactive ? (e) => {
        (e.currentTarget as HTMLDivElement).style.background = (style?.background as string) || "#ffffff";
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

export function SkeletonBlock({ width = "100%", height = 16, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, ...style }}
    />
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e0e0e0",
      padding: 16,
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
  /** Kept for call-site compatibility; decorative icons are no longer rendered. */
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
      alignItems: "flex-start",
      padding: "32px 0",
      gap: 4,
      borderTop: "1px solid #e0e0e0",
    }}>
      <div style={{ fontSize: 16, fontWeight: 400, color: "#161616" }}>{title}</div>
      {description && (
        <div style={{ fontSize: 14, color: "#525252", maxWidth: 480, lineHeight: 1.43 }}>{description}</div>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
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
      alignItems: "flex-end",
      marginBottom: 32,
      gap: 16,
      flexWrap: "wrap",
    }}>
      <div>
        {subtitle && (
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "#525252" }}>{subtitle}</p>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 300, lineHeight: 1.25, color: "#161616" }}>
            {title}
          </h1>
          {badge}
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 1, alignItems: "center", flexShrink: 0 }}>
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
      background: "#e0e0e0",
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
      gap: 16,
    }}>
      <div style={{
        width: 32,
        height: 32,
        border: "3px solid #e0e0e0",
        borderTopColor: "#0f62fe",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }} />
      <div style={{ fontSize: 14, color: "#525252" }}>{message}</div>
    </div>
  );
}

// ── Role badge ────────────────────────────────────────────────────────────────

export function RoleBadge({ label }: { label: string; role: string }) {
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 400,
      letterSpacing: "0.32px",
      padding: "2px 8px",
      background: "#e0e0e0",
      color: "#393939",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
