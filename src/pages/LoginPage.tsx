import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { supabase } from "../lib/supabaseClient";
import { changePasswordAfterReset } from "../lib/profile";

const IS_DEMO = import.meta.env.VITE_DEMO_MODE === "true";

const DEMO_ACCOUNTS = [
  { label: "Корп. секретарь", labelEn: "Corp. Secretary", email: "secretary@demo.almaz.uz" },
  { label: "Председатель НС", labelEn: "Board Chairman",  email: "chairman@demo.almaz.uz"  },
  { label: "Член НС",         labelEn: "Board Member",    email: "member@demo.almaz.uz"    },
];

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

  const handleDemoLogin = async (email: string) => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: "Demo1234!" });
    if (error) setError(error.message);
    setLoading(false);
  };

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

  const isSuccessMessage = error === t("login.signUpSuccess");

  return (
    <div className="login-page">
      <div className="login-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={markStyle} aria-hidden="true">{t("sidebar.mark")}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1f2b" }}>{t("sidebar.title")}</div>
          </div>
          <select
            value={i18n.language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={langSelectStyle}
            aria-label="Language"
          >
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="uz-Cyrl">Ўзбекча</option>
          </select>
        </div>

        <h1 style={{ margin: "0 0 24px", fontSize: 22, fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.01em", color: "#1a1f2b" }}>
          {mode === "login" ? t("login.title") : t("login.changePassword.title")}
        </h1>

        {mode === "login" ? (
          <form onSubmit={handleSignIn}>
            <Field label="Email">
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input"
              />
            </Field>
            <Field label={t("login.password")}>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input"
              />
            </Field>

            {error && <Notice kind={isSuccessMessage ? "success" : "error"}>{error}</Notice>}

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 24 }}>
              <button type="submit" disabled={loading} className="btn btn-primary" style={fullBtn}>
                {loading ? "…" : t("login.signIn")}
              </button>
              <button type="button" disabled={loading} onClick={handleSignUp} className="btn btn-secondary" style={fullBtn}>
                {t("login.signUp")}
              </button>
            </div>

            <button type="button" onClick={() => switchMode("changePassword")} style={linkBtnStyle}>
              {t("login.changePassword.link")}
            </button>

            {IS_DEMO && (
              <div style={demoBlockStyle}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: "#7a5410", marginBottom: 10 }}>
                  Demo — быстрый вход
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button
                      key={acc.email}
                      type="button"
                      disabled={loading}
                      onClick={() => handleDemoLogin(acc.email)}
                      style={demoBtnStyle}
                    >
                      <span style={{ fontWeight: 500 }}>{acc.label}</span>
                      <span style={{ fontSize: 12.5, color: "#6b7384" }}>{acc.email}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </form>
        ) : (
          <form onSubmit={handleChangePassword}>
            <div style={segmentStyle} role="tablist">
              <TabButton active={!cpResetMode} onClick={() => { setCpResetMode(false); setCpOldPassword(""); setError(""); setCpSuccess(""); }}>
                {t("login.changePassword.normalMode")}
              </TabButton>
              <TabButton active={cpResetMode} onClick={() => { setCpResetMode(true); setCpOldPassword(""); setError(""); setCpSuccess(""); }}>
                {t("login.changePassword.resetMode")}
              </TabButton>
            </div>

            <Field label="Email">
              <input
                type="email"
                autoComplete="username"
                value={cpEmail}
                onChange={(e) => setCpEmail(e.target.value)}
                required
                className="input"
              />
            </Field>
            {!cpResetMode && (
              <Field label={t("login.changePassword.oldPassword")}>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={cpOldPassword}
                  onChange={(e) => setCpOldPassword(e.target.value)}
                  required
                  className="input"
                />
              </Field>
            )}
            <Field label={t("login.changePassword.newPassword")}>
              <input
                type="password"
                autoComplete="new-password"
                value={cpNewPassword}
                onChange={(e) => setCpNewPassword(e.target.value)}
                required
                minLength={6}
                className="input"
              />
            </Field>
            <Field label={t("login.changePassword.confirmNewPassword")}>
              <input
                type="password"
                autoComplete="new-password"
                value={cpConfirmPassword}
                onChange={(e) => setCpConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="input"
              />
            </Field>

            {error && <Notice kind="error">{error}</Notice>}
            {cpSuccess && <Notice kind="success">{cpSuccess}</Notice>}

            <div style={{ marginTop: 24 }}>
              <button type="submit" disabled={loading} className="btn btn-primary" style={fullBtn}>
                {loading ? "…" : t("login.changePassword.submit")}
              </button>
            </div>

            <button type="button" onClick={() => switchMode("login")} style={linkBtnStyle}>
              {t("login.changePassword.backToLogin")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Small building blocks ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#2a3040", marginBottom: 6 }}>{label}</span>
      {children}
    </label>
  );
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  const c = kind === "error"
    ? { bg: "#fdeaea", line: "#f5c9c9", fg: "#a12b2b" }
    : { bg: "#e7f6ec", line: "#cfead8", fg: "#1b6b3a" };
  return (
    <div role={kind === "error" ? "alert" : "status"} style={{
      background: c.bg,
      border: `1px solid ${c.line}`,
      borderRadius: 10,
      padding: "10px 12px",
      fontSize: 13.5,
      color: c.fg,
      marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      style={{
        flex: 1,
        padding: "8px 12px",
        fontSize: 13.5,
        fontWeight: 500,
        borderRadius: 8,
        color: active ? "#1a1f2b" : "#6b7384",
        background: active ? "#ffffff" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(26,31,43,.08)" : "none",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const markStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 9,
  background: "#3557d6",
  color: "#ffffff",
  display: "grid",
  placeItems: "center",
  fontSize: 12,
  fontWeight: 700,
};

const fullBtn: React.CSSProperties = {
  width: "100%",
  height: 42,
};

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#3557d6",
  fontSize: 13.5,
  fontWeight: 500,
  cursor: "pointer",
  padding: "16px 0 0",
};

const segmentStyle: React.CSSProperties = {
  display: "flex",
  gap: 4,
  padding: 4,
  background: "#f5f7fa",
  borderRadius: 10,
  marginBottom: 20,
};

const demoBlockStyle: React.CSSProperties = {
  marginTop: 24,
  padding: 14,
  background: "#fff5dd",
  border: "1px solid #f4e2a8",
  borderRadius: 12,
};

const demoBtnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  width: "100%",
  padding: "8px 12px",
  fontSize: 14,
  border: "1px solid #e3e7ee",
  borderRadius: 10,
  background: "#ffffff",
  color: "#1a1f2b",
  cursor: "pointer",
  textAlign: "left",
  gap: 2,
};

const langSelectStyle: React.CSSProperties = {
  height: 34,
  padding: "0 10px",
  fontSize: 13,
  fontWeight: 500,
  border: "1px solid #e3e7ee",
  borderRadius: 8,
  background: "#ffffff",
  color: "#1a1f2b",
  cursor: "pointer",
};
