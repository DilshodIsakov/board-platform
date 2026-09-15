import { useState } from "react";
import { useTranslation } from "react-i18next";
import { resendConfirmationEmail } from "../lib/profile";
import type { User } from "@supabase/supabase-js";

interface Props {
  user: User;
}

export default function ConfirmEmailPage({ user }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleResend = async () => {
    setLoading(true);
    const success = await resendConfirmationEmail(user.email || "");
    if (success) {
      setSent(true);
      setTimeout(() => setSent(false), 5000);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f5f7fa" }}>
      <div style={{
        background: "#fff",
        borderRadius: 10,
        padding: 40,
        maxWidth: 400,
        boxShadow: "var(--shadow-overlay)", textAlign: "center",
      }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3557d6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 20px" }}>
          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        
        <h1 style={{ fontSize: 24, margin: "0 0 16px", color: "#1a1f2b" }}>
          {t("confirmEmail.title")}
        </h1>
        
        <p style={{ color: "#6b7384", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: t("confirmEmail.sentTo", { email: user.email }) }} />

        <p style={{ color: "#6b7384", fontSize: 13, margin: "0 0 24px", lineHeight: 1.5 }}>
          {t("confirmEmail.checkSpam")}
        </p>

        {sent && (
          <div style={{
            background: "#e7f6ec",
            border: "1px solid #cfead8",
            borderRadius: 10,
            padding: 12,
            color: "#2e9e5b",
            fontSize: 13,
            marginBottom: 16,
          }}>
            {t("confirmEmail.resentSuccess")}
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={loading}
          style={{
            width: "100%",
            padding: 10,
            fontSize: 14,
            borderRadius: 10,
            border: "none",
            background: "#3557d6",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? t("confirmEmail.sending") : t("confirmEmail.resend")}
        </button>

        <p style={{ color: "#9ba3b4", fontSize: 12, margin: "16px 0 0" }}>
          {t("confirmEmail.afterConfirm")}
        </p>
      </div>
    </div>
  );
}
