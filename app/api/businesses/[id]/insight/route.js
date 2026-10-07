import { NextResponse } from "next/server";
import { generateInsight, getCachedInsight, isCacheFresh, cacheLanguage, cacheMatchesLanguage } from "../../../../../lib/insight.mjs";
import { normalizeLanguage } from "../../../../../lib/teardown.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/businesses/:id/insight?lang=en|hinglish
 * Returns whatever's cached (possibly null, if never generated) -- never
 * recomputes anything. The cache holds one text in one language: asking for the
 * other language returns an empty result (`insight: null`) so the UI offers to
 * generate it, rather than showing the wrong language. `fresh` tells the UI
 * whether to offer "Get insight" or "Refresh insight".
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }
  const language = normalizeLanguage(new URL(request.url).searchParams.get("lang"));

  try {
    const cached = await getCachedInsight(businessId);
    if (!cached) {
      return NextResponse.json({ error: `No business with id ${businessId}` }, { status: 404 });
    }
    if (!cacheMatchesLanguage(cached.language, language)) {
      return NextResponse.json(
        { insight: null, source: null, language, generatedAt: null, fresh: false },
        { status: 200 }
      );
    }
    return NextResponse.json(
      {
        insight: cached.insight,
        source: cached.source ?? null,
        language: cacheLanguage(cached.language),
        generatedAt: cached.generatedAt,
        fresh: isCacheFresh(cached.generatedAt),
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[api/businesses/${businessId}/insight GET] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/businesses/:id/insight?lang=en|hinglish
 * Always recomputes the recommendation (the competitor teardown from the stored
 * SerpApi results, or the rule-based text when there is nothing to compare) and
 * overwrites the cache --
 * only runs on an explicit "Get insight" / "Refresh insight" click (see components/InsightCard.jsx). Never called
 * automatically on page load. `language` in the response is the language of the text
 * returned: the rule-based text is always English, even when Hinglish was asked for.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }
  const language = normalizeLanguage(new URL(request.url).searchParams.get("lang"));

  try {
    const result = await generateInsight(businessId, { language });
    return NextResponse.json(
      {
        insight: result.insight,
        source: result.source,
        language: cacheLanguage(result.language),
        requestedLanguage: language,
        generatedAt: result.generatedAt,
        fresh: true,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(`[api/businesses/${businessId}/insight POST] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
