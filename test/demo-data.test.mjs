import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateDemoData, deriveDemoAlerts, HERO_NAME, DEMO_DAYS } from "../lib/demo-data.mjs";
import { DEMO_CATEGORY, DEMO_QUERY_TEXT, excludeDemoQueries, assertLiveQuery, DEMO_LIVE_CHECK_MESSAGE } from "../lib/demo.mjs";

const END = "2026-10-07T12:00:00.000Z";
const data = generateDemoData({ endDate: END });
const rankOf = (name) => data.days.map((d) => d.ranking.indexOf(name) + 1);
const hero = rankOf(HERO_NAME);

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const realTitles = fs
  .readdirSync(FIXTURES)
  .filter((f) => f.startsWith("maps_"))
  .flatMap((f) => JSON.parse(fs.readFileSync(path.join(FIXTURES, f), "utf8")).local_results.map((r) => r.title));

/** Minutes after midnight for "10:30 PM" / "7 PM". */
function closingMinutes(openState) {
  const m = /Closes (\d{1,2})(?::(\d{2}))? (AM|PM)/.exec(openState);
  return ((Number(m[1]) % 12) + (m[3] === "PM" ? 12 : 0)) * 60 + Number(m[2] ?? 0);
}

function countOvertakes() {
  const perCompetitor = {};
  let total = 0;
  for (let i = 1; i < data.days.length; i++) {
    const before = data.days[i - 1].ranking;
    const after = data.days[i].ranking;
    const heroBefore = before.indexOf(HERO_NAME);
    const heroAfter = after.indexOf(HERO_NAME);
    for (const name of before) {
      if (name === HERO_NAME) continue;
      if (before.indexOf(name) > heroBefore && after.indexOf(name) < heroAfter) {
        perCompetitor[name] = (perCompetitor[name] ?? 0) + 1;
        total++;
      }
    }
  }
  return { total, perCompetitor };
}

describe("generateDemoData: determinism and shape", () => {
  test("the same seed and endDate give identical output", () => {
    assert.deepEqual(generateDemoData({ endDate: END }), generateDemoData({ endDate: END }));
  });

  test("a different seed gives different data", () => {
    assert.notDeepEqual(generateDemoData({ endDate: END, seed: 1 }).days[5].ranking, data.days[5].ranking);
  });

  test("endDate is required", () => {
    assert.throws(() => generateDemoData(), /endDate is required/);
    assert.throws(() => generateDemoData({ endDate: "not a date" }), /endDate is required/);
  });

  test("never reads the clock or Math.random", () => {
    const realRandom = Math.random;
    const realNow = Date.now;
    Math.random = () => assert.fail("Math.random was called");
    Date.now = () => assert.fail("Date.now was called");
    try {
      generateDemoData({ endDate: END });
    } finally {
      Math.random = realRandom;
      Date.now = realNow;
    }
  });

  test("30 daily checks, 24h apart, the newest exactly at endDate", () => {
    assert.equal(data.days.length, DEMO_DAYS);
    assert.equal(data.days[29].checkedAt, END);
    for (let i = 1; i < 30; i++) {
      assert.equal(Date.parse(data.days[i].checkedAt) - Date.parse(data.days[i - 1].checkedAt), 24 * 3600 * 1000);
    }
  });

  test("the query is flagged demo, in the demo category", () => {
    assert.deepEqual(data.query, { queryText: DEMO_QUERY_TEXT, category: DEMO_CATEGORY, lat: 12.968, lng: 79.1503, isDemo: true });
  });

  test("3 tracked businesses (one hero) among 22 fictional listings", () => {
    assert.deepEqual(data.businesses.map((b) => b.name), [HERO_NAME, "The Daily Grind", "Masala Mug"]);
    assert.deepEqual(data.businesses.filter((b) => b.isHero).map((b) => b.name), [HERO_NAME]);
    assert.equal(new Set(data.days[0].ranking).size, 22);
  });

  test("every day's ranks are a permutation of 1 to 22", () => {
    for (const day of data.days) {
      assert.equal(day.ranking.length, 22);
      assert.equal(new Set(day.ranking).size, 22);
    }
  });
});

describe("generateDemoData: the hero's story", () => {
  test("improves overall: starts at #8 or worse, ends at #4 or better", () => {
    assert.ok(hero[0] >= 8, `starts at #${hero[0]}`);
    assert.ok(hero[29] <= 4, `ends at #${hero[29]}`);
  });

  test("is not a straight line: at least 2 direction changes", () => {
    const steps = hero.slice(1).map((r, i) => Math.sign(r - hero[i])).filter((s) => s !== 0);
    let changes = 0;
    for (let i = 1; i < steps.length; i++) if (steps[i] !== steps[i - 1]) changes++;
    assert.ok(changes >= 2, `${changes} direction changes`);
  });

  test("has one sharp drop of 3 or more places around days 11 to 13", () => {
    const drops = hero.map((r, i) => (i === 0 ? 0 : r - hero[i - 1]));
    const sharp = drops.map((d, i) => [d, i]).filter(([d]) => d >= 3);
    assert.ok(sharp.length >= 1);
    assert.ok(sharp.some(([, i]) => i >= 11 && i <= 13), `sharp drops on days ${sharp.map(([, i]) => i)}`);
  });

  test("competitors overtake the hero at least 3 times, one of them 3 times", () => {
    const { total, perCompetitor } = countOvertakes();
    assert.ok(total >= 3, `${total} overtakes`);
    assert.ok(Math.max(...Object.values(perCompetitor)) >= 3, JSON.stringify(perCompetitor));
  });

  test("Masala Mug is 'Not in top 20' on a few days, and found otherwise", () => {
    const masala = data.days.map((d) => d.snapshots.find((s) => s.businessName === "Masala Mug"));
    const missing = masala.filter((s) => !s.found);
    assert.ok(missing.length >= 2 && missing.length <= 10, `${missing.length} not-found days`);
    for (const s of masala) assert.equal(s.position === null, !s.found);
    data.days.forEach((d, i) => {
      const rank = rankOf("Masala Mug")[i];
      assert.equal(masala[i].found, rank <= 20);
      if (rank <= 20) assert.equal(masala[i].position, rank);
    });
  });
});

describe("generateDemoData: raw payloads", () => {
  const last = data.days[29].payload;

  test("shaped like a google_maps response", () => {
    assert.equal(last.search_parameters.engine, "google_maps");
    assert.equal(last.search_parameters.q, DEMO_QUERY_TEXT);
    assert.ok(last.search_information.query_displayed);
    assert.equal(last.search_metadata.status, "Success");
    assert.equal(last.is_demo_data, true);
  });

  test("only the top 20 appear, positions 1 to 20 in order", () => {
    for (const day of data.days) {
      assert.deepEqual(day.payload.local_results.map((r) => r.position), Array.from({ length: 20 }, (_, i) => i + 1));
      assert.deepEqual(day.payload.local_results.map((r) => r.title), day.ranking.slice(0, 20));
    }
  });

  test("every result carries the fields the app and the fixture have", () => {
    for (const r of last.local_results) {
      for (const field of ["position", "title", "place_id", "data_id", "gps_coordinates", "rating", "reviews", "price", "extracted_price", "type", "types", "address", "open_state", "hours", "operating_hours", "service_options", "phone"]) {
        assert.ok(r[field] !== undefined, `${r.title} is missing ${field}`);
      }
      assert.equal(typeof r.gps_coordinates.latitude, "number");
      assert.equal(Object.keys(r.operating_hours).length, 7);
    }
  });

  test("website, order_online and unclaimed_listing appear only where they apply", () => {
    const withWebsite = last.local_results.filter((r) => r.website);
    assert.ok(withWebsite.length > 0 && withWebsite.length < last.local_results.length);
    for (const r of withWebsite) assert.match(r.website, /\.example\/$/);
    assert.ok(last.local_results.some((r) => r.order_online));
    assert.ok(last.local_results.every((r) => r.unclaimed_listing === undefined || r.unclaimed_listing === true));
  });

  test("the hero has no website and an unclaimed listing", () => {
    const entry = last.local_results.find((r) => r.title === HERO_NAME);
    assert.equal(entry.website, undefined);
    assert.equal(entry.unclaimed_listing, true);
    assert.equal(entry.order_online, undefined);
  });

  test("the hero's top-3 rivals are all claimed, and two of three have a website", () => {
    const top3 = ["Mocha Meadow Cafe", "Kettle & Crumb", "Latte Lane Cafe"].map((n) => last.local_results.find((r) => r.title === n));
    assert.ok(top3.every((r) => !r.unclaimed_listing));
    assert.equal(top3.filter((r) => r.website).length, 2);
  });

  test("hero has far fewer reviews (about 14 growing to about 30) than competitors (120 to 480)", () => {
    const reviewsOn = (day, title) => data.days[day].payload.local_results.find((r) => r.title === title)?.reviews;
    const heroDay = (day) => data.days[day].payload.local_results.find((r) => r.title === HERO_NAME);
    assert.equal(heroDay(0).reviews, 14);
    assert.equal(heroDay(29).reviews, 30);
    for (const r of last.local_results.filter((r) => r.title !== HERO_NAME)) {
      assert.ok(r.reviews >= 120 && r.reviews <= 600, `${r.title} has ${r.reviews}`);
    }
    assert.ok(reviewsOn(29, "Mocha Meadow Cafe") > 400);
  });

  test("review counts never go down, and some competitors gain 10+ in a week", () => {
    const series = (title) => data.days.map((d) => d.payload.local_results.find((r) => r.title === title)?.reviews).filter((n) => n !== undefined);
    for (const name of ["Mocha Meadow Cafe", "Kettle & Crumb", "The Daily Grind"]) {
      const s = series(name);
      for (let i = 1; i < s.length; i++) assert.ok(s[i] >= s[i - 1], `${name} dropped on day ${i}`);
    }
    const kettle = series("Kettle & Crumb");
    assert.ok(kettle[kettle.length - 1] - kettle[kettle.length - 8] >= 10);
  });

  test("the hero closes earlier than every competitor", () => {
    const heroClose = closingMinutes(last.local_results.find((r) => r.title === HERO_NAME).open_state);
    for (const r of last.local_results.filter((r) => r.title !== HERO_NAME)) {
      assert.ok(closingMinutes(r.open_state) > heroClose, `${r.title} closes at ${r.open_state}`);
    }
  });

  test("names are fictional: none matches a real business from the fixtures", () => {
    const real = new Set(realTitles.map((t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()));
    for (const name of data.days[0].ranking) {
      assert.ok(!real.has(name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()), `${name} matches a real listing`);
    }
    assert.ok(last.local_results.every((r) => r.place_id.startsWith("DEMO_PLACE_")));
  });
});

describe("generateDemoData: Share of Voice (organic) data", () => {
  const col = (name, field) => data.days.map((d) => d.snapshots.find((s) => s.businessName === name)[field]);

  test("the hero is strong on the map but never ranks organically (no website): a visibility gap", () => {
    assert.ok(col(HERO_NAME, "organicPosition").every((p) => p === null));
    assert.ok(hero[29] <= 5);
  });

  test("The Daily Grind (has a website) ranks in the regular results every day, within a first page", () => {
    const grind = col("The Daily Grind", "organicPosition");
    assert.ok(grind.every((p) => Number.isInteger(p) && p >= 1 && p <= 10));
  });

  test("Masala Mug rarely ranks organically", () => {
    const masala = col("Masala Mug", "organicPosition").filter((p) => p !== null);
    assert.ok(masala.length <= 8);
  });

  test("in-the-map-pack flag follows the top 3", () => {
    data.days.forEach((d, i) => {
      assert.equal(col(HERO_NAME, "inOrganicMapPack")[i], hero[i] <= 3);
    });
  });

  test("adding organic data did not change the map rankings (own PRNG)", () => {
    assert.deepEqual(hero, [12, 11, 10, 12, 11, 10, 9, 9, 11, 9, 9, 9, 13, 11, 9, 8, 7, 8, 7, 7, 6, 4, 6, 4, 5, 5, 3, 5, 2, 3]);
  });
});

describe("deriveDemoAlerts", () => {
  const alerts = deriveDemoAlerts(data);

  test("the hero's sharp dip raises a rank_drop alert on day 12", () => {
    const a = alerts.find((x) => x.businessName === HERO_NAME && x.type === "rank_drop");
    assert.equal(a.type, "rank_drop");
    assert.equal(a.dayIndex, 12);
    assert.equal(a.newPosition - a.previousPosition >= 3, true);
  });

  test("Masala Mug dropping out of the top 20 raises fell_out alerts", () => {
    const fell = alerts.filter((x) => x.businessName === "Masala Mug" && x.type === "fell_out");
    assert.ok(fell.length >= 1);
    for (const a of fell) {
      assert.equal(a.newFound, false);
      assert.equal(a.newPosition, null);
    }
  });

  test("competitors passing the hero raise 'overtaken' alerts that name them, at most 2 per business per check", () => {
    const overtaken = alerts.filter((a) => a.type === "overtaken");
    assert.ok(overtaken.length >= 3);
    const heroOnes = overtaken.filter((a) => a.businessName === HERO_NAME);
    assert.ok(heroOnes.length >= 3);
    for (const a of heroOnes) {
      assert.ok(a.competitorName && a.competitorName !== HERO_NAME);
      assert.match(a.message, /just outranked you \(you are now #\d+, they are #\d+\)/);
      assert.ok(a.newPosition > a.previousPosition || a.newPosition >= 1);
      assert.equal(a.previousFound, true);
      assert.equal(a.newFound, true);
    }
    const perDay = {};
    for (const a of overtaken) perDay[`${a.dayIndex}|${a.businessName}`] = (perDay[`${a.dayIndex}|${a.businessName}`] ?? 0) + 1;
    assert.ok(Math.max(...Object.values(perDay)) <= 2);
  });

  test("rank alerts carry no competitor name", () => {
    assert.ok(alerts.filter((a) => a.type !== "overtaken").every((a) => a.competitorName === null));
  });

  test("demo data lights up review growth: some competitors gain 10+ reviews in a week, and ratings move", async () => {
    const { computeReviewGrowth, growthKey } = await import("../lib/review-growth.mjs");
    const history = data.days.slice(-8).map((d) => ({ checkedAt: d.checkedAt, results: d.payload.local_results }));
    const growth = computeReviewGrowth(history);
    const gains = [...growth.values()].map((g) => g.reviewsGained);
    assert.ok(gains.filter((g) => g >= 10).length >= 3, `gains: ${gains}`);
    assert.ok([...growth.values()].some((g) => g.ratingChange !== 0 && g.ratingChange !== null));
    assert.ok(growth.has(growthKey({ place_id: "DEMO_PLACE_kettle-crumb" })));
  });

  test("nothing fires on the first day (no previous check)", () => {
    assert.ok(alerts.every((a) => a.dayIndex > 0));
  });
});

describe("lib/demo.mjs helpers", () => {
  test("excludeDemoQueries drops demo queries only", () => {
    const rows = [{ id: 1, is_demo: false }, { id: 2, is_demo: true }, { id: 3 }];
    assert.deepEqual(excludeDemoQueries(rows).map((r) => r.id), [1, 3]);
  });

  test("assertLiveQuery throws the sample-data message for demo queries, passes others through", () => {
    assert.throws(() => assertLiveQuery({ id: 2, is_demo: true }), { message: DEMO_LIVE_CHECK_MESSAGE });
    const live = { id: 1, is_demo: false };
    assert.equal(assertLiveQuery(live), live);
  });
});
