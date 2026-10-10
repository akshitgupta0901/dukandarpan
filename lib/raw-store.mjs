/**
 * Saves the SerpApi responses from one check into raw_results, one row per engine:
 *
 *   google_maps  every check (it is the core of a check, so a failure here fails the check)
 *   google       the regular-results response, only when the organic search ran and succeeded
 *
 * Both are passed through redactSecrets first. Saving the organic response is a bonus, like the
 * organic search itself: if that insert fails, the maps row is already saved, the problem is only
 * logged, and the check carries on. Whether the organic search runs, and what it costs, is decided
 * in lib/run-check.mjs and lib/check-cost.mjs, not here. `sql` is injectable for tests.
 */
import { sql as defaultSql } from "./db.mjs";
import { redactSecrets } from "./redact.mjs";
import { getApiKeys } from "./serpapi.mjs";

export const ENGINE_MAPS = "google_maps";
export const ENGINE_ORGANIC = "google";

/**
 * @returns {Promise<{ mapsRow: { id: number, checked_at: string|Date }, organicStored: boolean }>}
 */
export async function storeRawResults(
  { queryId, mapsJson, organicJson },
  { sql = defaultSql, secrets = getApiKeys(), warn = console.warn } = {}
) {
  const insert = async (engine, payload) => {
    const [row] = await sql`
      INSERT INTO raw_results (query_id, engine, payload_json)
      VALUES (${queryId}, ${engine}, ${JSON.stringify(redactSecrets(payload, secrets))}::jsonb)
      RETURNING id, checked_at
    `;
    return row;
  };

  const mapsRow = await insert(ENGINE_MAPS, mapsJson);

  let organicStored = false;
  if (organicJson) {
    try {
      await insert(ENGINE_ORGANIC, organicJson);
      organicStored = true;
    } catch (err) {
      warn(`storeRawResults: couldn't save the organic response for query ${queryId}, continuing: ${err.message}`);
    }
  }
  return { mapsRow, organicStored };
}
