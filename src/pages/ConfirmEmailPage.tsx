import { useState } from "react";
import { resendConfirmationEmail } from "../lib/profile";
import type { User } from "@supabase/supabase-js";

interface Props {
  user: User;
}

export default function ConfirmEmailPage({ user }: Props) {
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#F9FAFB" }}>
      <div style={{
        background: "#fff",
        borderRadius: 12,
        padding: 40,
        maxWidth: 400,
        boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
        textAlign: "center",
      }}>
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 20px" }}>
          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        
        <h1 style={{ fontSize: 24, margin: "0 0 16px", color: "#111827" }}>
          Подтвердите email
        </h1>
        
        <p style={{ color: "#6B7280", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>
          На адрес <strong>{user.email}</strong> отправлено письмо с инструкциями по подтверждению.
        </p>

        <p style={{ color: "#6B7280", fontSize: 13, margin: "0 0 24px", lineHeight: 1.5 }}>
          Пожалуйста проверьте папку спама, если письма нет во входящих.
        </p>

        {sent && (
          <div style={{
            background: "#F0FDF4",
            border: "1px solid #BBF7D0",
            borderRadius: 8,
            padding: 12,
            color: "#16A34A",
            fontSize: 13,
            marginBottom: 16,
          }}>
            ✓ Письмо отправлено повторно
          </div>
        )}

        <button
          onClick={handleResend}
          disabled={loading}
          style={{
            width: "100%",
            padding: 10,
            fontSize: 14,
            borderRadius: 6,
            border: "none",
            background: "#3B82F6",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 500,
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Отправка..." : "Отправить письмо повторно"}
        </button>

        <p style={{ color: "#9CA3AF", fontSize: 12, margin: "16px 0 0" }}>
          После подтверждения email обновите страницу (F5)
        </p>
      </div>
    </div>
  );
}
