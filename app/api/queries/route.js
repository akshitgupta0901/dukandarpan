import { NextResponse } from "next/server";
import { sql } from "../../../lib/db.mjs";
import { geocodeLocation } from "../../../lib/geocode.mjs";
import { authorizeAdmin } from "../../../lib/admin-auth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET() {
  try {
    const rows = await sql`
      SELECT id, query_text AS "queryText", category, lat, lng
      FROM queries
      ORDER BY category, query_text
    `;
    return NextResponse.json({ queries: rows }, { status: 200 });
  } catch (err) {
    console.error("[api/queries GET] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}


export async function POST(request) {
  // First thing, before parsing, geocoding or touching the database: strangers
  // must not be able to add queries (each one costs a SerpApi credit per day).
  const auth = authorizeAdmin({
    provided: request.headers.get("x-admin-key"),
    expected: process.env.ADMIN_KEY,
    nodeEnv: process.env.NODE_ENV,
  });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const queryText = String(body?.queryText ?? "").trim();
  const category = String(body?.category ?? "").trim();
  const location = String(body?.location ?? "").trim();
  const businessNames = Array.isArray(body?.businessNames)
    ? [...new Set(body.businessNames.map((n) => String(n ?? "").trim()).filter(Boolean))]
    : [];

  if (!queryText) return NextResponse.json({ error: "queryText is required" }, { status: 400 });
  if (!category) return NextResponse.json({ error: "category is required" }, { status: 400 });
  if (!location) return NextResponse.json({ error: "location is required" }, { status: 400 });

  let lat, lng;
  try {
    ({ lat, lng } = await geocodeLocation(location));
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  try {
    const [query] = await sql`
      INSERT INTO queries (query_text, category, lat, lng)
      VALUES (${queryText}, ${category}, ${lat}, ${lng})
      ON CONFLICT (query_text) DO UPDATE SET category = EXCLUDED.category, lat = EXCLUDED.lat, lng = EXCLUDED.lng
      RETURNING id, query_text AS "queryText", category, lat, lng
    `;

    const businessesAdded = [];
    for (const name of businessNames) {
      const [business] = await sql`
        INSERT INTO businesses (name, category)
        VALUES (${name}, ${category})
        ON CONFLICT (name, category) DO UPDATE SET category = EXCLUDED.category
        RETURNING id, name, category
      `;
      await sql`
        INSERT INTO tracking (business_id, query_id)
        VALUES (${business.id}, ${query.id})
        ON CONFLICT (business_id, query_id) DO NOTHING
      `;
      businessesAdded.push(business);
    }

    return NextResponse.json({ query, businessesAdded }, { status: 200 });
  } catch (err) {
    console.error("[api/queries POST] failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
