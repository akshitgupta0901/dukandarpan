import { NextResponse } from "next/server";
import { runAllChecks } from "../../../lib/run-all-checks.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; 

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    console.warn("[api/cron] CRON_SECRET is not set -- this route is unauthenticated. Set it before deploying.");
  }

  try {
    const result = await runAllChecks({ triggeredBy: "cron" });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[api/cron] run failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
