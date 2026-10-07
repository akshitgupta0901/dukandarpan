import { NextResponse } from "next/server";
import { sql } from "../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const rawLimit = Number(searchParams.get("limit"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  try {
    const rows = await sql`
      SELECT
        a.id,
        a.alert_type AS "alertType",
        a.message,
        a.previous_position AS "previousPosition",
        a.new_position AS "newPosition",
        a.telegram_sent AS "telegramSent",
        a.telegram_error AS "telegramError",
        a.created_at AS "createdAt",
        b.id AS "businessId",
        b.name AS "businessName",
        b.category,
        q.query_text AS "queryText",
        q.is_demo AS "isDemo"
      FROM alerts a
      JOIN businesses b ON b.id = a.business_id
      JOIN queries q ON q.id = a.query_id
      ORDER BY a.created_at DESC
      LIMIT ${limit}
    `;

    return NextResponse.json({ alerts: rows }, { status: 200 });
  } catch (err) {
    console.error("[api/alerts] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
