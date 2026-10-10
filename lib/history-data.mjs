/**
 * Loads what lib/history-top.mjs needs for one business: the top of every STORED google_maps
 * response for the query it is tracked on. The top is sliced in SQL (positions 1 to 3 are
 * enough to find the best-ranked listing that isn't the business), because a full payload is
 * tens of KB and a history can span months. Never calls SerpApi. `sql` is injectable for tests.
 */
import { sql as defaultSql } from "./db.mjs";

/** @returns {Promise<Array<{ checkedAt: string|Date, results: Array<{ position: number, title: string }> }>>} oldest first; [] if untracked */
export async function loadTopResultsHistory(businessId, { sql = defaultSql } = {}) {
  const [tracked] = await sql`SELECT query_id AS "queryId" FROM tracking WHERE business_id = ${businessId} LIMIT 1`;
  if (!tracked) return [];

  return sql`
    SELECT
      checked_at AS "checkedAt",
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('position', e->'position', 'title', e->>'title')), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(payload_json->'local_results', '[]'::jsonb)) e
        WHERE CASE WHEN jsonb_typeof(e->'position') = 'number' THEN (e->>'position')::numeric <= 3 ELSE false END
      ) AS results
    FROM raw_results
    WHERE query_id = ${tracked.queryId}
    ORDER BY checked_at ASC
  `;
}
