import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ru from "./locales/ru.json";
import en from "./locales/en.json";
import uzCyrl from "./locales/uz-Cyrl.json";

const savedLocale = localStorage.getItem("locale") || "ru";

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    "uz-Cyrl": { translation: uzCyrl },
  },
  lng: savedLocale,
  fallbackLng: "ru",
  interpolation: { escapeValue: false },
});

export default i18n;

/** Map i18n language code to Intl locale */
export function getIntlLocale(lng?: string): string {
  const lang = lng || i18n.language;
  switch (lang) {
    case "en": return "en-US";
    case "uz-Cyrl": return "uz-UZ";
    default: return "ru-RU";
  }
}
