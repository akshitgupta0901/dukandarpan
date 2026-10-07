/**
 * Recommendation generation -- the I/O layer around the pure logic in
 * lib/insight-context.mjs (rule-based text), lib/benchmark.mjs (numbers) and
 * lib/teardown.mjs (the two-sentence competitor teardown).
 *
 * Everything here is built from SerpApi data ALREADY STORED in the database: no
 * network call, no external service. When the business is in the stored results
 * and at least one other listing is, the competitor teardown (English or
 * Hinglish) is used; otherwise (not in the top 20, never checked, nobody to
 * compare with) the original rule-based text is. The source ("teardown" or
 * "rules") is stored so the card can label it.
 *
 * generateInsight() ALWAYS recomputes and overwrites the cache -- the 24-hour
 * "is this still fresh" decision is made by the caller (the API route), since
 * this only runs on an explicit user click. Column names keep the "ai_" prefix
 * from the original migration (renaming would need a new migration); nothing
 * about them involves an AI.
 */
import { sql } from "./db.mjs";
import { getCompetitorData } from "./competitors.mjs";
import { selectRecommendation } from "./insight-context.mjs";
import { loadBenchmark } from "./benchmark-data.mjs";
import { writeTeardown, normalizeLanguage } from "./teardown.mjs";

const HISTORY_LIMIT = 5; // matches the "last several snapshots" the summarizer describes
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isCacheFresh(generatedAt) {
  if (!generatedAt) return false;
  return Date.now() - new Date(generatedAt).getTime() < CACHE_TTL_MS;
}

/**
 * The cache holds one text, in one language. It is only usable for a request in the
 * same language; a cache row from before language existed (NULL) counts as English.
 */
export function cacheLanguage(cachedLang) {
  return normalizeLanguage(cachedLang);
}

export function cacheMatchesLanguage(cachedLang, requestedLang) {
  return cacheLanguage(cachedLang) === normalizeLanguage(requestedLang);
}

/**
 * Pick the recommendation text. Pure and synchronous: no I/O of any kind.
 *
 * The teardown needs the business to be in the results and at least one other
 * listing to compare with; without both, the rule-based text is used. The
 * rule-based text is always English, so `language` in the result is the language
 * of the text actually returned, which may differ from the one requested.
 *
 * @param {{ rule: {text: string}, benchmark: object|null, language?: string }} input
 * @returns {{ text: string, source: "teardown"|"rules", language: "en"|"hinglish" }}
 */
export function composeInsight({ rule, benchmark, language = "en" }) {
  const teardown = writeTeardown(benchmark, { language });
  if (teardown) return { text: teardown.text, source: "teardown", language: teardown.language };
  return { text: rule.text, source: "rules", language: "en" };
}

export async function generateInsight(businessId, { language = "en" } = {}) {
  const data = await getCompetitorData(businessId);
  if (!data) throw new Error(`No business with id ${businessId}`);
  // A business that isn't tracked on any query (or was never checked) isn't
  // an error -- it falls through to the "not enough data yet" recommendation.

  const historyRows = await sql`
    SELECT position, found, checked_at AS "checkedAt"
    FROM snapshots
    WHERE business_id = ${businessId}
    ORDER BY checked_at DESC
    LIMIT ${HISTORY_LIMIT}
  `;
  const history = historyRows
    .slice()
    .reverse()
    .map((s) => ({ checkedAt: s.checkedAt, position: s.found ? s.position : null }));

  const rule = selectRecommendation({
    history,
    found: data.found,
    position: data.myPosition,
    competitors: data.competitors,
  });

  // The benchmark is built from the stored search response. If it can't be read, the rule-based text still works.
  let benchmark = null;
  try {
    benchmark = (await loadBenchmark(businessId))?.benchmark ?? null;
  } catch (err) {
    console.warn(`[insight] couldn't load the benchmark (${err.message}); using rule-based text`);
  }

  const { text, source, language: textLanguage } = composeInsight({ rule, benchmark, language });

  const [row] = await sql`
    UPDATE businesses
    SET ai_insight = ${text}, ai_insight_generated_at = now(), ai_insight_source = ${source}, ai_insight_lang = ${textLanguage}
    WHERE id = ${businessId}
    RETURNING ai_insight AS "insight", ai_insight_generated_at AS "generatedAt", ai_insight_source AS "source", ai_insight_lang AS "language"
  `;
  return row;
}

export async function getCachedInsight(businessId) {
  const [row] = await sql`
    SELECT ai_insight AS "insight", ai_insight_generated_at AS "generatedAt", ai_insight_source AS "source", ai_insight_lang AS "language"
    FROM businesses
    WHERE id = ${businessId}
  `;
  return row ?? null;
}
