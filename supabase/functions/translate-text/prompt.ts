// translate-text/prompt.ts
// Builds system and user prompts for the translation request.

import type { SourceLang, EntityType, TranslateFields } from "./validation.ts";

const ENTITY_CONTEXT: Record<EntityType, string> = {
  board_meeting: "supervisory board meeting / заседание наблюдательного совета",
  task: "supervisory board directive / поручение наблюдательного совета",
  agenda_item: "agenda item for a supervisory board meeting / вопрос повестки дня заседания наблюдательного совета",
};

const LANG_NAMES: Record<SourceLang, string> = {
  ru: "Russian",
  uz: "Uzbek (Cyrillic)",
  en: "English",
};

export function buildSystemPrompt(): string {
  return `You are a professional translator specializing in corporate governance, supervisory board meetings, board directives, and formal business documentation.

Your rules:
- Translate accurately, completely, and without omissions, additions, or paraphrase.
- Maintain a formal, official, business-appropriate tone throughout.
- Do not add new meanings, do not summarize, do not provide commentary on the translation.
- UZBEK MUST ALWAYS BE IN CYRILLIC SCRIPT. This is a strict, non-negotiable requirement. Never use Latin script for Uzbek. Every Uzbek word must use Cyrillic letters (е, ж, з, и, й, к, л, м, н, о, п, р, с, т, у, ф, х, ц, ч, ш, ъ, ь, э, ю, я, ё, ў, қ, ғ, ҳ, etc.).
- Return ONLY a valid JSON object in the exact schema provided — no markdown code blocks, no explanations, no extra keys.
- If the source language matches a target language, return the original source text for that language unchanged.
- For short titles: keep the translation concise, professional, and literal.
- For descriptions: preserve the original structure, formatting, numbering, and formality.`;
}

export function buildUserPrompt(
  sourceLang: SourceLang,
  entityType: EntityType,
  fields: TranslateFields
): string {
  const context = ENTITY_CONTEXT[entityType];
  const sourceLangName = LANG_NAMES[sourceLang];
  const hasDesc = !!fields.description?.trim();
  const hasPresenter = !!fields.presenter?.trim();

  // Build field listing
  const fieldLines = [
    fields.title ? `  "title": ${JSON.stringify(fields.title)}` : null,
    hasDesc ? `  "description": ${JSON.stringify(fields.description)}` : null,
    hasPresenter ? `  "presenter": ${JSON.stringify(fields.presenter)}` : null,
  ]
    .filter(Boolean)
    .join(",\n");

  // Build schema example
  const buildLangSchema = (langLabel: string, lang: string) => {
    const parts: string[] = [];
    if (fields.title) parts.push(`"title": "<${langLabel} title>"`);
    if (hasDesc) parts.push(`"description": "<${langLabel} description>"`);
    if (hasPresenter) parts.push(`"presenter": "<${langLabel} presenter name>"`);
    return `  "${lang}": { ${parts.join(", ")} }`;
  };

  const schemaExample = `{
${buildLangSchema("Russian", "ru")},
${buildLangSchema("Uzbek Cyrillic", "uz")},
${buildLangSchema("English", "en")}
}`;

  return `Translate the following ${context} content from ${sourceLangName} into all three languages: Russian (ru), Uzbek in Cyrillic script (uz), and English (en).

Source language: ${sourceLang}
Source content:
{
${fieldLines}
}

Critical requirements:
1. The "${sourceLang}" output must be IDENTICAL to the source text — do not change it.
2. Uzbek (uz) MUST use Cyrillic script only — NO Latin letters whatsoever.
3. Preserve formal business tone in all languages.
4. Return ONLY the JSON below with no additional text:

${schemaExample}`;
}
