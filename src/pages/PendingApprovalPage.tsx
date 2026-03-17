import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";

interface Props {
  onRefresh: () => void;
}

export default function PendingApprovalPage({ onRefresh }: Props) {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9FAFB" }}>
      <div style={{
        background: "#fff",
        borderRadius: 12,
        padding: 40,
        maxWidth: 420,
        boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
        textAlign: "center",
      }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 20px" }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>

        <h1 style={{ fontSize: 22, margin: "0 0 12px", color: "#111827" }}>
          {t("pendingApproval.title")}
        </h1>

        <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
          {t("pendingApproval.message")}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={onRefresh}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 6,
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#374151",
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
              borderRadius: 6,
              border: "none",
              background: "#EF4444",
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
