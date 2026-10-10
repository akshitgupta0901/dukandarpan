/**
 * "View SerpApi Data": the latest STORED SerpApi response for a business's query, one per
 * engine (raw_results.engine), made safe to show in the browser. Never calls SerpApi.
 *
 *   Maps     engine google_maps: saved on every check
 *   Organic  engine google: the regular results, saved on manual "Run check now" runs for
 *            queries with a place name (the daily cron is maps-only, so it never saves one)
 *
 * Demo (judge-mode) queries hold generated sample data, and the view says so.
 *
 * Secrets: redactSecrets (lib/redact.mjs) is applied here as well as when a response is saved.
 */
import { sql as defaultSql } from "./db.mjs";
import { getApiKeys } from "./serpapi.mjs";
import { redactSecrets, REDACTED } from "./redact.mjs";

export { redactSecrets, REDACTED };

export const DEMO_NOTICE = "Sample data, not a real SerpApi response.";
export const ORGANIC_MISSING_MESSAGE = "Organic results are saved on manual 'Run check now' runs for businesses with a place name";
const MAPS_MISSING_MESSAGE = "No Google Maps response is stored for this query yet. Run a check to fetch one.";
const DEMO_ORGANIC_MISSING_MESSAGE = "No sample organic response has been saved for this demo yet.";

const TABS = [
  { engine: "google_maps", label: "Maps", note: "This is the Google Maps response." },
  { engine: "google", label: "Organic", note: "These are the regular Google results for the same search." },
];

/**
 * @param {{ business: object, queryText: string, isDemo: boolean, rows: Array<{ id?: number, engine: string, payload: object, checkedAt: string|Date }> }} input
 *   `rows` holds the latest stored response for each engine that has one (any order).
 * @returns one entry per tab, always Maps then Organic, so the UI can show both whether or not a response exists
 */
export function buildRawView({ business, queryText, isDemo, rows }, { secrets = [] } = {}) {
  const byEngine = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.engine, r]));

  const tabs = TABS.map(({ engine, label, note }) => {
    const row = byEngine.get(engine);
    if (!row) {
      const emptyMessage =
        engine === "google" ? (isDemo ? DEMO_ORGANIC_MISSING_MESSAGE : ORGANIC_MISSING_MESSAGE) : MAPS_MISSING_MESSAGE;
      return { engine, label, available: false, checkedAt: null, rawResultId: null, payload: null, note: null, emptyMessage };
    }
    const payload = redactSecrets(row.payload, secrets);
    return {
      engine: typeof payload?.search_parameters?.engine === "string" ? payload.search_parameters.engine : engine,
      label,
      available: true,
      checkedAt: new Date(row.checkedAt).toISOString(),
      rawResultId: row.id ?? null,
      payload,
      note: isDemo ? null : note,
      emptyMessage: null,
    };
  });

  return {
    business: { id: business.id, name: business.name },
    queryText,
    isDemo: Boolean(isDemo),
    notice: isDemo ? DEMO_NOTICE : null,
    tabs,
  };
}

/**
 * Loads the latest stored response per engine for a business. Returns a tagged result so the
 * route can map each case to a clean HTTP status without throwing:
 *   { kind: "ok", view } | { kind: "no_business" } | { kind: "untracked", business } | { kind: "no_data", business, queryText }
 */
export async function loadRawView(businessId, { sql = defaultSql, secrets = getApiKeys() } = {}) {
  const [business] = await sql`SELECT id, name FROM businesses WHERE id = ${businessId}`;
  if (!business) return { kind: "no_business" };

  const [tracked] = await sql`
    SELECT t.query_id AS "queryId", q.query_text AS "queryText", COALESCE(q.is_demo, false) AS "isDemo"
    FROM tracking t
    JOIN queries q ON q.id = t.query_id
    WHERE t.business_id = ${businessId}
    LIMIT 1
  `;
  if (!tracked) return { kind: "untracked", business };

  // The newest response of each engine: at most two rows.
  const rows = await sql`
    SELECT DISTINCT ON (engine) id, engine, payload_json AS "payload", checked_at AS "checkedAt"
    FROM raw_results
    WHERE query_id = ${tracked.queryId} AND engine IN ('google_maps', 'google')
    ORDER BY engine, checked_at DESC
  `;
  if (!rows || rows.length === 0) return { kind: "no_data", business, queryText: tracked.queryText };

  return { kind: "ok", view: buildRawView({ business, queryText: tracked.queryText, isDemo: tracked.isDemo, rows }, { secrets }) };
}
