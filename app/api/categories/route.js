import { NextResponse } from "next/server";
import { sql } from "../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET() {
  try {
    const rows = await sql`SELECT DISTINCT category FROM queries ORDER BY category`;
    return NextResponse.json({ categories: rows.map((r) => r.category) }, { status: 200 });
  } catch (err) {
    console.error("[api/categories] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
