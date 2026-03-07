import i18n from "../i18n";

/**
 * Returns the localized value of a field from a record.
 * Looks for field_{lang} first, falls back to field_ru, then to field (original).
 *
 * Usage:
 *   getLocalizedField(meeting, "title")       // returns title_en / title_uz / title_ru / title
 *   getLocalizedField(meeting, "description")  // same pattern
 */
export function getLocalizedField(
  record: Record<string, unknown> | null | undefined,
  fieldName: string,
  lang?: string
): string {
  if (!record) return "";

  const currentLang = lang || i18n.language;
  const langSuffix = currentLang === "uz-Cyrl" ? "uz" : currentLang;

  // 1. Try field_{lang} (e.g. title_en, title_uz)
  const localizedKey = `${fieldName}_${langSuffix}`;
  const localizedValue = record[localizedKey];
  if (typeof localizedValue === "string" && localizedValue.trim()) {
    return localizedValue;
  }

  // 2. Fallback to field_ru
  if (langSuffix !== "ru") {
    const ruKey = `${fieldName}_ru`;
    const ruValue = record[ruKey];
    if (typeof ruValue === "string" && ruValue.trim()) {
      return ruValue;
    }
  }

  // 3. Fallback to original field (backward compat)
  const originalValue = record[fieldName];
  if (typeof originalValue === "string" && originalValue.trim()) {
    return originalValue;
  }

  return "";
}

/**
 * Returns the current language suffix for DB fields: "ru" | "en" | "uz"
 */
export function getLangSuffix(lang?: string): string {
  const currentLang = lang || i18n.language;
  if (currentLang === "uz-Cyrl") return "uz";
  if (currentLang === "en") return "en";
  return "ru";
}
