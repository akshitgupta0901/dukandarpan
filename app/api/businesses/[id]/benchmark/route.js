import { NextResponse } from "next/server";
import { loadBenchmark } from "../../../../../lib/benchmark-data.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/businesses/:id/benchmark
 * How a business compares with the top 3 listings (rating, reviews, price level)
 * plus its listing-health checklist. Read-only: it uses the latest STORED search
 * response, never calls SerpApi or the LLM, so it is free to call on every page view.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }

  try {
    const data = await loadBenchmark(businessId);
    if (!data) {
      return NextResponse.json({ error: `No business with id ${businessId}` }, { status: 404 });
    }
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error(`[api/businesses/${businessId}/benchmark] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
