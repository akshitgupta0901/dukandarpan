/**
 * Loads what lib/benchmark.mjs needs: the latest STORED google_maps response for
 * the query a business is tracked on (raw_results), the same approach as
 * lib/competitors.mjs. Never calls SerpApi, so reading a benchmark costs no credits.
 *
 * `sql` is injectable so the function can be tested with a fake.
 */
import { sql as defaultSql } from "./db.mjs";
import { buildBenchmark } from "./benchmark.mjs";

export async function loadBenchmark(businessId, { sql = defaultSql } = {}) {
  const [business] = await sql`SELECT id, name, category FROM businesses WHERE id = ${businessId}`;
  if (!business) return null;

  const [tracked] = await sql`
    SELECT t.query_id AS "queryId", q.query_text AS "queryText"
    FROM tracking t
    JOIN queries q ON q.id = t.query_id
    WHERE t.business_id = ${businessId}
    LIMIT 1
  `;
  if (!tracked) {
    return { business, queryText: null, rawCheckedAt: null, benchmark: null, note: "This business isn't tracked on any query." };
  }

  const [raw] = await sql`
    SELECT payload_json AS "payloadJson", checked_at AS "checkedAt"
    FROM raw_results
    WHERE query_id = ${tracked.queryId}
    ORDER BY checked_at DESC
    LIMIT 1
  `;
  if (!raw) {
    return { business, queryText: tracked.queryText, rawCheckedAt: null, benchmark: null, note: "No SerpApi response stored yet for this query." };
  }

  const localResults = Array.isArray(raw.payloadJson?.local_results) ? raw.payloadJson.local_results : [];
  return {
    business,
    queryText: tracked.queryText,
    rawCheckedAt: raw.checkedAt,
    benchmark: buildBenchmark(localResults, business.name),
    note: null,
  };
}
