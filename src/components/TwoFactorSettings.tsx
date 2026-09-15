import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  listVerifiedTotpFactors,
  startTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
} from "../lib/mfa";

/**
 * Блок «Двухфакторная аутентификация» в профиле пользователя:
 * включение (QR + подтверждение кодом) и отключение TOTP.
 */
export default function TwoFactorSettings() {
  const { t } = useTranslation();

  const [factorId, setFactorId] = useState<string | null>(null); // verified factor
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Enrollment state
  const [enrolling, setEnrolling] = useState(false);
  const [enrollFactorId, setEnrollFactorId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const factors = await listVerifiedTotpFactors();
      setFactorId(factors[0]?.id ?? null);
    } catch (e) {
      console.error("2FA loadStatus error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartEnroll = async () => {
    setError("");
    setSaving(true);
    try {
      const { factorId: fid, qrCode: qr, secret: sec } = await startTotpEnrollment();
      setEnrollFactorId(fid);
      setQrCode(qr);
      setSecret(sec);
      setEnrolling(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmEnroll = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await confirmTotpEnrollment(enrollFactorId, code.trim());
      setEnrolling(false);
      setCode("");
      setQrCode("");
      setSecret("");
      await loadStatus();
    } catch {
      setError(t("mfa.invalidCode"));
      setCode("");
    } finally {
      setSaving(false);
    }
  };

  const handleDisable = async () => {
    if (!factorId) return;
    if (!window.confirm(t("mfa.disableConfirm"))) return;
    setError("");
    setSaving(true);
    try {
      await disableTotp(factorId);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: "0 0 6px 0", fontSize: 17 }}>{t("mfa.title")}</h2>
      <p style={{ margin: "0 0 14px 0", color: "#525252", fontSize: 13 }}>{t("mfa.description")}</p>

      {error && <p style={{ color: "#da1e28", fontSize: 13 }}>{error}</p>}

      {factorId ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ background: "#defbe6", color: "#0e6027", padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
            {t("mfa.enabled")}
          </span>
          <button type="button" onClick={handleDisable} disabled={saving} style={dangerBtnStyle}>
            {t("mfa.disable")}
          </button>
        </div>
      ) : enrolling ? (
        <div>
          <p style={{ fontSize: 13, color: "#393939", marginTop: 0 }}>{t("mfa.scanQr")}</p>
          {qrCode && (
            <img
              src={qrCode.startsWith("data:") ? qrCode : `data:image/svg+xml;utf8,${encodeURIComponent(qrCode)}`}
              alt="QR"
              style={{ width: 180, height: 180, background: "#fff", border: "1px solid #e0e0e0", borderRadius: 0, padding: 8 }}
            />
          )}
          <p style={{ fontSize: 12, color: "#525252" }}>
            {t("mfa.secretLabel")}: <code style={{ userSelect: "all", background: "#f4f4f4", padding: "2px 6px", borderRadius: 0 }}>{secret}</code>
          </p>
          <form onSubmit={handleConfirmEnroll} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder={t("mfa.codePlaceholder")}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              style={{ padding: "8px 12px", fontSize: 15, border: "1px solid #c6c6c6", borderRadius: 0, width: 160, textAlign: "center", letterSpacing: "0.2em" }}
            />
            <button type="submit" disabled={saving || code.length < 6} style={primaryBtnStyle}>
              {saving ? "..." : t("mfa.confirm")}
            </button>
            <button type="button" disabled={saving} onClick={() => { setEnrolling(false); setCode(""); setError(""); }} style={secondaryBtnStyle}>
              {t("mfa.cancel")}
            </button>
          </form>
        </div>
      ) : (
        <button type="button" onClick={handleStartEnroll} disabled={saving} style={primaryBtnStyle}>
          {saving ? "..." : t("mfa.enable")}
        </button>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 0,
  padding: "20px 24px",
  marginTop: 24,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 14,
  borderRadius: 0,
  border: "none",
  cursor: "pointer",
  background: "#0f62fe",
  color: "#fff",
  fontWeight: 600,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 14,
  borderRadius: 0,
  border: "1px solid #c6c6c6",
  cursor: "pointer",
  background: "#fff",
  color: "#393939",
};

const dangerBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  fontSize: 14,
  borderRadius: 0,
  border: "1px solid #ffb3b8",
  cursor: "pointer",
  background: "#fff1f1",
  color: "#a2191f",
  fontWeight: 600,
};
