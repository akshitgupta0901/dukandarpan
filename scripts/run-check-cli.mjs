
import { sql } from "../lib/db.mjs";
import { runCheck } from "../lib/run-check.mjs";

async function resolveQueryId(arg) {
  if (/^\d+$/.test(arg)) return Number(arg);
  const rows = await sql`
    SELECT id FROM queries WHERE category = ${arg} OR query_text = ${arg}
  `;
  if (rows.length === 0) {
    throw new Error(
      `No query found for "${arg}" — pass a numeric queryId, a category ` +
        `(restaurant/salon/gym/cafe), or the exact query_text`
    );
  }
  if (rows.length > 1) {
    throw new Error(`"${arg}" matched ${rows.length} queries — pass a numeric queryId instead`);
  }
  return rows[0].id;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/run-check-cli.mjs <queryId | category | query_text>");
    process.exit(1);
  }

  const queryId = await resolveQueryId(arg);
  const result = await runCheck(queryId);

  console.log(`\nQuery ${result.queryId} ("${result.queryText}", ${result.category})`);
  console.log(`raw_results id: ${result.rawResultId}  checked_at: ${result.checkedAt}\n`);
  console.table(
    result.snapshots.map((s) => ({
      business: s.businessName,
      position: s.position,
      found: s.found,
      in_organic_map_pack: s.in_organic_map_pack,
      matched_title: s.matchedTitle,
      ambiguous: s.ambiguous,
    }))
  );
}

main().catch((err) => {
  console.error("runCheck failed:", err);
  process.exit(1);
});
