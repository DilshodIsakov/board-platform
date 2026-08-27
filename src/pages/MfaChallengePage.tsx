import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { verifyMfaChallenge } from "../lib/mfa";

interface Props {
  onVerified: () => void;
  onCancel: () => void;
}

/**
 * Экран второго фактора: показывается после входа по паролю,
 * если у пользователя включена 2FA (гейт в App.tsx).
 */
export default function MfaChallengePage({ onVerified, onCancel }: Props) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await verifyMfaChallenge(code.trim());
      onVerified();
    } catch {
      setError(t("mfa.invalidCode"));
      setCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1>Board Platform</h1>
      <h2 style={{ fontSize: 18, marginBottom: 4 }}>{t("mfa.challengeTitle")}</h2>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 16 }}>{t("mfa.challengeHint")}</p>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder={t("mfa.codePlaceholder")}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
          style={{
            display: "block", width: "100%", padding: "10px 12px", marginBottom: 12,
            fontSize: 18, letterSpacing: "0.3em", textAlign: "center",
            border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box",
          }}
        />

        {error && <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading || code.length < 6}
          style={{
            display: "block", width: "100%", padding: 10, marginBottom: 8, fontSize: 15,
            borderRadius: 6, border: "none", cursor: "pointer", background: "#2563eb", color: "#fff",
          }}
        >
          {loading ? "..." : t("mfa.confirm")}
        </button>
      </form>

      <button
        type="button"
        onClick={onCancel}
        style={{
          background: "none", border: "none", color: "#2563eb", fontSize: 14,
          cursor: "pointer", padding: "8px 0", textDecoration: "underline",
        }}
      >
        {t("mfa.signOut")}
      </button>
    </div>
  );
}
