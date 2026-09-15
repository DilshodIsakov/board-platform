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
      {/* Left: the one inverted surface — product identity, nothing else */}
      <aside className="login-brand">
        <div style={{ fontSize: 14, color: "#c6c6c6", letterSpacing: "0.16px" }}>
          {t("sidebar.title")}
        </div>
        <h1>
          {mode === "login" ? t("login.title") : t("login.changePassword.title")}
        </h1>
      </aside>

      {/* Right: the form */}
      <main className="login-form">
        <div className="login-lang">
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

        <div style={{ width: "100%", maxWidth: 400 }}>
          {mode === "login" ? (
            <form onSubmit={handleSignIn}>
              <Field label="Email">
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={inputStyle}
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
                  style={inputStyle}
                />
              </Field>

              {error && <Notice kind={isSuccessMessage ? "success" : "error"}>{error}</Notice>}

              <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 32 }}>
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
                  <div style={{ fontSize: 14, color: "#161616", marginBottom: 12 }}>
                    Demo — быстрый вход
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    {DEMO_ACCOUNTS.map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        disabled={loading}
                        onClick={() => handleDemoLogin(acc.email)}
                        style={demoBtnStyle}
                      >
                        <span>{acc.label}</span>
                        <span style={{ fontSize: 12, color: "#525252", letterSpacing: "0.32px" }}>{acc.email}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          ) : (
            <form onSubmit={handleChangePassword}>
              {/* Mode switch as a content tab strip (Carbon: text + 2px accent underline) */}
              <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0", marginBottom: 24 }}>
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
                  style={inputStyle}
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
                    style={inputStyle}
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
                  style={inputStyle}
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
                  style={inputStyle}
                />
              </Field>

              {error && <Notice kind="error">{error}</Notice>}
              {cpSuccess && <Notice kind="success">{cpSuccess}</Notice>}

              <div style={{ marginTop: 32 }}>
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
      </main>
    </div>
  );
}

// ── Small building blocks ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", marginBottom: 24 }}>
      <span style={{ display: "block", fontSize: 12, color: "#525252", letterSpacing: "0.32px", marginBottom: 8 }}>{label}</span>
      {children}
    </label>
  );
}

function Notice({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  const rule = kind === "error" ? "#da1e28" : "#24a148";
  return (
    <div role={kind === "error" ? "alert" : "status"} style={{
      borderLeft: `3px solid ${rule}`,
      background: "#f4f4f4",
      padding: "12px 16px",
      fontSize: 14,
      color: "#161616",
      marginTop: 8,
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
      aria-pressed={active}
      style={{
        padding: "12px 16px",
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        color: active ? "#161616" : "#525252",
        borderBottom: active ? "2px solid #0f62fe" : "2px solid transparent",
        marginBottom: -1,
        cursor: "pointer",
        background: "none",
      }}
    >
      {children}
    </button>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: 40,
  padding: "0 16px",
  fontSize: 14,
  border: "none",
  borderBottom: "1px solid #8d8d8d",
  background: "#f4f4f4",
  color: "#161616",
  boxSizing: "border-box",
};

const fullBtn: React.CSSProperties = {
  width: "100%",
  justifyContent: "flex-start",
  height: 48,
};

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#0f62fe",
  fontSize: 14,
  cursor: "pointer",
  padding: "16px 0 0",
};

const demoBlockStyle: React.CSSProperties = {
  marginTop: 32,
  padding: 16,
  background: "#f4f4f4",
  borderLeft: "3px solid #f1c21b",
};

const demoBtnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  width: "100%",
  padding: "8px 16px",
  fontSize: 14,
  border: "1px solid #e0e0e0",
  background: "#ffffff",
  color: "#161616",
  cursor: "pointer",
  textAlign: "left",
  gap: 2,
};

const langSelectStyle: React.CSSProperties = {
  background: "#ffffff",
  border: "none",
  borderBottom: "1px solid #8d8d8d",
  padding: "8px 12px",
  fontSize: 14,
  color: "#161616",
  cursor: "pointer",
};
