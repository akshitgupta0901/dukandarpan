/**
 * Recommendation generation -- the I/O layer around the pure logic in
 * lib/insight-context.mjs (rule-based text), lib/benchmark.mjs (numbers) and
 * lib/teardown.mjs (prompt + answer checks).
 *
 * With GEMINI_API_KEY set it asks the model for a two-sentence competitor
 * teardown grounded in the benchmark numbers. On ANY problem (no key, a timeout,
 * an HTTP error, an empty or off-format answer, a number that wasn't in the
 * data) it quietly uses the rule-based text instead and never throws to the
 * user. The source ("ai" or "rules") is stored so the card can label it.
 *
 * generateInsight() ALWAYS recomputes and overwrites the cache -- the 24-hour
 * "is this still fresh" decision is made by the caller (the API route), since
 * this only runs on an explicit user click (and so costs at most one LLM call per click).
 * Column names keep the "ai_" prefix from the original migration.
 */
import { sql } from "./db.mjs";
import { getCompetitorData } from "./competitors.mjs";
import { selectRecommendation } from "./insight-context.mjs";
import { loadBenchmark } from "./benchmark-data.mjs";
import { buildTeardownPrompt, checkTeardownText } from "./teardown.mjs";
import { generateText, isLlmConfigured } from "./llm.mjs";

const HISTORY_LIMIT = 5; // matches the "last several snapshots" the summarizer describes
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isCacheFresh(generatedAt) {
  if (!generatedAt) return false;
  return Date.now() - new Date(generatedAt).getTime() < CACHE_TTL_MS;
}

/**
 * Pick the recommendation text. Pure apart from the injected `llmFn`; never throws.
 *
 * @param {{ rule: {text: string}, benchmark: object|null, businessName: string, queryText: string|null }} input
 * @returns {Promise<{ text: string, source: "ai"|"rules" }>}
 */
export async function composeInsight(
  { rule, benchmark, businessName, queryText },
  { llmFn = generateText, env = process.env, warn = console.warn } = {}
) {
  const rules = { text: rule.text, source: "rules" };
  // Nothing to compare (not in the top 20, never checked) or no key: the rules already cover it.
  if (!isLlmConfigured(env) || !benchmark?.found || benchmark.top.length === 0) return rules;

  try {
    const { system, prompt, facts } = buildTeardownPrompt(benchmark, { businessName, queryText });
    const raw = await llmFn({ system, prompt }, { env });
    const checked = checkTeardownText(raw, facts);
    if (!checked.ok) {
      warn(`[insight] AI answer rejected (${checked.reason}); using rule-based text`);
      return rules;
    }
    return { text: checked.text, source: "ai" };
  } catch (err) {
    warn(`[insight] AI unavailable (${err.message}); using rule-based text`);
    return rules;
  }
}

export async function generateInsight(businessId) {
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

  // Only read the stored response when a model will actually use it. A failure here is just "no AI".
  let benchmark = null;
  if (isLlmConfigured()) {
    try {
      benchmark = (await loadBenchmark(businessId))?.benchmark ?? null;
    } catch (err) {
      console.warn(`[insight] couldn't load the benchmark (${err.message}); using rule-based text`);
    }
  }

  const { text, source } = await composeInsight({
    rule,
    benchmark,
    businessName: data.business.name,
    queryText: data.queryText,
  });

  const [row] = await sql`
    UPDATE businesses
    SET ai_insight = ${text}, ai_insight_generated_at = now(), ai_insight_source = ${source}
    WHERE id = ${businessId}
    RETURNING ai_insight AS "insight", ai_insight_generated_at AS "generatedAt", ai_insight_source AS "source"
  `;
  return row;
}

export async function getCachedInsight(businessId) {
  const [row] = await sql`
    SELECT ai_insight AS "insight", ai_insight_generated_at AS "generatedAt", ai_insight_source AS "source"
    FROM businesses
    WHERE id = ${businessId}
  `;
  return row ?? null;
}
