import { NextResponse } from "next/server";
import { sql } from "../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/businesses?category=cafe
 *
 * Every tracked business in `category`, with its latest snapshot (rank,
 * found, last checked) and a trend derived from the latest vs the previous
 * snapshot. Sorted: found businesses by rank ascending, then not_found
 * businesses, then alphabetically within each group.
 *
 * trend is one of "up" | "down" | "flat" | null:
 *   - null   -- fewer than 2 snapshots exist yet (no trend to show)
 *   - "up"   -- rank improved (position decreased), or went not_found -> found
 *   - "down" -- rank worsened (position increased), or went found -> not_found
 *   - "flat" -- unchanged (same position, or not_found both times)
 *
 * trendChange is how many positions the rank moved between the previous and
 * latest check (always positive; direction is in `trend`). It's null unless
 * both checks found the business, since a move into or out of the pack has no
 * position count to show.
 *
 * found is one of true | false | null:
 *   - true  -- found in the latest check, at `position`
 *   - false -- a check ran and this business was genuinely not in the pack
 *   - null  -- no snapshot exists yet at all (never included in a check --
 *              e.g. just added via "add a query" and no run has happened
 *              since). This is NOT the same fact as `false` and the two must
 *              stay distinguishable in the UI: `checkedAt` is only ever null
 *              in this third case, since every snapshots row has a real,
 *              non-null checked_at (schema-enforced) -- so a genuine
 *              not_found (found: false) always carries a real checkedAt.
 *
 * Assumes each business is tracked on one query (true for both the seeded
 * data and the "add a query" form) -- snapshots are grouped by business_id
 * alone, not (business_id, query_id).
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  if (!category) {
    return NextResponse.json({ error: "category query param is required" }, { status: 400 });
  }

  try {
    const rows = await sql`
      WITH ranked AS (
        SELECT
          business_id,
          position,
          found,
          checked_at,
          ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY checked_at DESC) AS rn
        FROM snapshots
      )
      SELECT
        b.id,
        b.name,
        b.category,
        t.query_id AS "queryId",
        q.query_text AS "queryText",
        latest.position AS "latestPosition",
        latest.found AS "latestFound",
        latest.checked_at AS "latestCheckedAt",
        prev.position AS "prevPosition",
        prev.found AS "prevFound"
      FROM businesses b
      JOIN tracking t ON t.business_id = b.id
      JOIN queries q ON q.id = t.query_id
      LEFT JOIN ranked latest ON latest.business_id = b.id AND latest.rn = 1
      LEFT JOIN ranked prev ON prev.business_id = b.id AND prev.rn = 2
      WHERE b.category = ${category}
      ORDER BY
        CASE WHEN latest.found THEN 0 ELSE 1 END,
        latest.position ASC NULLS LAST,
        b.name ASC
    `;

    const businesses = rows.map((r) => {
      let trend = null;
      let trendChange = null;
      if (r.prevPosition !== null || r.prevFound !== null) {
        if (r.latestFound && r.prevFound) {
          trend = r.latestPosition < r.prevPosition ? "up" : r.latestPosition > r.prevPosition ? "down" : "flat";
          if (trend !== "flat") trendChange = Math.abs(r.latestPosition - r.prevPosition);
        } else if (r.latestFound && !r.prevFound) {
          trend = "up"; // not_found -> found
        } else if (!r.latestFound && r.prevFound) {
          trend = "down"; // found -> not_found
        } else {
          trend = "flat"; // not_found -> not_found
        }
      }

      return {
        id: r.id,
        name: r.name,
        category: r.category,
        queryId: r.queryId,
        queryText: r.queryText,
        position: r.latestFound ? r.latestPosition : null,
        // true | false | null -- see the found: contract note above. Keep
        // this as the raw tri-state rather than coercing to a boolean --
        // the UI needs to tell "checked, not found" apart from "never
        // checked", and both currently render as "not found" if collapsed.
        found: r.latestFound ?? null,
        checkedAt: r.latestCheckedAt,
        trend,
        trendChange,
      };
    });

    return NextResponse.json({ category, businesses }, { status: 200 });
  } catch (err) {
    console.error("[api/businesses] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
