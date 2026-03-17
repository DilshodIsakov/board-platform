import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { supabase } from "../lib/supabaseClient";
import { changePasswordAfterReset } from "../lib/profile";

type PageMode = "login" | "changePassword";

export default function LoginPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<PageMode>("login");

  // Login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Change password fields
  const [cpEmail, setCpEmail] = useState("");
  const [cpOldPassword, setCpOldPassword] = useState("");
  const [cpNewPassword, setCpNewPassword] = useState("");
  const [cpConfirmPassword, setCpConfirmPassword] = useState("");
  const [cpSuccess, setCpSuccess] = useState("");
  const [cpResetMode, setCpResetMode] = useState(false); // true = admin reset, no old password needed

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  const handleSignUp = async () => {
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setError(t("login.signUpSuccess"));
    }
    setLoading(false);
  };

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setCpSuccess("");

    if (cpNewPassword.length < 6) {
      setError(t("setPassword.minLength"));
      return;
    }
    if (cpNewPassword !== cpConfirmPassword) {
      setError(t("setPassword.mismatch"));
      return;
    }

    setLoading(true);

    try {
      if (cpResetMode) {
        // Admin reset mode — use edge function (no old password needed)
        await changePasswordAfterReset(cpEmail, cpNewPassword);
      } else {
        // Normal mode — sign in with old password first
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: cpEmail,
          password: cpOldPassword,
        });
        if (signInErr) {
          setError(t("login.changePassword.wrongOldPassword"));
          setLoading(false);
          return;
        }

        const { error: updateErr } = await supabase.auth.updateUser({ password: cpNewPassword });
        if (updateErr) {
          setError(updateErr.message);
          setLoading(false);
          return;
        }

        await supabase.auth.signOut();
      }

      setCpSuccess(t("login.changePassword.success"));
      setCpOldPassword("");
      setCpNewPassword("");
      setCpConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("locale", lng);
  };

  const switchMode = (newMode: PageMode) => {
    setMode(newMode);
    setError("");
    setCpSuccess("");
  };

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui", position: "relative" }}>
      <div style={{ position: "absolute", top: -40, right: 0 }}>
        <select
          value={i18n.language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          style={langSelectStyle}
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="uz-Cyrl">Ўзбекча</option>
        </select>
      </div>
      <h1>Board Platform</h1>

      {mode === "login" ? (
        <>
          <p style={{ color: "#888" }}>{t("login.title")}</p>

          <form onSubmit={handleSignIn}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
            <input
              type="password"
              placeholder={t("login.password")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />

            {error && (
              <p style={{ color: error === t("login.signUpSuccess") ? "green" : "#dc2626", fontSize: 14 }}>
                {error}
              </p>
            )}

            <button type="submit" disabled={loading} style={{ ...btnStyle, background: "#2563eb", color: "#fff" }}>
              {loading ? "..." : t("login.signIn")}
            </button>
            <button type="button" disabled={loading} onClick={handleSignUp} style={btnStyle}>
              {t("login.signUp")}
            </button>
          </form>

          <button
            type="button"
            onClick={() => switchMode("changePassword")}
            style={linkBtnStyle}
          >
            {t("login.changePassword.link")}
          </button>
        </>
      ) : (
        <>
          <p style={{ color: "#888" }}>{t("login.changePassword.title")}</p>

          {/* Toggle: normal change vs admin-reset mode */}
          <div style={{ display: "flex", gap: 0, marginBottom: 16, borderRadius: 6, overflow: "hidden", border: "1px solid #ccc" }}>
            <button type="button" onClick={() => { setCpResetMode(false); setCpOldPassword(""); setError(""); setCpSuccess(""); }}
              style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                background: !cpResetMode ? "#2563eb" : "#f9fafb", color: !cpResetMode ? "#fff" : "#6B7280" }}>
              {t("login.changePassword.normalMode")}
            </button>
            <button type="button" onClick={() => { setCpResetMode(true); setCpOldPassword(""); setError(""); setCpSuccess(""); }}
              style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 600, border: "none", borderLeft: "1px solid #ccc", cursor: "pointer",
                background: cpResetMode ? "#2563eb" : "#f9fafb", color: cpResetMode ? "#fff" : "#6B7280" }}>
              {t("login.changePassword.resetMode")}
            </button>
          </div>

          <form onSubmit={handleChangePassword}>
            <input
              type="email"
              placeholder="Email"
              value={cpEmail}
              onChange={(e) => setCpEmail(e.target.value)}
              required
              style={inputStyle}
            />
            {!cpResetMode && (
              <input
                type="password"
                placeholder={t("login.changePassword.oldPassword")}
                value={cpOldPassword}
                onChange={(e) => setCpOldPassword(e.target.value)}
                required
                style={inputStyle}
              />
            )}
            <input
              type="password"
              placeholder={t("login.changePassword.newPassword")}
              value={cpNewPassword}
              onChange={(e) => setCpNewPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />
            <input
              type="password"
              placeholder={t("login.changePassword.confirmNewPassword")}
              value={cpConfirmPassword}
              onChange={(e) => setCpConfirmPassword(e.target.value)}
              required
              minLength={6}
              style={inputStyle}
            />

            {error && (
              <p style={{ color: "#dc2626", fontSize: 14 }}>{error}</p>
            )}
            {cpSuccess && (
              <p style={{ color: "green", fontSize: 14 }}>{cpSuccess}</p>
            )}

            <button type="submit" disabled={loading} style={{ ...btnStyle, background: "#2563eb", color: "#fff" }}>
              {loading ? "..." : t("login.changePassword.submit")}
            </button>
          </form>

          <button
            type="button"
            onClick={() => switchMode("login")}
            style={linkBtnStyle}
          >
            {t("login.changePassword.backToLogin")}
          </button>
        </>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginBottom: 12,
  fontSize: 15,
  border: "1px solid #ccc",
  borderRadius: 6,
  boxSizing: "border-box",
};

const btnStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px",
  marginBottom: 8,
  fontSize: 15,
  borderRadius: 6,
  border: "1px solid #ccc",
  cursor: "pointer",
};

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#2563eb",
  fontSize: 14,
  cursor: "pointer",
  padding: "8px 0",
  textDecoration: "underline",
};

const langSelectStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 13,
  color: "#6B7280",
  cursor: "pointer",
};
