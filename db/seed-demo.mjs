/**
 * Judge-mode seed: fills a "demo cafe" category with 30 days of generated,
 * clearly fictional history (see lib/demo-data.mjs), so the dashboard is
 * populated the moment someone opens it.
 *
 *   npm run db:seed:demo               replace any previous demo data, then insert fresh
 *   npm run db:seed:demo -- --dry-run  print a summary, touch nothing (needs no DATABASE_URL)
 *   npm run db:unseed-demo             remove the demo data and nothing else
 *
 * Idempotent: it first deletes the previous demo businesses (category "demo cafe")
 * and demo queries (queries.is_demo), which cascades to their tracking, raw
 * results, snapshots and alerts. Real data is never touched. Timestamps are
 * relative to the moment you run it (the newest check is "now", the oldest 29
 * days ago), so re-run it to refresh the dates.
 *
 * No SerpApi calls and no Telegram messages: demo alerts are written with
 * telegram_sent = false.
 */
import { sql } from "../lib/db.mjs";
import { generateDemoData, deriveDemoAlerts, HERO_NAME } from "../lib/demo-data.mjs";
import { DEMO_CATEGORY } from "../lib/demo.mjs";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const unseed = args.has("--unseed");

const RAW_CHUNK = 6; // raw payloads are ~17KB each; keep each transaction request small

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function summarize(data, alerts) {
  const rank = (name) => data.days.map((d) => d.snapshots.find((s) => s.businessName === name));
  const lines = [
    `Demo query: "${data.query.queryText}" (category "${data.query.category}", is_demo)`,
    `Checks: ${data.days.length} daily, ${data.days[0].checkedAt} -> ${data.days[data.days.length - 1].checkedAt}`,
  ];
  for (const b of data.businesses) {
    const s = rank(b.name);
    const found = s.filter((x) => x.found);
    const positions = found.map((x) => x.position);
    lines.push(
      `  ${b.name}${b.isHero ? " (hero)" : ""}: first #${s[0].position ?? "not in top 20"}, last #${s[s.length - 1].position ?? "not in top 20"}, ` +
        `best #${Math.min(...positions)}, worst #${Math.max(...positions)}, not in top 20 on ${s.length - found.length} day(s)`
    );
  }
  lines.push(`Alerts: ${alerts.length}`);
  for (const a of alerts) lines.push(`  day ${a.dayIndex}: ${a.businessName} ${a.message}`);
  return lines.join("\n");
}

async function removeDemoData() {
  // Businesses first (cascades tracking/snapshots/alerts), then the demo queries (cascades raw_results).
  await sql.transaction([
    sql`DELETE FROM businesses WHERE category = ${DEMO_CATEGORY}`,
    sql`DELETE FROM queries WHERE is_demo = true`,
  ]);
}

function databaseHost() {
  try {
    return new URL(process.env.DATABASE_URL).host;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  if (unseed) {
    console.log(`Removing demo data from ${databaseHost()} ...`);
    await removeDemoData();
    console.log("Done. Demo query, businesses, snapshots and alerts removed.");
    return;
  }

  const data = generateDemoData({ endDate: new Date() });
  const alerts = deriveDemoAlerts(data);
  console.log(summarize(data, alerts));

  if (dryRun) {
    console.log("\n--dry-run: nothing was written.");
    return;
  }

  console.log(`\nWriting to ${databaseHost()} ...`);
  await removeDemoData();

  const [query] = await sql`
    INSERT INTO queries (query_text, category, lat, lng, is_demo)
    VALUES (${data.query.queryText}, ${data.query.category}, ${data.query.lat}, ${data.query.lng}, true)
    RETURNING id
  `;

  const businessIds = {};
  for (const b of data.businesses) {
    const [row] = await sql`
      INSERT INTO businesses (name, category) VALUES (${b.name}, ${DEMO_CATEGORY}) RETURNING id
    `;
    businessIds[b.name] = row.id;
  }
  await sql.transaction(
    data.businesses.map(
      (b) => sql`INSERT INTO tracking (business_id, query_id) VALUES (${businessIds[b.name]}, ${query.id})`
    )
  );

  for (const group of chunk(data.days, RAW_CHUNK)) {
    await sql.transaction(
      group.map(
        (day) => sql`
          INSERT INTO raw_results (query_id, payload_json, checked_at)
          VALUES (${query.id}, ${JSON.stringify(day.payload)}::jsonb, ${day.checkedAt}::timestamptz)
        `
      )
    );
  }

  // One transaction for every snapshot, with RETURNING id so alerts can point at their snapshot.
  const flat = data.days.flatMap((day) => day.snapshots.map((s) => ({ day, s })));
  const snapshotSets = await sql.transaction(
    flat.map(
      ({ day, s }) => sql`
        INSERT INTO snapshots (query_id, business_id, position, found, in_organic_map_pack, checked_at)
        VALUES (${query.id}, ${businessIds[s.businessName]}, ${s.position}, ${s.found}, ${null}, ${day.checkedAt}::timestamptz)
        RETURNING id
      `
    )
  );
  const snapshotIdByKey = new Map(flat.map(({ day, s }, i) => [`${day.dayIndex}|${s.businessName}`, snapshotSets[i][0].id]));

  if (alerts.length > 0) {
    await sql.transaction(
      alerts.map(
        (a) => sql`
          INSERT INTO alerts (
            business_id, query_id, snapshot_id, alert_type,
            previous_position, previous_found, new_position, new_found,
            message, telegram_sent, telegram_error, created_at
          )
          VALUES (
            ${businessIds[a.businessName]}, ${query.id}, ${snapshotIdByKey.get(`${a.dayIndex}|${a.businessName}`)}, ${a.type},
            ${a.previousPosition}, ${a.previousFound}, ${a.newPosition}, ${a.newFound},
            ${a.message}, false, ${null}, ${a.checkedAt}::timestamptz
          )
        `
      )
    );
  }

  // Pre-fill the recommendation card. A failure here is not fatal: the card still has its button.
  try {
    const { generateInsight } = await import("../lib/insight.mjs");
    const insight = await generateInsight(businessIds[HERO_NAME]);
    console.log(`Insight for ${HERO_NAME}: ${insight.insight}`);
  } catch (err) {
    console.warn(`Could not pre-fill the insight (${err.message}). The card still works on click.`);
  }

  console.log(
    `\nSeeded ${data.days.length} days: ${flat.length} snapshots, ${data.days.length} raw payloads, ${alerts.length} alerts.`
  );
}

main().catch((err) => {
  console.error("Demo seed failed:", err);
  process.exit(1);
});
