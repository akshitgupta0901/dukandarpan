import { NextResponse } from "next/server";
import { sql } from "../../../lib/db.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET() {
  try {
    // Demo (judge-mode) categories come first so a visitor lands on the populated demo tab;
    // the dashboard selects the first category by default.
    const rows = await sql`
      SELECT category, bool_or(is_demo) AS "isDemo"
      FROM queries
      GROUP BY category
      ORDER BY bool_or(is_demo) DESC, category
    `;
    return NextResponse.json(
      { categories: rows.map((r) => r.category), demoCategories: rows.filter((r) => r.isDemo).map((r) => r.category) },
      { status: 200 }
    );
  } catch (err) {
    console.error("[api/categories] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
