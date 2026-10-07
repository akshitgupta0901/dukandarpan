import { NextResponse } from "next/server";
import { sql } from "../../../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/businesses/:id/history
 * Full rank history for one business, oldest first -- feeds the rank-history
 * line chart. `position` is null on a not_found row (the chart renders that
 * as a gap, not a zero).
 */
export async function GET(request, { params }) {
  const businessId = Number(params.id);
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

    return NextResponse.json(
      {
        business,
        history: snapshots.map((s) => ({
          checkedAt: s.checkedAt,
          position: s.found ? s.position : null,
        })),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[api/businesses/${businessId}/history] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
