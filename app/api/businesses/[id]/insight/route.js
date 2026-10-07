import { NextResponse } from "next/server";
import { generateInsight, getCachedInsight, isCacheFresh } from "../../../../../lib/insight.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/businesses/:id/insight
 * Returns whatever's cached (possibly null, if never generated) -- never
 * recomputes anything. `fresh` tells the UI whether to offer
 * "Get insight" or "Refresh insight".
 */
export async function GET(request, { params }) {
  const businessId = Number(params.id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }
  try {
    const cached = await getCachedInsight(businessId);
    if (!cached) {
      return NextResponse.json({ error: `No business with id ${businessId}` }, { status: 404 });
    }
    return NextResponse.json(
      { insight: cached.insight, generatedAt: cached.generatedAt, fresh: isCacheFresh(cached.generatedAt) },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[api/businesses/${businessId}/insight GET] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/businesses/:id/insight
 * Always recomputes the rule-based recommendation and overwrites the cache --
 * only runs on an explicit "Get insight" / "Refresh insight" click (see components/InsightCard.jsx). Never called
 * automatically on page load.
 */
export async function POST(request, { params }) {
  const businessId = Number(params.id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }
  try {
    const result = await generateInsight(businessId);
    return NextResponse.json({ insight: result.insight, generatedAt: result.generatedAt, fresh: true }, { status: 200 });
  } catch (err) {
    console.error(`[api/businesses/${businessId}/insight POST] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
