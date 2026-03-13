// translate-text/router.ts
// Smart Translation Router — chooses the best OpenAI model based on text complexity.

export type ModelName = "gpt-4o-mini" | "gpt-4o";

// ─── Thresholds ─────────────────────────────────────────────────────────────
/** Total character count above which we always prefer the stronger model. */
const LONG_TEXT_THRESHOLD = 700;

// ─── Governance / legal keywords (multi-language) ───────────────────────────
// Presence of these keywords suggests formal corporate / legal content
// that benefits from the more capable gpt-4o model.
const GOVERNANCE_KEYWORDS: string[] = [
  // Russian
  "решение", "поручение", "поручения", "утверждение", "утвердить", "протокол",
  "повестка", "наблюдательный совет", "правление", "полномочия", "обязанности",
  "риски", "соответствие", "регулирование", "комитет", "совет директоров",
  "акционер", "дивиденды", "стратегия", "бюджет", "финансовая отчётность",
  "аудит", "ответственность", "компетенция", "ликвидность", "инвестиции",
  "корпоративное управление", "исполнение",
  // Uzbek (Cyrillic)
  "қарор", "топшириқ", "тасдиқлаш", "баённома", "кун тартиби",
  "кузатув кенгаши", "бошқарув", "акциядор", "дивиденд", "стратегия",
  "бюджет", "аудит", "молия", "ваколат",
  // English
  "resolution", "directive", "approval", "supervisory board", "board of directors",
  "governance", "fiduciary", "mandate", "compliance", "audit",
  "shareholder", "dividend", "strategy", "budget", "financial statement",
  "accountability", "liability", "investment", "committee", "quorum",
];

// ─── Main selector ───────────────────────────────────────────────────────────

export interface RouterInput {
  title?: string;
  description?: string;
}

/**
 * Choose the OpenAI model for a translation request.
 *
 * Rules (in priority order):
 *  1. Long text (combined > LONG_TEXT_THRESHOLD chars) → gpt-4o
 *  2. Contains governance/legal keywords → gpt-4o
 *  3. Otherwise → gpt-4o-mini (fast, cost-effective)
 */
export function chooseTranslationModel(fields: RouterInput): ModelName {
  const combined = [fields.title || "", fields.description || ""].join(" ");
  const lower = combined.toLowerCase();

  if (combined.length > LONG_TEXT_THRESHOLD) {
    return "gpt-4o";
  }

  const hasGovernanceContent = GOVERNANCE_KEYWORDS.some((kw) => lower.includes(kw));
  return hasGovernanceContent ? "gpt-4o" : "gpt-4o-mini";
}
