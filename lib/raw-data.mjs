/**
 * "View SerpApi Data": the latest STORED SerpApi response for a business's query
 * (raw_results.payload_json), made safe to show in the browser. Never calls SerpApi.
 *
 * What is stored: only the google_maps response (lib/run-check.mjs). The regular
 * Google (organic) response is read once to work out the Organic rank and is not
 * kept, so this view can't show it. Demo (judge-mode) queries hold generated sample
 * data, and the view says so.
 *
 * Secrets: SerpApi does not echo the api_key back (no stored payload or fixture
 * contains one), but this view does not rely on that. redactSecrets drops any
 * api_key property, scrubs api_key= URL parameters, and masks the configured key
 * values wherever they appear, so a future change can't leak one.
 */
import { sql as defaultSql } from "./db.mjs";
import { getApiKeys } from "./serpapi.mjs";

export const REDACTED = "[redacted]";
const KEY_PROPERTY = /^api[_-]?key$/i;
const KEY_PARAM = /([?&;]api[_-]?key=)[^&#\s"']*/gi;

function redactString(text, secrets) {
  let out = text.replace(KEY_PARAM, `$1${REDACTED}`);
  for (const secret of secrets) {
    if (secret && out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  return out;
}

/** A deep copy of `value` with every secret removed (see the module comment). Pure. */
export function redactSecrets(value, secrets = []) {
  const keys = secrets.map((s) => String(s ?? "").trim()).filter((s) => s.length >= 8); // too-short strings would mangle ordinary text
  const walk = (v) => {
    if (typeof v === "string") return redactString(v, keys);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (KEY_PROPERTY.test(k)) continue;
        out[k] = walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(value);
}

/**
 * @param {{ business: object, queryText: string, isDemo: boolean, row: { payload: object, checkedAt: string|Date, id?: number } }} input
 */
export function buildRawView({ business, queryText, isDemo, row }, { secrets = [] } = {}) {
  const payload = redactSecrets(row.payload, secrets);
  const engine = typeof payload?.search_parameters?.engine === "string" ? payload.search_parameters.engine : "google_maps";
  return {
    business: { id: business.id, name: business.name },
    queryText,
    isDemo: Boolean(isDemo),
    engine,
    checkedAt: new Date(row.checkedAt).toISOString(),
    rawResultId: row.id ?? null,
    note: isDemo
      ? "Sample data, not a real SerpApi response."
      : "This is the Google Maps response. The regular Google results used for the Organic rank are not stored.",
    payload,
  };
}

/**
 * Loads the latest stored response for a business. Returns a tagged result so the
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

  const [row] = await sql`
    SELECT id, payload_json AS "payload", checked_at AS "checkedAt"
    FROM raw_results
    WHERE query_id = ${tracked.queryId}
    ORDER BY checked_at DESC
    LIMIT 1
  `;
  if (!row) return { kind: "no_data", business, queryText: tracked.queryText };

  return { kind: "ok", view: buildRawView({ business, queryText: tracked.queryText, isDemo: tracked.isDemo, row }, { secrets }) };
}
