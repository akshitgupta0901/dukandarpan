
import { sql } from "./db.mjs";
import { matchBusinessRank, inOrganicMapPack, matchOrganicRank } from "./rank-matcher.mjs";
import { organicApplies, checkCredits } from "./check-cost.mjs";
import { loadEnv } from "./env.mjs";
import { callSerpApi } from "./serpapi.mjs";
import { assertLiveQuery } from "./demo.mjs";
import { detectOvertakes } from "./overtake.mjs";
import { storeRawResults } from "./raw-store.mjs";

loadEnv();

async function getQuery(queryId) {
  const rows = await sql`
    SELECT id, query_text, category, lat, lng, is_demo, location_text FROM queries WHERE id = ${queryId}
  `;
  if (rows.length === 0) throw new Error(`No query with id ${queryId}`);
  // Backstop for every caller (CLI, cron, the button): demo data is never searched live.
  return assertLiveQuery(rows[0]);
}

async function getTrackedBusinesses(queryId) {
  return sql`
    SELECT b.id, b.name, b.category
    FROM businesses b
    JOIN tracking t ON t.business_id = b.id
    WHERE t.query_id = ${queryId}
    ORDER BY b.id
  `;
}

/**
 * The latest snapshot per business_id, as of BEFORE this run's insert --
 * i.e. what "previous" means for the alert rule (lib/alerts.mjs). Returns a
 * Map keyed by business_id; a business with no prior snapshot simply has no
 * entry (found: null downstream is how that's distinguished from a real
 * not_found).
 */
async function getPreviousStates(businessIds) {
  if (businessIds.length === 0) return new Map();
  const rows = await sql`
    SELECT DISTINCT ON (business_id) business_id, position, found
    FROM snapshots
    WHERE business_id = ANY(${businessIds}::int[])
    ORDER BY business_id, checked_at DESC
  `;
  return new Map(rows.map((r) => [r.business_id, { position: r.position, found: r.found }]));
}

/** The newest stored response for this query BEFORE the current run's insert; null on a first-ever check. */
async function getPreviousLocalResults(queryId) {
  const [row] = await sql`
    SELECT payload_json->'local_results' AS "localResults"
    FROM raw_results
    WHERE query_id = ${queryId} AND engine = 'google_maps'
    ORDER BY checked_at DESC
    LIMIT 1
  `;
  return Array.isArray(row?.localResults) ? row.localResults : null;
}

export async function runCheck(queryId, { includeOrganic = true } = {}) {
  const query = await getQuery(queryId);
  const ll = `@${query.lat},${query.lng},14z`;

  // The organic search needs a place name. Use the one saved with the query; with none, skip it
  // (maps-only) rather than guess a location.
  const runOrganic = organicApplies({ includeOrganic, locationText: query.location_text });

  const mapsCall = callSerpApi({ engine: "google_maps", type: "search", q: query.query_text, ll });
  // Organic is a bonus (Share of Voice): if it fails, keep the maps result, which is the core of a check.
  const organicCall = runOrganic
    ? callSerpApi({
        engine: "google",
        q: query.query_text,
        location: query.location_text,
        gl: "in",
        hl: "en",
      }).catch((err) => {
        console.warn(`runCheck: organic search failed for query ${queryId}, continuing maps-only: ${err.message}`);
        return null;
      })
    : Promise.resolve(null);

  const [mapsJson, organicJson] = await Promise.all([mapsCall, organicCall]);

  // Read the previous response before this run's insert, so overtakes compare against the last check.
  const previousLocalResults = await getPreviousLocalResults(queryId);

  // The maps response always; the organic one too when that search ran (see lib/raw-store.mjs).
  const { mapsRow: rawRow } = await storeRawResults({ queryId, mapsJson, organicJson });

  const businesses = await getTrackedBusinesses(queryId);
  if (businesses.length === 0) {
    console.warn(`runCheck: no businesses tracked on query ${queryId} ("${query.query_text}")`);
  }


  const previousStates = await getPreviousStates(businesses.map((b) => b.id));

  const matchResults = businesses.map((b) => ({
    business: b,
    rank: matchBusinessRank(mapsJson, b.name),
    
    pack: organicJson ? inOrganicMapPack(organicJson, b.name) : { inMapPack: null, matchedTitle: null },
    organic: organicJson ? matchOrganicRank(organicJson, b.name) : { found: false, position: null },
  }));

  const snapshotInserts = matchResults.map(
    ({ business, rank, pack, organic }) => sql`
      INSERT INTO snapshots (query_id, business_id, position, found, in_organic_map_pack, organic_position)
      VALUES (${queryId}, ${business.id}, ${rank.position}, ${rank.found}, ${pack.inMapPack}, ${organic.position})
      RETURNING id, query_id, business_id, position, found, in_organic_map_pack, organic_position, checked_at
    `
  );

  // sql.transaction(): all snapshot rows for this run are written atomically
  // (all-or-nothing), as one non-interactive Postgres transaction.
  const snapshotRowSets = matchResults.length ? await sql.transaction(snapshotInserts) : [];

  const snapshots = snapshotRowSets.map((rows, i) => {
    const row = rows[0];
    const { business, rank, pack, organic } = matchResults[i];
    const previous = previousStates.get(business.id) ?? null;
    return {
      ...row,
      businessName: business.name,
      matchedTitle: rank.matchedTitle,
      ambiguous: rank.ambiguous,
      inOrganicMapPackTitle: pack.matchedTitle,
      organicTitle: organic.matchedTitle ?? null,
      overtakes: detectOvertakes(previousLocalResults, mapsJson.local_results, business.name),
      
      previousFound: previous ? previous.found : null,
      previousPosition: previous ? previous.position : null,
      queryText: query.query_text,
      category: query.category,
    };
  });

  return {
    queryId,
    queryText: query.query_text,
    category: query.category,
    rawResultId: rawRow.id,
    checkedAt: rawRow.checked_at,
    organicChecked: runOrganic,
    serpApiCallsMade: checkCredits({ includeOrganic, locationText: query.location_text }),
    snapshots,
  };
}
