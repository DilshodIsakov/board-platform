import i18n from "../i18n";
import type { TranslationStatus } from "./translationService";

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

/**
 * Checks whether a given language translation is missing for a record field.
 */
export function isTranslationMissing(
  record: Record<string, unknown> | null | undefined,
  fieldName: string,
  lang: string
): boolean {
  if (!record) return true;
  const suffix = lang === "uz-Cyrl" ? "uz" : lang;
  const value = record[`${fieldName}_${suffix}`];
  return !value || (typeof value === "string" && value.trim() === "");
}

/**
 * Returns language suffixes that are missing for a given field.
 */
export function getMissingLangs(
  record: Record<string, unknown> | null | undefined,
  fieldName: string
): string[] {
  const missing: string[] = [];
  if (isTranslationMissing(record, fieldName, "ru")) missing.push("ru");
  if (isTranslationMissing(record, fieldName, "uz")) missing.push("uz");
  if (isTranslationMissing(record, fieldName, "en")) missing.push("en");
  return missing;
}

/**
 * Returns true if source title changed relative to what's stored
 * AND there are already other-language translations (i.e. they are now stale).
 */
export function isTranslationStale(
  original: Record<string, unknown> | null | undefined,
  sourceLangSuffix: string,
  newSourceText: string
): boolean {
  if (!original) return false;
  const stored = original[`title_${sourceLangSuffix}`];
  if (typeof stored !== "string") return false;
  const hasOtherTranslations = (["ru", "uz", "en"] as const).some((l) => {
    if (l === sourceLangSuffix) return false;
    const v = original[`title_${l}`];
    return typeof v === "string" && v.trim() !== "";
  });
  return hasOtherTranslations && newSourceText.trim() !== stored.trim();
}

/**
 * Inline badge style for translation status indicator in the form UI.
 */
export function getStatusBadgeStyle(status: TranslationStatus): React.CSSProperties {
  const map: Record<TranslationStatus, { bg: string; color: string }> = {
    original:        { bg: "#D1FAE5", color: "#065F46" },
    auto_translated: { bg: "#EDE9FE", color: "#5B21B6" },
    reviewed:        { bg: "#DBEAFE", color: "#1E40AF" },
    missing:         { bg: "#F3F4F6", color: "#9CA3AF" },
  };
  const c = map[status] ?? map.missing;
  return {
    background: c.bg, color: c.color,
    display: "inline-block", padding: "2px 8px",
    borderRadius: 8, fontSize: 11, fontWeight: 500,
  };
}
