import { NextResponse } from "next/server";
import { sql } from "../../../../../lib/db.mjs";
import { loadTopResultsHistory } from "../../../../../lib/history-data.mjs";
import { attachTopCompetitors } from "../../../../../lib/history-top.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/businesses/:id/history
 * Full rank history for one business, oldest first -- feeds the rank-history
 * line chart. `position` is null on a not_found row (the chart renders that
 * as a gap, not a zero).
 *
 * Each point also carries `topCompetitor` ({ name, position, ownIsFirst } or null): the
 * best-ranked OTHER listing in the response stored for that same check (the runner-up when
 * the business is #1 itself). It comes from raw_results, so there are no SerpApi calls, and
 * it is null for a check with no stored response. If those responses can't be read, the
 * history still returns, just without the competitor.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }

  try {
    const [business] = await sql`SELECT id, name, category FROM businesses WHERE id = ${businessId}`;
    if (!business) {
      return NextResponse.json({ error: `No business with id ${businessId}` }, { status: 404 });
    }

    const snapshots = await sql`
      SELECT position, found, checked_at AS "checkedAt"
      FROM snapshots
      WHERE business_id = ${businessId}
      ORDER BY checked_at ASC
    `;
    const history = snapshots.map((s) => ({
      checkedAt: s.checkedAt,
      position: s.found ? s.position : null,
    }));

    let withTop;
    try {
      withTop = attachTopCompetitors(history, await loadTopResultsHistory(businessId), business.name);
    } catch (err) {
      console.warn(`[api/businesses/${businessId}/history] top competitor unavailable: ${err.message}`);
      withTop = history.map((h) => ({ ...h, topCompetitor: null }));
    }

    return NextResponse.json({ business, history: withTop }, { status: 200 });
  } catch (err) {
    console.error(`[api/businesses/${businessId}/history] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
