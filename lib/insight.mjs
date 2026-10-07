/**
 * Rule-based recommendation generation (Phase 7) -- the I/O layer around the
 * pure rule logic in lib/insight-context.mjs: pulls a business's real
 * snapshot history and real competitor data, picks a recommendation from
 * the rank pattern, and persists it to businesses.ai_insight /
 * ai_insight_generated_at (column names kept from the original migration so
 * no schema change is needed). No external API or LLM is involved.
 *
 * generateInsight() ALWAYS recomputes and overwrites the cache -- the
 * 24-hour "is this still fresh" decision is made by the caller (the API
 * route), not here, since this function only runs at all on an explicit
 * user click.
 */
import { sql } from "./db.mjs";
import { getCompetitorData } from "./competitors.mjs";
import { selectRecommendation } from "./insight-context.mjs";

const HISTORY_LIMIT = 5; // matches the "last several snapshots" the summarizer describes
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isCacheFresh(generatedAt) {
  if (!generatedAt) return false;
  return Date.now() - new Date(generatedAt).getTime() < CACHE_TTL_MS;
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

  const { text: insight } = selectRecommendation({
    history,
    found: data.found,
    position: data.myPosition,
    competitors: data.competitors,
  });

  const [row] = await sql`
    UPDATE businesses
    SET ai_insight = ${insight}, ai_insight_generated_at = now()
    WHERE id = ${businessId}
    RETURNING ai_insight AS "insight", ai_insight_generated_at AS "generatedAt"
  `;
  return row;
}

export async function getCachedInsight(businessId) {
  const [row] = await sql`
    SELECT ai_insight AS "insight", ai_insight_generated_at AS "generatedAt"
    FROM businesses
    WHERE id = ${businessId}
  `;
  return row ?? null;
}
