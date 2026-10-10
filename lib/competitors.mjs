import { sql } from "./db.mjs";
import { computeReviewGrowth, growthKey } from "./review-growth.mjs";
import { ownReviewCount } from "./review-gap.mjs";

/**
 * The last week of STORED responses for a query, slimmed in SQL to just the fields
 * review growth needs (each full payload is tens of KB, and this runs on every
 * business selection). No SerpApi call. The 7 days here match GROWTH_WINDOW_DAYS in lib/review-growth.mjs.
 */
async function loadGrowthHistory(queryId) {
  const rows = await sql`
    SELECT
      checked_at AS "checkedAt",
      (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'place_id', e->>'place_id', 'title', e->>'title', 'reviews', e->'reviews', 'rating', e->'rating'
        )), '[]'::jsonb)
        FROM jsonb_array_elements(COALESCE(payload_json->'local_results', '[]'::jsonb)) e
      ) AS results
    FROM raw_results
    WHERE query_id = ${queryId}
      AND checked_at >= (SELECT max(checked_at) FROM raw_results WHERE query_id = ${queryId}) - interval '7 days'
    ORDER BY checked_at
  `;
  return rows;
}

function competitorEntry(item, growthByKey) {
  const growth = growthByKey.get(growthKey(item)) ?? null;
  return {
    position: item.position,
    title: item.title,
    reviews: typeof item.reviews === "number" ? item.reviews : null,
    rating: typeof item.rating === "number" ? item.rating : null,
    reviewsGained: growth?.reviewsGained ?? null,
    ratingChange: growth?.ratingChange ?? null,
    growthDays: growth?.days ?? null,
  };
}

const NOT_FOUND_PREVIEW_COUNT = 5; // when the business itself is not_found, show the current top of the pack instead

/**
 * "Who's ranking above this business" -- read from the most recent RAW
 * google_maps response stored for this business's query (raw_results), not
 * from the tracked-businesses list, so it surfaces real competitors even
 * ones nobody asked to track.
 *
 * Shared by app/api/businesses/:id/competitors (Phase 5) and the Phase 7
 * insight generator, so both read the same competitor picture rather than
 * two slightly different ones drifting apart over time.
 */
export async function getCompetitorData(businessId) {
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
    return {
      business,
      queryText: null,
      found: null,
      checked: false,
      myPosition: null,
      myReviews: null,
      rawCheckedAt: null,
      competitors: [],
      note: "This business isn't tracked on any query.",
    };
  }

  const [latestSnapshot] = await sql`
    SELECT position, found
    FROM snapshots
    WHERE business_id = ${businessId} AND query_id = ${tracked.queryId}
    ORDER BY checked_at DESC
    LIMIT 1
  `;

  const [rawResult] = await sql`
    SELECT payload_json AS "payloadJson", checked_at AS "checkedAt"
    FROM raw_results
    WHERE query_id = ${tracked.queryId}
    ORDER BY checked_at DESC
    LIMIT 1
  `;

  // latestSnapshot is undefined when this business has never been part of a
  // check -- that's a different fact from a real snapshot row saying
  // found: false, and the two must not share a message (see below).
  const checked = Boolean(latestSnapshot);
  const found = checked ? latestSnapshot.found : null;
  const myPosition = latestSnapshot?.found ? latestSnapshot.position : null;

  if (!rawResult) {
    return {
      business,
      queryText: tracked.queryText,
      found,
      checked,
      myPosition,
      myReviews: null,
      rawCheckedAt: null,
      competitors: [],
      note: "No SerpApi response stored yet for this query.",
    };
  }

  const localResults = Array.isArray(rawResult.payloadJson?.local_results) ? rawResult.payloadJson.local_results : [];
  // Review growth is a bonus: if the history can't be read, the list still shows without it.
  let growthByKey = new Map();
  try {
    growthByKey = computeReviewGrowth(await loadGrowthHistory(tracked.queryId));
  } catch (err) {
    console.warn(`[competitors] review growth unavailable for query ${tracked.queryId}: ${err.message}`);
  }

  let competitors;
  let note = null;
  if (myPosition) {
    competitors = localResults
      .filter((item) => typeof item.position === "number" && item.position < myPosition)
      .map((item) => competitorEntry(item, growthByKey));
  } else {
    competitors = localResults.slice(0, NOT_FOUND_PREVIEW_COUNT).map((item) => competitorEntry(item, growthByKey));
    note = checked
      ? `${business.name} wasn't found in the last check -- showing the current top ${NOT_FOUND_PREVIEW_COUNT} instead.`
      : `${business.name} hasn't been checked yet -- showing the current top ${NOT_FOUND_PREVIEW_COUNT} from the last run for this query instead.`;
  }

  // The business's own review count from the SAME stored response, so the review gap compares like with like.
  const myReviews = ownReviewCount(localResults, business.name);

  return { business, queryText: tracked.queryText, found, checked, myPosition, myReviews, rawCheckedAt: rawResult.checkedAt, competitors, note };
}
