/**
 * The one place that talks to SerpApi's search endpoint.
 *
 * Supports a spare key: SERPAPI_API_KEY is tried first, SERPAPI_API_KEY_2 (if
 * set) is used when the first account reports "run out of searches". A key
 * seen to be out is skipped for an hour (it may be a monthly reset), so a
 * long-running process doesn't pay a failed round trip on every call.
 *
 * Only an out-of-searches error triggers the fallback. Any other failure
 * (bad parameters, a network error, an invalid key) is thrown as-is, so a real
 * bug is never hidden behind a second attempt. Keys are never put in errors
 * or logs.
 */
import { loadEnv } from "./env.mjs";

loadEnv();

const SERPAPI_BASE = "https://serpapi.com/search.json";
export const EXHAUSTED_KEY_SKIP_MS = 60 * 60 * 1000;

// key -> time it was last seen out of searches (this process only)
const exhaustedAt = new Map();

export function resetExhaustedKeys() {
  exhaustedAt.clear();
}

export function isOutOfSearches(message) {
  return /run out of searches/i.test(String(message ?? ""));
}

/** Configured keys in priority order, blanks removed, duplicates dropped. */
export function getApiKeys(env = process.env) {
  const keys = [env.SERPAPI_API_KEY, env.SERPAPI_API_KEY_2]
    .map((k) => (k ?? "").trim())
    .filter(Boolean);
  return [...new Set(keys)];
}

export async function callSerpApi(params, { fetchFn = fetch, env = process.env, now = Date.now } = {}) {
  const keys = getApiKeys(env);
  if (keys.length === 0) {
    throw new Error("SERPAPI_API_KEY is not set (checked process.env and .env.local)");
  }

  const t = now();
  const skipped = (key) => t - (exhaustedAt.get(key) ?? -Infinity) < EXHAUSTED_KEY_SKIP_MS;
  let candidates = keys.filter((k) => !skipped(k));
  // Every key was recently out: still try them in order rather than fail without a call
  // (a monthly reset may have happened, and the real error is more useful than a guess).
  if (candidates.length === 0) candidates = keys;

  let lastOutOfSearches = null;
  for (const key of candidates) {
    const url = new URL(SERPAPI_BASE);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.searchParams.set("api_key", key);

    const res = await fetchFn(url.toString());
    let json;
    try {
      json = await res.json();
    } catch {
      // e.g. an HTML error page from a gateway: say so, instead of a raw JSON parse error
      throw new Error(`SerpApi request failed (engine=${params.engine}): non-JSON response (HTTP ${res.status})`);
    }
    if (res.ok && !json.error) return json;

    const reason = json.error || res.statusText;
    if (isOutOfSearches(reason)) {
      exhaustedAt.set(key, now());
      lastOutOfSearches = reason;
      continue; // try the next key, if there is one
    }
    throw new Error(`SerpApi request failed (engine=${params.engine}): ${reason}`);
  }

  const n = candidates.length;
  throw new Error(
    `SerpApi request failed (engine=${params.engine}): ${lastOutOfSearches} ` +
      `(${n === 1 ? "the only API key is" : `all ${n} API keys are`} out of searches)`
  );
}
