
import { sql } from "./db.mjs";
import { matchBusinessRank, inOrganicMapPack } from "./rank-matcher.mjs";
import { loadEnv } from "./env.mjs";

loadEnv();

const SERPAPI_BASE = "https://serpapi.com/search.json";
const ORGANIC_LOCATION = "Vellore, Tamil Nadu, India";

async function callSerpApi(params) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error("SERPAPI_API_KEY is not set (checked process.env and .env.local)");
  }
  const url = new URL(SERPAPI_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString());
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`SerpApi request failed (engine=${params.engine}): ${json.error || res.statusText}`);
  }
  return json;
}

async function getQuery(queryId) {
  const rows = await sql`
    SELECT id, query_text, category, lat, lng FROM queries WHERE id = ${queryId}
  `;
  if (rows.length === 0) throw new Error(`No query with id ${queryId}`);
  return rows[0];
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

export async function runCheck(queryId, { includeOrganic = true } = {}) {
  const query = await getQuery(queryId);
  const ll = `@${query.lat},${query.lng},14z`;

  const mapsCall = callSerpApi({ engine: "google_maps", type: "search", q: query.query_text, ll });
  const organicCall = includeOrganic
    ? callSerpApi({
        engine: "google",
        q: query.query_text,
        location: ORGANIC_LOCATION,
        gl: "in",
        hl: "en",
      })
    : Promise.resolve(null);

  const [mapsJson, organicJson] = await Promise.all([mapsCall, organicCall]);

  const [rawRow] = await sql`
    INSERT INTO raw_results (query_id, payload_json)
    VALUES (${queryId}, ${JSON.stringify(mapsJson)}::jsonb)
    RETURNING id, checked_at
  `;

  const businesses = await getTrackedBusinesses(queryId);
  if (businesses.length === 0) {
    console.warn(`runCheck: no businesses tracked on query ${queryId} ("${query.query_text}")`);
  }


  const previousStates = await getPreviousStates(businesses.map((b) => b.id));

  const matchResults = businesses.map((b) => ({
    business: b,
    rank: matchBusinessRank(mapsJson, b.name),
    
    pack: includeOrganic ? inOrganicMapPack(organicJson, b.name) : { inMapPack: null, matchedTitle: null },
  }));

  const snapshotInserts = matchResults.map(
    ({ business, rank, pack }) => sql`
      INSERT INTO snapshots (query_id, business_id, position, found, in_organic_map_pack)
      VALUES (${queryId}, ${business.id}, ${rank.position}, ${rank.found}, ${pack.inMapPack})
      RETURNING id, query_id, business_id, position, found, in_organic_map_pack, checked_at
    `
  );

  // sql.transaction(): all snapshot rows for this run are written atomically
  // (all-or-nothing), as one non-interactive Postgres transaction.
  const snapshotRowSets = matchResults.length ? await sql.transaction(snapshotInserts) : [];

  const snapshots = snapshotRowSets.map((rows, i) => {
    const row = rows[0];
    const { business, rank, pack } = matchResults[i];
    const previous = previousStates.get(business.id) ?? null;
    return {
      ...row,
      businessName: business.name,
      matchedTitle: rank.matchedTitle,
      ambiguous: rank.ambiguous,
      inOrganicMapPackTitle: pack.matchedTitle,
      
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
    organicChecked: includeOrganic,
    serpApiCallsMade: includeOrganic ? 2 : 1,
    snapshots,
  };
}
