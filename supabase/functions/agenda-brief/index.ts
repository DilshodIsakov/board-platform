// Supabase Edge Function: agenda-brief
// Deploy: supabase functions deploy agenda-brief --no-verify-jwt
// Secrets: OPENAI_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Step = "init" | "auth" | "parse" | "db" | "storage" | "openai" | "docx" | "save" | "unknown";
type Lang = "ru" | "uz_cyrl" | "en";

function ok(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(status: number, error: string, step: Step, details?: string): Response {
  const body: Record<string, unknown> = { error, step };
  if (details) body.details = details;
  console.error(`[agenda-brief] FAIL step=${step} status=${status} error=${error}${details ? " details=" + details.slice(0, 500) : ""}`);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ========== Prompt builders ==========

interface BriefMeta {
  agendaTitle: string;
  orderIndex: number;
  speaker: string | null;
  meetingTitle: string | null;
  meetingDate: string | null;
  materialsContext: string;
}

const SYSTEM_PROMPTS: Record<Lang, string> = {
  ru: `Ты — опытный корпоративный секретарь и аналитик Наблюдательного совета (Board Secretary).
Твоя задача — подготовить AI-Brief для членов НС по одному вопросу повестки дня на основе предоставленных материалов.

Правила:
- Используй ТОЛЬКО факты из материалов. Ничего не придумывай.
- Если информации нет в материалах — прямо напиши: «В материалах не указано».
- Всегда ссылайся на источник: указывай [DOC1], [DOC2] и т.д., и по возможности раздел/страницу.
- Пиши кратко, деловым стилем, без воды.
- Сфокусируйся на том, что нужно решить/утвердить/принять к сведению, и какие риски.
- НЕ используй общие фразы «уточнить», «возможно», «вероятно» без опоры на конкретное место в материалах.
- Не раскрывай внутренние рассуждения, только итоговый бриф.
- Ответ на русском языке.`,

  uz_cyrl: `Сен — тажрибали корпоратив котиб ва Кузатув кенгаши таҳлилчисисан (Board Secretary).
Сенинг вазифанг — КК аъзолари учун кун тартибининг бир масаласи бўйича тақдим этилган материаллар асосида AI-Brief тайёрлаш.

Қоидалар:
- ФАҚАТ материаллардаги далилларни ишлат. Ҳеч нарса ўйлаб топма.
- Агар маълумот материалларда бўлмаса — аниқ ёз: «Материалларда кўрсатилмаган».
- Ҳар доим манбага ҳавола қил: [DOC1], [DOC2] ва ҳ.к., имкон бўлса бўлим/саҳифани кўрсат.
- Қисқа, расмий услубда ёз, сув қўшма.
- НС нимани ҳал қилиши/тасдиқлаши/маълумот учун қабул қилиши ва қандай хавфлар борлигига эътибор қарат.
- Материалларга таянмасдан «аниқлаш керак», «эҳтимол» каби умумий ибораларни ИШЛАТМА.
- Жавоб ўзбек тилида кириллицада.`,

  en: `You are an experienced corporate secretary and analyst of the Supervisory Board (Board Secretary).
Your task is to prepare an AI-Brief for Board members on a single agenda item based on the provided materials.

Rules:
- Use ONLY facts from the materials. Do not invent anything.
- If information is not in the materials — write explicitly: "Not stated in the materials".
- Always reference the source: cite [DOC1], [DOC2] etc., and where possible the section/page.
- Write concisely, in formal business style, no filler.
- Focus on what needs to be decided/approved/noted and what the risks are.
- Do NOT use vague phrases like "to be clarified", "possibly", "probably" without referencing a specific place in materials.
- Do not reveal internal reasoning, only the final brief.
- Answer in English.`,
};

function buildUserPrompt(lang: Lang, m: BriefMeta): string {
  if (lang === "ru") return `Сформируй AI-Brief для членов Наблюдательного совета по вопросу повестки дня.

Данные:
- Вопрос: ${m.agendaTitle}
- № в повестке: ${m.orderIndex}
- Докладчик: ${m.speaker || "не указан"}
${m.meetingTitle ? `- Заседание: ${m.meetingTitle}` : ""}
${m.meetingDate ? `- Дата заседания: ${m.meetingDate}` : ""}

Материалы по вопросу (блоки [DOCn] ниже). Проанализируй их.

${m.materialsContext}

ТРЕБОВАНИЯ К ОТВЕТУ (строго по структуре, Markdown):

## 1. Суть вопроса
Что рассматривается и что ожидается от НС (принять к сведению / утвердить / согласовать / поручить). 1–2 предложения.

## 2. Что предлагается вынести на решение НС
Проект решения/резолюции (1–5 пунктов), максимально близко к тексту материалов. Каждый пункт — ссылка [DOCn].

## 3. Ключевые факты и цифры
Только конкретные факты/цифры/сроки/ответственные из материалов (bullet list). Каждая строка — ссылка [DOCn]. Если данных нет — «В материалах не указано».

## 4. Финансовые и юридические последствия
CAPEX/OPEX/экономический эффект/источники финансирования/договорные обязательства, регуляторные требования, согласования. Если не указано — «В материалах не указано».

## 5. Риски и спорные моменты
Риски (финансовые/операционные/правовые/репутационные) с обоснованием из материалов [DOCn]. Если риск выводится логически — пометь «Аналитический вывод» и привяжи к фактам.

## 6. Вопросы к докладчику (3–10)
Конкретные вопросы, которые помогут НС принять решение. Должны следовать из материалов и выявленных пробелов.

## 7. Чек-лист для корпоративного секретаря
Какие документы/приложения должны быть у членов НС до голосования. Какие согласования/комитеты/заключения нужны. Если не указано — «В материалах не указано».

ОГРАНИЧЕНИЯ: не более ~4000 символов, не повторяйся, не используй «уточнить» если данные есть в материалах.`;

  if (lang === "uz_cyrl") return `Кузатув кенгаши аъзолари учун кун тартиби масаласи бўйича AI-Brief тайёрла.

Маълумотлар:
- Масала: ${m.agendaTitle}
- Тартиб рақами: ${m.orderIndex}
- Маърузачи: ${m.speaker || "кўрсатилмаган"}
${m.meetingTitle ? `- Мажлис: ${m.meetingTitle}` : ""}
${m.meetingDate ? `- Мажлис санаси: ${m.meetingDate}` : ""}

Масала бўйича материаллар (қуйида [DOCn] блоклари). Уларни таҳлил қил.

${m.materialsContext}

ЖАВОБ ТАЛАБЛАРИ (қатъий тузилма, Markdown):

## 1. Масаланинг моҳияти
Нима кўриб чиқилмоқда ва ККдан нима кутилмоқда (маълумот учун қабул қилиш / тасдиқлаш / келишиш / топшириқ бериш). 1–2 жумла.

## 2. КК қарорига нима киритиш таклиф этилади
Қарор/резолюция лойиҳаси (1–5 банд), материаллар матнига имкон қадар яқин. Ҳар бир банд — ҳавола [DOCn].

## 3. Асосий далиллар ва рақамлар
Фақат аниқ далиллар/рақамлар/муддатлар/масъуллар (рўйхат). Ҳар бир қатор — [DOCn]. Маълумот бўлмаса — «Материалларда кўрсатилмаган».

## 4. Молиявий ва ҳуқуқий оқибатлар
CAPEX/OPEX/иқтисодий самара/молиялаштириш манбалари/шартномавий мажбуриятлар, тартибга солиш талаблари. Кўрсатилмаган бўлса — «Материалларда кўрсатилмаган».

## 5. Хавфлар ва баҳсли масалалар
Хавфлар (молиявий/операцион/ҳуқуқий/обрўга доир) материаллардан асослаш билан [DOCn]. Мантиқий хулоса бўлса — «Таҳлилий хулоса» деб белгила.

## 6. Маърузачига саволлар (3–10)
КК қарор қабул қилишига ёрдам берадиган аниқ саволлар.

## 7. Корпоратив котиб учун текшириш рўйхати
Овоз беришдан олдин КК аъзоларида қандай ҳужжатлар бўлиши керак. Қандай келишувлар/қўмиталар/хулосалар зарур. Кўрсатилмаган бўлса — «Материалларда кўрсатилмаган».

ЧЕКЛОВ: 4000 белгидан ошмасин, такрорланма, материалларда маълумот бўлса «аниқлаш керак» ишлатма.`;

  // en
  return `Prepare an AI-Brief for Supervisory Board members on the following agenda item.

Details:
- Agenda item: ${m.agendaTitle}
- Order number: ${m.orderIndex}
- Presenter: ${m.speaker || "not specified"}
${m.meetingTitle ? `- Meeting: ${m.meetingTitle}` : ""}
${m.meetingDate ? `- Meeting date: ${m.meetingDate}` : ""}

Materials for this item ([DOCn] blocks below). Analyze them.

${m.materialsContext}

RESPONSE REQUIREMENTS (strict structure, Markdown):

## 1. Essence of the Issue
What is being considered and what is expected from the Board (note / approve / agree / instruct). 1–2 sentences.

## 2. Proposed Board Resolution
Draft resolution points (1–5 items), as close to the materials' text as possible. Each point references [DOCn].

## 3. Key Facts and Figures
Only specific facts/figures/deadlines/responsible persons from materials (bullet list). Each line references [DOCn]. If absent — "Not stated in the materials".

## 4. Financial and Legal Implications
CAPEX/OPEX/economic impact/funding sources/contractual obligations, regulatory requirements, approvals. If not stated — "Not stated in the materials".

## 5. Risks and Controversial Points
Risks (financial/operational/legal/reputational) with justification from materials [DOCn]. If a risk is inferred logically — mark "Analytical conclusion" and link to facts.

## 6. Questions for the Presenter (3–10)
Specific questions to help the Board make a decision. Should follow from the materials and identified gaps.

## 7. Corporate Secretary Checklist
What documents/attachments Board members should have before voting. What approvals/committees/opinions are needed. If not stated — "Not stated in the materials".

CONSTRAINTS: max ~4000 characters, no repetition, do not use "to be clarified" if data exists in materials.`;
}

const DOCX_TITLE: Record<Lang, string> = {
  ru: "AI-Brief по вопросу повестки дня",
  uz_cyrl: "Кун тартиби масаласи бўйича AI-Brief",
  en: "AI-Brief for Agenda Item",
};

const DOCX_PRESENTER_LABEL: Record<Lang, string> = {
  ru: "Докладчик",
  uz_cyrl: "Маърузачи",
  en: "Presenter",
};

// ========== Main handler ==========

Deno.serve(async (req: Request) => {
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string) => console.log(`[agenda-brief][${reqId}] ${msg}`);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  log("START " + req.method);

  try {
    // ---- 1. ENV CHECK ----
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    log(`ENV: URL=${supabaseUrl ? "SET" : "MISSING"}, SERVICE=${serviceKey ? "SET" : "MISSING"}, ANON=${anonKey ? "SET" : "MISSING"}, OPENAI=${openaiKey ? "SET" : "MISSING"}`);

    if (!supabaseUrl || !serviceKey || !anonKey) {
      return fail(500, "Missing Supabase env vars", "init");
    }
    if (!openaiKey) {
      return fail(500, "OPENAI_API_KEY is not set", "init", "Set it in Supabase Dashboard → Edge Functions → Secrets");
    }

    // ---- 2. AUTH ----
    const authHeader = req.headers.get("Authorization") ?? "";
    log(`AUTH: Authorization=${authHeader ? "present" : "MISSING"}`);

    if (!authHeader) {
      return fail(401, "Missing Authorization header", "auth");
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();

    if (authErr || !user) {
      log(`AUTH: FAIL — ${authErr?.message || "no user"}`);
      return fail(401, "Invalid or expired JWT", "auth", authErr?.message);
    }
    log(`AUTH: OK user=${user.id}`);

    const db = createClient(supabaseUrl, serviceKey);

    // ---- 3. PARSE BODY ----
    let agendaId: string;
    let lang: Lang = "ru";
    try {
      const body = await req.json();
      agendaId = body.agenda_id;
      if (body.lang && ["ru", "uz_cyrl", "en"].includes(body.lang)) {
        lang = body.lang as Lang;
      }
    } catch (e) {
      return fail(400, "Invalid JSON body", "parse", String(e));
    }
    if (!agendaId) {
      return fail(400, "agenda_id is required", "parse");
    }
    log(`PARSE: agenda_id=${agendaId}, lang=${lang}`);

    // ---- 4. FETCH AGENDA ITEM + MEETING ----
    const { data: agenda, error: agErr } = await db
      .from("agenda_items")
      .select("id, title, presenter, meeting_id, org_id, order_index")
      .eq("id", agendaId)
      .single();

    if (agErr || !agenda) {
      return fail(404, "Agenda item not found", "db", agErr?.message);
    }
    log(`DB: agenda="${agenda.title}", meeting=${agenda.meeting_id}, org=${agenda.org_id}`);

    // Fetch meeting title and date
    let meetingTitle: string | null = null;
    let meetingDate: string | null = null;
    if (agenda.meeting_id) {
      const { data: mtg } = await db
        .from("meetings")
        .select("title, start_at")
        .eq("id", agenda.meeting_id)
        .single();
      if (mtg) {
        meetingTitle = mtg.title;
        meetingDate = mtg.start_at ? new Date(mtg.start_at).toLocaleDateString("ru-RU") : null;
      }
    }

    // ---- 5. CHECK ORG ACCESS ----
    const { data: prof, error: profErr } = await db
      .from("profiles")
      .select("id, organization_id, role")
      .eq("id", user.id)
      .single();

    if (profErr || !prof) {
      return fail(403, "Profile not found", "db", profErr?.message);
    }
    if (prof.organization_id !== agenda.org_id) {
      return fail(403, "User org does not match agenda org", "db");
    }
    log(`DB: access OK, role=${prof.role}`);

    // ---- 6. FETCH MATERIALS ----
    const { data: materials, error: matErr } = await db
      .from("documents")
      .select("*")
      .eq("agenda_item_id", agendaId)
      .order("created_at", { ascending: true });

    if (matErr) {
      return fail(500, "Failed to fetch materials", "db", matErr.message);
    }
    if (!materials || materials.length === 0) {
      return fail(400, "No materials for brief generation", "db");
    }
    log(`DB: ${materials.length} material(s)`);

    // ---- 7. EXTRACT TEXT (structured [DOCn] blocks) ----
    const MAX_PER_FILE = 15_000;
    const MAX_TOTAL = 100_000;
    let totalLen = 0;
    let filesUsed = 0;
    const docBlocks: string[] = [];

    for (let i = 0; i < materials.length; i++) {
      if (totalLen >= MAX_TOTAL) break;
      const mat = materials[i];
      const docLabel = `DOC${i + 1}`;
      const ext = mat.file_name.split(".").pop()?.toLowerCase() || "?";
      const fileDate = mat.created_at ? new Date(mat.created_at).toLocaleDateString("ru-RU") : "?";
      const fileSize = mat.file_size ? `${(mat.file_size / 1024).toFixed(1)} КБ` : "?";

      let text = "";
      try {
        text = await extractFileText(supabaseUrl, serviceKey, mat, log);
      } catch (e) {
        log(`STORAGE: extract FAILED for "${mat.file_name}": ${String(e).slice(0, 200)}`);
      }

      const truncated = text.length > MAX_PER_FILE;
      const content = text
        ? (truncated ? text.slice(0, MAX_PER_FILE) + "\n[TRUNCATED]" : text)
        : "NO_TEXT_EXTRACTED";

      const block = `[${docLabel}]
file_name: ${mat.file_name}
file_type: ${ext}
file_date: ${fileDate}
file_size: ${fileSize}
source_id: ${docLabel}
content:
${content}`;

      docBlocks.push(block);
      totalLen += block.length;
      filesUsed++;
    }

    let materialsContext = docBlocks.join("\n\n---\n\n");
    if (materialsContext.length > MAX_TOTAL) {
      materialsContext = materialsContext.slice(0, MAX_TOTAL) + "\n[...TOTAL CONTEXT TRUNCATED]";
    }
    log(`STORAGE: ${filesUsed} file(s), context=${materialsContext.length} chars`);

    // ---- 8. CALL OPENAI ----
    const meta: BriefMeta = {
      agendaTitle: agenda.title,
      orderIndex: agenda.order_index ?? 1,
      speaker: agenda.presenter,
      meetingTitle,
      meetingDate,
      materialsContext,
    };

    const systemPrompt = SYSTEM_PROMPTS[lang];
    const userPrompt = buildUserPrompt(lang, meta);

    log(`OPENAI: calling gpt-4o-mini, lang=${lang}, prompt=${userPrompt.length} chars`);

    let aiRes: Response;
    try {
      aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.2,
          max_tokens: 2000,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (fetchErr) {
      return fail(502, "Network error calling OpenAI", "openai", String(fetchErr).slice(0, 500));
    }

    log(`OPENAI: status=${aiRes.status}`);

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      log(`OPENAI: error body=${errBody.slice(0, 300)}`);
      return fail(502, `OpenAI returned ${aiRes.status}`, "openai", errBody.slice(0, 500));
    }

    const aiData = await aiRes.json();
    const briefText: string = aiData.choices?.[0]?.message?.content || "";
    if (!briefText) {
      return fail(502, "OpenAI returned empty content", "openai");
    }
    log(`OPENAI: OK, brief=${briefText.length} chars`);

    // ---- 9. GENERATE DOCX ----
    let docxPath = "";
    let docxUrl = "";
    try {
      const docxBytes = buildDocx(
        DOCX_TITLE[lang],
        agenda.title,
        agenda.presenter ? `${DOCX_PRESENTER_LABEL[lang]}: ${agenda.presenter}` : "",
        briefText
      );
      docxPath = `${agenda.meeting_id || "no-meeting"}/${agendaId}/${lang}/ai-brief.docx`;
      log(`DOCX: built ${docxBytes.length} bytes, uploading to briefs/${docxPath}`);

      // Upload to storage (upsert)
      const { error: upErr } = await db.storage
        .from("briefs")
        .upload(docxPath, docxBytes, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          upsert: true,
        });

      if (upErr) {
        log(`DOCX: upload error: ${upErr.message}`);
      } else {
        // Create signed URL (10 min)
        const { data: signedData, error: signErr } = await db.storage
          .from("briefs")
          .createSignedUrl(docxPath, 600);
        if (signErr) {
          log(`DOCX: signedUrl error: ${signErr.message}`);
        } else {
          docxUrl = signedData.signedUrl;
          log(`DOCX: uploaded OK, signedUrl ready`);
        }
      }
    } catch (e) {
      log(`DOCX: generation error: ${String(e).slice(0, 300)}`);
      // Non-fatal: still return brief text
    }

    // ---- 10. SAVE TO DB ----
    const { error: saveErr } = await db
      .from("agenda_briefs")
      .upsert(
        {
          agenda_id: agendaId,
          lang,
          brief_text: briefText,
          files_used: filesUsed,
          docx_path: docxPath || null,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "agenda_id,lang" }
      );

    if (saveErr) {
      log(`SAVE: error: ${saveErr.message}`);
    } else {
      log("SAVE: OK");
    }

    log("DONE");
    return ok({ brief: briefText, lang, docx_url: docxUrl, files_used: filesUsed });
  } catch (err) {
    console.error(`[agenda-brief][${reqId}] FATAL:`, err);
    return fail(500, "Internal server error", "unknown", String(err).slice(0, 500));
  }
});

// ========== File text extraction ==========

interface FileMeta {
  storage_path: string;
  file_name: string;
  mime_type: string;
}

async function extractFileText(
  supabaseUrl: string,
  serviceKey: string,
  mat: FileMeta,
  log: (msg: string) => void
): Promise<string> {
  const ext = mat.file_name.split(".").pop()?.toLowerCase() || "";
  log(`STORAGE: downloading "${mat.file_name}" (${ext})`);

  const url = `${supabaseUrl}/storage/v1/object/documents/${mat.storage_path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    log(`STORAGE: download FAILED ${res.status}: ${errBody.slice(0, 200)}`);
    return `[${mat.file_name} — download error (${res.status})]`;
  }

  if (["txt", "md", "csv", "json", "xml", "html", "htm"].includes(ext)) {
    const text = await res.text();
    log(`STORAGE: text file, ${text.length} chars`);
    return text;
  }

  if (ext === "docx") {
    try {
      const buf = await res.arrayBuffer();
      return await extractDocxText(new Uint8Array(buf), mat.file_name);
    } catch (e) {
      log(`STORAGE: DOCX parse error: ${String(e).slice(0, 200)}`);
      return `[DOCX: ${mat.file_name} — parse failed]`;
    }
  }

  if (ext === "pdf") {
    try {
      const buf = await res.arrayBuffer();
      return extractPdfText(new Uint8Array(buf), mat.file_name);
    } catch (e) {
      log(`STORAGE: PDF parse error: ${String(e).slice(0, 200)}`);
      return `[PDF: ${mat.file_name} — parse failed]`;
    }
  }

  await res.arrayBuffer();
  return `[${mat.file_name} (${ext.toUpperCase()})]`;
}

// ---- DOCX reader ----
async function extractDocxText(data: Uint8Array, fileName: string): Promise<string> {
  const files = parseZipEntries(data);
  const docEntry = files.find(
    (f) => f.name === "word/document.xml" || f.name === "word\\document.xml"
  );
  if (!docEntry) return `[DOCX: ${fileName} — document.xml not found]`;

  let xmlBytes: Uint8Array;
  if (docEntry.compressionMethod === 0) {
    xmlBytes = docEntry.data;
  } else {
    const ds = new DecompressionStream("raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    writer.write(docEntry.data);
    writer.close();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    xmlBytes = new Uint8Array(totalLen);
    let off = 0;
    for (const c of chunks) { xmlBytes.set(c, off); off += c.length; }
  }

  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  return xml
    .replace(/<w:br[^>]*\/>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || `[DOCX: ${fileName} — empty]`;
}

// ---- PDF reader ----
function extractPdfText(data: Uint8Array, fileName: string): string {
  const raw = new TextDecoder("latin1").decode(data);
  const textBlocks: string[] = [];
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;
  while ((match = btEtRegex.exec(raw)) !== null) {
    const block = match[1];
    const strRegex = /\(([^)]*)\)\s*Tj/g;
    let strMatch: RegExpExecArray | null;
    while ((strMatch = strRegex.exec(block)) !== null) {
      const decoded = strMatch[1]
        .replace(/\\n/g, "\n").replace(/\\r/g, "")
        .replace(/\\\(/g, "(").replace(/\\\)/g, ")")
        .replace(/\\\\/g, "\\");
      if (decoded.trim()) textBlocks.push(decoded);
    }
  }
  if (textBlocks.length > 0) return textBlocks.join(" ");
  return `[PDF: ${fileName} — could not extract text]`;
}

// ---- ZIP reader ----
interface ZipEntry { name: string; compressionMethod: number; data: Uint8Array; }

function parseZipEntries(buf: Uint8Array): ZipEntry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const entries: ZipEntry[] = [];
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break;
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameBytes = buf.slice(offset + 30, offset + 30 + nameLen);
    const name = new TextDecoder("utf-8").decode(nameBytes);
    const dataStart = offset + 30 + nameLen + extraLen;
    const data = buf.slice(dataStart, dataStart + compressedSize);
    entries.push({ name, compressionMethod, data });
    offset = dataStart + compressedSize;
  }
  return entries;
}

// ========== DOCX builder (minimal, no dependencies) ==========

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildDocx(docTitle: string, agendaTitle: string, presenterLine: string, briefText: string): Uint8Array {
  // Build paragraphs from brief text
  const lines = briefText.split("\n");
  let bodyXml = "";

  // Title
  bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>${escapeXml(docTitle)}</w:t></w:r></w:p>`;

  // Agenda title
  bodyXml += `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>${escapeXml(agendaTitle)}</w:t></w:r></w:p>`;

  // Presenter
  if (presenterLine) {
    bodyXml += `<w:p><w:r><w:rPr><w:i/><w:sz w:val="24"/></w:rPr><w:t>${escapeXml(presenterLine)}</w:t></w:r></w:p>`;
  }

  // Empty line
  bodyXml += `<w:p/>`;

  // Brief body
  for (const line of lines) {
    if (!line.trim()) {
      bodyXml += `<w:p/>`;
    } else {
      bodyXml += `<w:p><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`;
    }
  }

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
  xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main"
  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
  xmlns:mv="urn:schemas-microsoft-com:mac:vml"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
  xmlns:v="urn:schemas-microsoft-com:vml"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:w10="urn:schemas-microsoft-com:office:word"
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"
  xmlns:sl="http://schemas.openxmlformats.org/schemaLibrary/2006/main"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
  xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
  xmlns:lc="http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas"
  xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram">
<w:body>
${bodyXml}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
</w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  const enc = new TextEncoder();
  return buildZip([
    { name: "[Content_Types].xml", data: enc.encode(contentTypesXml) },
    { name: "_rels/.rels", data: enc.encode(relsXml) },
    { name: "word/_rels/document.xml.rels", data: enc.encode(docRelsXml) },
    { name: "word/document.xml", data: enc.encode(documentXml) },
  ]);
}

// ========== ZIP builder (store, no compression) ==========

interface ZipFileEntry { name: string; data: Uint8Array; }

function buildZip(files: ZipFileEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDir: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);

    // Local file header (30 + nameLen + dataLen)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);  // signature
    lv.setUint16(4, 20, true);           // version needed
    lv.setUint16(6, 0, true);            // flags
    lv.setUint16(8, 0, true);            // compression: store
    lv.setUint16(10, 0, true);           // mod time
    lv.setUint16(12, 0, true);           // mod date
    lv.setUint32(14, crc32(file.data), true); // crc32
    lv.setUint32(18, file.data.length, true); // compressed size
    lv.setUint32(22, file.data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true); // name length
    lv.setUint16(28, 0, true);                // extra length
    localHeader.set(nameBytes, 30);

    // Central directory entry
    const cdEntry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cdEntry.buffer);
    cv.setUint32(0, 0x02014b50, true);   // signature
    cv.setUint16(4, 20, true);           // version made by
    cv.setUint16(6, 20, true);           // version needed
    cv.setUint16(8, 0, true);            // flags
    cv.setUint16(10, 0, true);           // compression: store
    cv.setUint16(12, 0, true);           // mod time
    cv.setUint16(14, 0, true);           // mod date
    cv.setUint32(16, crc32(file.data), true);
    cv.setUint32(20, file.data.length, true);
    cv.setUint32(24, file.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);           // extra length
    cv.setUint16(32, 0, true);           // comment length
    cv.setUint16(34, 0, true);           // disk number
    cv.setUint16(36, 0, true);           // internal attrs
    cv.setUint32(38, 0, true);           // external attrs
    cv.setUint32(42, offset, true);      // local header offset
    cdEntry.set(nameBytes, 46);

    parts.push(localHeader);
    parts.push(file.data);
    centralDir.push(cdEntry);

    offset += localHeader.length + file.data.length;
  }

  const cdOffset = offset;
  let cdSize = 0;
  for (const cd of centralDir) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);
  parts.push(eocd);

  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalLen);
  let pos = 0;
  for (const p of parts) { result.set(p, pos); pos += p.length; }
  return result;
}

// ---- CRC32 ----
function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
