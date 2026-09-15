import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { searchAll, type SearchResult, type SearchResultType } from "../lib/search";

const SECTION_ORDER: SearchResultType[] = ["meeting", "document", "task", "regulation", "committee"];

const SECTION_ICON: Record<SearchResultType, string> = {
  meeting: "",
  document: "",
  task: "",
  regulation: "",
  committee: "",
};

/** Заголовок результата на текущем языке */
function localizedTitle(r: SearchResult, lang: string): string {
  if (lang === "en" && r.title_en) return r.title_en;
  if (lang === "uz-Cyrl" && r.title_uz) return r.title_uz;
  return r.title;
}

export default function SearchPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlQuery = searchParams.get("q") ?? "";
  const [input, setInput] = useState(urlQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(urlQuery.trim().length >= 2);
  const [searched, setSearched] = useState(false);

  // Синхронизация с URL во время рендера (без setState в эффекте)
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setInput(urlQuery);
    if (urlQuery.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (urlQuery.trim().length < 2) return;
    let cancelled = false;
    searchAll(urlQuery)
      .then((r) => {
        if (!cancelled) {
          setResults(r);
          setSearched(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [urlQuery]);

  const grouped = useMemo(() => {
    const map = new Map<SearchResultType, SearchResult[]>();
    for (const r of results) {
      if (!map.has(r.type)) map.set(r.type, []);
      map.get(r.type)!.push(r);
    }
    return map;
  }, [results]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (q.length >= 2) setSearchParams({ q });
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>{t("search.title")}</h1>
      <p style={{ color: "#525252", fontSize: 14, marginBottom: 20 }}>{t("search.subtitle")}</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("search.placeholder")}
          autoFocus
          style={{
            flex: 1, padding: "10px 14px", fontSize: 15,
            border: "1px solid #c6c6c6", borderRadius: 0, boxSizing: "border-box",
          }}
        />
        <button
          type="submit"
          disabled={input.trim().length < 2}
          style={{
            padding: "10px 22px", fontSize: 14, fontWeight: 600, borderRadius: 0,
            border: "none", cursor: "pointer", background: "#0f62fe", color: "#fff",
          }}
        >
          {t("search.submit")}
        </button>
      </form>

      {loading && <div style={{ color: "#8d8d8d" }}>{t("common.loading")}</div>}

      {!loading && searched && results.length === 0 && (
        <div style={{ color: "#525252", padding: "30px 0", textAlign: "center" }}>
          {t("search.noResults", { query: urlQuery })}
        </div>
      )}

      {!loading &&
        SECTION_ORDER.map((type) => {
          const items = grouped.get(type);
          if (!items || items.length === 0) return null;
          return (
            <div key={type} style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, color: "#525252", margin: "0 0 8px 0" }}>
                {SECTION_ICON[type]} {t(`search.section_${type}`)} ({items.length})
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items.map((r) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    onClick={() => navigate(r.route)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                      padding: "10px 14px", background: "#fff", border: "1px solid #e0e0e0",
                      borderRadius: 0, cursor: "pointer", textAlign: "left", fontSize: 14, width: "100%",
                    }}
                  >
                    <span style={{ fontWeight: 500, color: "#161616", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {localizedTitle(r, i18n.language)}
                    </span>
                    {r.subtitle && (
                      <span style={{ color: "#8d8d8d", fontSize: 12, flexShrink: 0 }}>{r.subtitle}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
