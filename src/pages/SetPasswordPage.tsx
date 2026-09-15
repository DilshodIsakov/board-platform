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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f4f4f4" }}>
      <div style={{
        background: "#fff",
        borderRadius: 0,
        padding: 40,
        maxWidth: 400,
        width: "100%",
        boxShadow: "var(--shadow-overlay)", }}>
        <h1 style={{ fontSize: 22, margin: "0 0 24px", color: "#161616", textAlign: "center" }}>
          {t("setPassword.title")}
        </h1>

        {success ? (
          <div style={{
            background: "#defbe6", border: "1px solid #a7f0ba",
            borderRadius: 0, padding: 16, color: "#24a148", fontSize: 14, textAlign: "center",
          }}>
            {t("setPassword.success")}
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#393939", marginBottom: 6 }}>
              {t("setPassword.newPassword")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%", padding: 10, fontSize: 14, borderRadius: 0,
                border: "1px solid #c6c6c6", marginBottom: 16, boxSizing: "border-box",
              }}
            />

            <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: "#393939", marginBottom: 6 }}>
              {t("setPassword.confirmPassword")}
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{
                width: "100%", padding: 10, fontSize: 14, borderRadius: 0,
                border: "1px solid #c6c6c6", marginBottom: 16, boxSizing: "border-box",
              }}
            />

            {error && (
              <div style={{ color: "#da1e28", fontSize: 13, marginBottom: 12, background: "#fff1f1", padding: "8px 12px", borderRadius: 0 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              style={{
                width: "100%", padding: 10, fontSize: 14, borderRadius: 0,
                border: "none", background: "#0f62fe", color: "#fff",
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
