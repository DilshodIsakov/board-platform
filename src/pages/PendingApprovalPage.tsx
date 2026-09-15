import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";

interface Props {
  onRefresh: () => void;
}

export default function PendingApprovalPage({ onRefresh }: Props) {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f5f7fa" }}>
      <div style={{
        background: "#fff",
        borderRadius: 10,
        padding: 40,
        maxWidth: 420,
        boxShadow: "var(--shadow-overlay)", textAlign: "center",
      }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#e0a520" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 20px" }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>

        <h1 style={{ fontSize: 22, margin: "0 0 12px", color: "#1a1f2b" }}>
          {t("pendingApproval.title")}
        </h1>

        <p style={{ color: "#6b7384", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
          {t("pendingApproval.message")}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={onRefresh}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 10,
              border: "1px solid #cfd5df",
              background: "#fff",
              color: "#2a3040",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {t("pendingApproval.refresh")}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 10,
              border: "none",
              background: "#d14343",
              color: "#fff",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            {t("pendingApproval.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
