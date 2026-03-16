import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { supabase } from "../lib/supabaseClient";

export default function LoginPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const handleLanguageChange = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("locale", lng);
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

const langSelectStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 13,
  color: "#6B7280",
  cursor: "pointer",
};
