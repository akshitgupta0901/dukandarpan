/**
 * Minimal Gemini client over plain fetch (no SDK, no dependency).
 *
 * Endpoint and auth follow Google's REST docs: POST
 * https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * with the key in the `x-goog-api-key` header (so it never appears in a URL or a log).
 * The default model is a current, cheap, stable Flash-Lite model; override it with
 * GEMINI_MODEL. fetch is injected so tests never touch the network.
 *
 * Every failure is a plain Error with a short message that never contains the key.
 * Callers (lib/insight.mjs) catch these and fall back to rule-based text.
 */
import { loadEnv } from "./env.mjs";

loadEnv();

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const GEMINI_TIMEOUT_MS = 12000;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function isLlmConfigured(env = process.env) {
  return Boolean((env.GEMINI_API_KEY ?? "").trim());
}

export function getModel(env = process.env) {
  const model = (env.GEMINI_MODEL ?? "").trim();
  // The model goes into the URL path, so only accept ordinary model-id characters.
  return model && /^[A-Za-z0-9._-]+$/.test(model) ? model : DEFAULT_GEMINI_MODEL;
}

/**
 * @param {{ system: string, prompt: string }} input
 * @param {{ fetchFn?: typeof fetch, env?: object, timeoutMs?: number, maxOutputTokens?: number, temperature?: number }} [opts]
 * @returns {Promise<string>} the model's text
 */
export async function generateText(
  { system, prompt },
  { fetchFn = fetch, env = process.env, timeoutMs = GEMINI_TIMEOUT_MS, maxOutputTokens = 1024, temperature = 0.4 } = {}
) {
  const key = (env.GEMINI_API_KEY ?? "").trim();
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  // maxOutputTokens is generous on purpose: on Gemini 3.x thinking tokens count against it,
  // and a tight limit would truncate a two-sentence answer to nothing.
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchFn(`${GEMINI_BASE}/${getModel(env)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`Gemini request timed out after ${timeoutMs} ms`);
    throw new Error(`Gemini request failed: ${err?.message ?? "network error"}`);
  } finally {
    clearTimeout(timer);
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Gemini returned a non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(`Gemini request failed (HTTP ${res.status}): ${json?.error?.message ?? res.statusText ?? "unknown error"}`);
  }
  if (json?.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked the prompt (${json.promptFeedback.blockReason})`);
  }

  const candidate = json?.candidates?.[0];
  const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
  // Skip "thought" parts if the API returns them; only the answer is wanted.
  const text = parts
    .filter((p) => p && p.thought !== true && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) {
    throw new Error(`Gemini returned no text (finishReason: ${candidate?.finishReason ?? "none"})`);
  }
  return text;
}
