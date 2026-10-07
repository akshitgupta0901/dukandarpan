import { NextResponse } from "next/server";
import { checkBusinessNow, CheckBusinessError } from "../../../../../lib/check-business.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/businesses/:id/check
 * Runs one live rank check for the business's query (1 SerpApi credit) -- the
 * "Run check now" button. No secret is needed or sent from the browser; abuse
 * is bounded by the 1-hour per-business cooldown (see lib/check-business.mjs).
 * Not the same as /api/run-now, which checks every query and needs CRON_SECRET.
 */
export async function POST(request, { params }) {
  const { id } = await params;
  const businessId = Number(id);
  if (!Number.isInteger(businessId)) {
    return NextResponse.json({ error: "invalid business id" }, { status: 400 });
  }

  try {
    const result = await checkBusinessNow(businessId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof CheckBusinessError) {
      const headers = err.extra.retryAfterSeconds ? { "Retry-After": String(err.extra.retryAfterSeconds) } : undefined;
      return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status, headers });
    }
    console.error(`[api/businesses/${businessId}/check] failed:`, err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
