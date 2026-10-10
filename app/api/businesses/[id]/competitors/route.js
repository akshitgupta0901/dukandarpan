import { NextResponse } from "next/server";
import { getCompetitorData } from "../../../../../lib/competitors.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/businesses/:id/competitors
 * Thin HTTP wrapper over lib/competitors.mjs -- see there for the actual
 * "who's ranking above this business" logic (shared with the Phase 7
 * insight generator, so both read the same competitor picture).
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }

  try {
    const data = await getCompetitorData(businessId);
    if (!data) {
      return NextResponse.json({ error: `No business with id ${businessId}` }, { status: 404 });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error(`[api/businesses/${businessId}/competitors] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
