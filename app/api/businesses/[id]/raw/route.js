import { NextResponse } from "next/server";
import { loadRawView } from "../../../../../lib/raw-data.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/businesses/:id/raw
 * The latest STORED SerpApi response for the business's query (raw_results), for the
 * "View SerpApi Data" modal: the payload plus when it was fetched, the engine and the
 * query text. Read-only: it never calls SerpApi. Any API key is stripped (see lib/raw-data.mjs).
 * A business with nothing stored yet gets a clean 404 with a message the UI can show as is.
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }

  try {
    const result = await loadRawView(businessId);
    switch (result.kind) {
      case "no_business":
        return NextResponse.json({ error: `No business with id ${businessId}` }, { status: 404 });
      case "untracked":
        return NextResponse.json({ error: `${result.business.name} isn't tracked on any query, so there is no SerpApi data for it.` }, { status: 404 });
      case "no_data":
        return NextResponse.json({ error: "No SerpApi response is stored for this query yet. Run a check to fetch one." }, { status: 404 });
      default:
        return NextResponse.json(result.view, { status: 200 });
    }
  } catch (err) {
    console.error(`[api/businesses/${businessId}/raw] failed:`, err);
    return NextResponse.json({ error: "Couldn't load the SerpApi data." }, { status: 500 });
  }
}
