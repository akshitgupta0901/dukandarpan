
import { sql } from "../lib/db.mjs";

const LAT = 12.968;
const LNG = 79.1503;

const QUERIES = [
  { queryText: "restaurant near VIT Vellore", category: "restaurant" },
  { queryText: "salon in Katpadi", category: "salon" },
  { queryText: "gym near VIT Vellore", category: "gym" },
  { queryText: "cafe near VIT Vellore", category: "cafe" },
];

const BUSINESSES = [
  { name: "Zaitoon Restaurant", category: "restaurant" },
  { name: "Eato Restaurant", category: "restaurant" },
  { name: "Katpadi Kitchen", category: "restaurant" },
  { name: "Elegant Landmark Unisex Salon", category: "salon" },
  { name: "Studieo7 Signature Lounge", category: "salon" },
  { name: "Simply Sparkle Beauty Salon", category: "salon" },
  { name: "Infinity Fitness Gym", category: "gym" },
  { name: "Aesthetic Den", category: "gym" },
  { name: "iMMc Fit Club", category: "gym" },
  { name: "Café Laylat", category: "cafe" },
  { name: "Hangout Cafe", category: "cafe" },
];

async function main() {
  console.log("Seeding queries...");
  const queryIdByCategory = {};
  for (const q of QUERIES) {
    const [row] = await sql`
      INSERT INTO queries (query_text, category, lat, lng)
      VALUES (${q.queryText}, ${q.category}, ${LAT}, ${LNG})
      ON CONFLICT (query_text) DO UPDATE SET category = EXCLUDED.category
      RETURNING id
    `;
    queryIdByCategory[q.category] = row.id;
    console.log(`  query "${q.queryText}" -> id ${row.id}`);
  }

  console.log("\nSeeding businesses...");
  const businesses = [];
  for (const b of BUSINESSES) {
    const [row] = await sql`
      INSERT INTO businesses (name, category)
      VALUES (${b.name}, ${b.category})
      ON CONFLICT (name, category) DO UPDATE SET category = EXCLUDED.category
      RETURNING id
    `;
    businesses.push({ id: row.id, ...b });
    console.log(`  business "${b.name}" (${b.category}) -> id ${row.id}`);
  }

  console.log("\nLinking tracking (business <-> its category's query)...");
  for (const b of businesses) {
    const queryId = queryIdByCategory[b.category];
    await sql`
      INSERT INTO tracking (business_id, query_id)
      VALUES (${b.id}, ${queryId})
      ON CONFLICT (business_id, query_id) DO NOTHING
    `;
    console.log(`  tracking: "${b.name}" (business ${b.id}) <-> query ${queryId} (${b.category})`);
  }

  console.log("\nSeed complete.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
