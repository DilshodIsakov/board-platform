import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";

interface Props {
  onRefresh: () => void;
}

export default function PendingApprovalPage({ onRefresh }: Props) {
  const { t } = useTranslation();

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f4f4f4" }}>
      <div style={{
        background: "#fff",
        borderRadius: 0,
        padding: 40,
        maxWidth: 420,
        boxShadow: "var(--shadow-overlay)", textAlign: "center",
      }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f1c21b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 20px" }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>

        <h1 style={{ fontSize: 22, margin: "0 0 12px", color: "#161616" }}>
          {t("pendingApproval.title")}
        </h1>

        <p style={{ color: "#525252", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
          {t("pendingApproval.message")}
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={onRefresh}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 0,
              border: "1px solid #c6c6c6",
              background: "#fff",
              color: "#393939",
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
              borderRadius: 0,
              border: "none",
              background: "#da1e28",
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
