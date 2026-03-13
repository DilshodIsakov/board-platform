// Edge Function: translate-text
// Translates board meeting / task fields (title, description) into RU / UZ (Cyrillic) / EN
// using OpenAI with a Smart Translation Router (model selection by text length + keywords).
//
// Deploy:  supabase functions deploy translate-text --no-verify-jwt
// Secret:  supabase secrets set OPENAI_API_KEY=sk-...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { validatePayload } from "./validation.ts";
import { chooseTranslationModel }  from "./router.ts";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.ts";
import { callOpenAI } from "./openai.ts";
import type { TranslateFields } from "./validation.ts";

// ─── CORS ────────────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(status: number, error: string, details?: string): Response {
  console.error(`[translate-text] error=${error}${details ? " | " + details.slice(0, 300) : ""}`);
  return json({ error, ...(details ? { details } : {}) }, status);
}

// ─── Uzbek Cyrillic check ────────────────────────────────────────────────────
/** Returns true if the text appears to be in Latin script rather than Cyrillic. */
function isLikelyLatin(text: string): boolean {
  if (!text || text.trim().length < 3) return false;
  const latinChars = (text.match(/[A-Za-z]/g) || []).length;
  const cyrillicChars = (text.match(/[\u0400-\u04FF]/g) || []).length;
  // Consider "likely Latin" if Latin chars outnumber Cyrillic by >2:1
  return latinChars > cyrillicChars * 2 + 2;
}

/** Check that all uz fields are in Cyrillic; return field names that failed. */
function findLatinUzFields(parsed: Record<string, Record<string, string>>): string[] {
  const uz = parsed["uz"];
  if (!uz) return [];
  return Object.entries(uz)
    .filter(([, v]) => isLikelyLatin(v))
    .map(([k]) => k);
}

// ─── Response parser ─────────────────────────────────────────────────────────
interface LangResult {
  title?: string;
  description?: string;
  presenter?: string;
}

interface ParsedTranslation {
  ru: LangResult;
  uz: LangResult;
  en: LangResult;
}

function parseOpenAIResponse(raw: string, hasDesc: boolean, hasPresenter: boolean): ParsedTranslation {
  const parsed = JSON.parse(raw); // throws if invalid JSON

  const extractLang = (obj: unknown): LangResult => {
    if (!obj || typeof obj !== "object") return {};
    const o = obj as Record<string, unknown>;
    return {
      title: typeof o.title === "string" ? o.title : undefined,
      description: hasDesc && typeof o.description === "string" ? o.description : undefined,
      presenter: hasPresenter && typeof o.presenter === "string" ? o.presenter : undefined,
    };
  };

  return {
    ru: extractLang(parsed.ru),
    uz: extractLang(parsed.uz),
    en: extractLang(parsed.en),
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ── 1. Auth: require a valid Supabase JWT ──────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey     = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return fail(500, "Server misconfigured: missing SUPABASE_URL / SUPABASE_ANON_KEY");
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return fail(401, "Unauthorized: valid JWT required");
  }

  // ── 2. OpenAI key ──────────────────────────────────────────────────────────
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return fail(500, "Translation service not configured: OPENAI_API_KEY is not set. Run: supabase secrets set OPENAI_API_KEY=sk-...");
  }

  // ── 3. Parse + validate request body ──────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "Request body must be valid JSON");
  }

  const validation = validatePayload(body);
  if (!validation.ok) {
    return fail(400, validation.error);
  }

  const { source_language, entity_type, fields } = validation.payload;
  const hasDesc = !!fields.description;
  const hasPresenter = !!fields.presenter;

  // ── 4. Choose model via Smart Router ──────────────────────────────────────
  const model = chooseTranslationModel(fields);
  console.log(`[translate-text] user=${user.id} entity=${entity_type} lang=${source_language} model=${model}`);

  // ── 5. Build prompts ───────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt();
  const userPrompt   = buildUserPrompt(source_language, entity_type, fields);

  // ── 6. Call OpenAI (with one Uzbek Cyrillic retry if needed) ──────────────
  let rawResponse: string;
  let parsed: ParsedTranslation;
  let retried = false;

  try {
    rawResponse = await callOpenAI(openaiKey, model, systemPrompt, userPrompt);
    parsed = parseOpenAIResponse(rawResponse, hasDesc, hasPresenter);

    // Check Uzbek Cyrillic
    const latinFields = findLatinUzFields(parsed as unknown as Record<string, Record<string, string>>);
    if (latinFields.length > 0) {
      console.warn(`[translate-text] Uzbek appears to be in Latin (fields: ${latinFields.join(",")}). Retrying with stricter prompt.`);
      retried = true;

      const stricterUserPrompt = userPrompt +
        "\n\nCRITICAL: Your previous attempt returned Uzbek text in Latin script. " +
        "You MUST use ONLY Cyrillic characters for Uzbek. " +
        "Latin Uzbek (like 'o'zbek', 'uchun', 'va') is NOT acceptable. " +
        "Use Cyrillic Uzbek (like 'ўзбек', 'учун', 'ва').";

      rawResponse = await callOpenAI(openaiKey, model, systemPrompt, stricterUserPrompt);
      parsed = parseOpenAIResponse(rawResponse, hasDesc, hasPresenter);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(502, "Translation failed", msg);
  }

  // ── 7. Build response ──────────────────────────────────────────────────────
  // Ensure source language always has the original text (safety net)
  const ensureOriginal = (lang: "ru" | "uz" | "en", result: LangResult): LangResult => {
    if (lang !== source_language) return result;
    return {
      title: fields.title ?? result.title,
      ...(hasDesc ? { description: fields.description ?? result.description } : {}),
      ...(hasPresenter ? { presenter: fields.presenter ?? result.presenter } : {}),
    };
  };

  const autoTranslated = (["ru", "uz", "en"] as const).filter((l) => l !== source_language);

  return json({
    ru: ensureOriginal("ru", parsed.ru),
    uz: ensureOriginal("uz", parsed.uz),
    en: ensureOriginal("en", parsed.en),
    meta: {
      model_used: model,
      source_language,
      auto_translated_languages: autoTranslated,
      retried_for_cyrillic: retried,
    },
  });
});
