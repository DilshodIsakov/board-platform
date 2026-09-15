import { useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { useNavigate } from "react-router-dom";

export default function SetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError(t("setPassword.minLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("setPassword.mismatch"));
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }
    setSuccess(true);
    setTimeout(() => navigate("/"), 2000);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f5f7fa" }}>
      <div style={{
        background: "#fff",
        borderRadius: 10,
        padding: 40,
        maxWidth: 400,
        width: "100%",
        boxShadow: "var(--shadow-overlay)", }}>
        <h1 style={{ fontSize: 22, margin: "0 0 24px", color: "#1a1f2b", textAlign: "center" }}>
          {t("setPassword.title")}
        </h1>

        {success ? (
          <div style={{
            background: "#e7f6ec", border: "1px solid #cfead8",
            borderRadius: 14, boxShadow: "var(--shadow-card)", padding: 16, color: "#2e9e5b", fontSize: 14, textAlign: "center",
          }}>
            {t("setPassword.success")}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#2a3040", marginBottom: 6 }}>
              {t("setPassword.newPassword")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%", padding: 10, fontSize: 14, borderRadius: 10,
                border: "1px solid #cfd5df", marginBottom: 16, boxSizing: "border-box",
              }}
            />

            <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#2a3040", marginBottom: 6 }}>
              {t("setPassword.confirmPassword")}
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{
                width: "100%", padding: 10, fontSize: 14, borderRadius: 10,
                border: "1px solid #cfd5df", marginBottom: 16, boxSizing: "border-box",
              }}
            />

            {error && (
              <div style={{ color: "#d14343", fontSize: 13, marginBottom: 12, background: "#fdeaea", padding: "8px 12px", borderRadius: 10 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                width: "100%", padding: 10, fontSize: 14, borderRadius: 10,
                border: "none", background: "#3557d6", color: "#fff",
                cursor: saving ? "not-allowed" : "pointer", fontWeight: 500,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? t("common.saving") : t("setPassword.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
