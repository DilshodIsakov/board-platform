// translate-text/openai.ts
// Makes the HTTP request to the OpenAI Chat Completions API.

import type { ModelName } from "./router.ts";

interface OpenAIMessage {
  role: "system" | "user";
  content: string;
}

interface OpenAIRequestBody {
  model: ModelName;
  messages: OpenAIMessage[];
  temperature: number;
  response_format: { type: "json_object" };
  max_tokens: number;
}

/**
 * Call OpenAI Chat Completions and return the raw response string (JSON).
 * Throws on HTTP error or empty content.
 */
export async function callOpenAI(
  apiKey: string,
  model: ModelName,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const body: OpenAIRequestBody = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   },
    ],
    temperature: 0.1,         // Low temperature → more consistent, formal translations
    response_format: { type: "json_object" },
    max_tokens: 2048,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned empty content");
  }

  return content;
}
