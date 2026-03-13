// translate-text/validation.ts
// Validates the incoming translation request payload.

export type SourceLang = "ru" | "uz" | "en";
export type EntityType = "board_meeting" | "task" | "agenda_item";

export interface TranslateFields {
  title?: string;
  description?: string;
  presenter?: string;
}

export interface TranslatePayload {
  source_language: SourceLang;
  entity_type: EntityType;
  fields: TranslateFields;
}

const VALID_LANGS: SourceLang[] = ["ru", "uz", "en"];
const VALID_ENTITIES: EntityType[] = ["board_meeting", "task", "agenda_item"];

export function validatePayload(
  body: unknown
): { ok: true; payload: TranslatePayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  const b = body as Record<string, unknown>;

  if (!b.source_language || !VALID_LANGS.includes(b.source_language as SourceLang)) {
    return { ok: false, error: `source_language must be one of: ${VALID_LANGS.join(", ")}` };
  }

  if (!b.entity_type || !VALID_ENTITIES.includes(b.entity_type as EntityType)) {
    return { ok: false, error: `entity_type must be one of: ${VALID_ENTITIES.join(", ")}` };
  }

  if (!b.fields || typeof b.fields !== "object" || Array.isArray(b.fields)) {
    return { ok: false, error: "fields must be an object with title and/or description" };
  }

  const fields = b.fields as Record<string, unknown>;
  const title = typeof fields.title === "string" ? fields.title.trim() : "";
  const description = typeof fields.description === "string" ? fields.description.trim() : "";
  const presenter = typeof fields.presenter === "string" ? fields.presenter.trim() : "";

  if (!title && !description && !presenter) {
    return { ok: false, error: "At least one non-empty field (title, description, or presenter) must be provided" };
  }

  return {
    ok: true,
    payload: {
      source_language: b.source_language as SourceLang,
      entity_type: b.entity_type as EntityType,
      fields: {
        title: title || undefined,
        description: description || undefined,
        presenter: presenter || undefined,
      },
    },
  };
}
