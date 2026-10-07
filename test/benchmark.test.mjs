import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBenchmark, priceLevel, closingTime, listingHealth, CHECKLIST } from "../lib/benchmark.mjs";
import { generateDemoData, HERO_NAME } from "../lib/demo-data.mjs";
import { loadBenchmark } from "../lib/benchmark-data.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const cafeFixture = JSON.parse(fs.readFileSync(path.join(FIXTURES, "maps_cafe.json"), "utf8"));
const demo = generateDemoData({ endDate: "2026-10-07T12:00:00Z" });
const demoResults = demo.days[29].payload.local_results;
const avg = (nums, d) => Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10 ** d) / 10 ** d;

describe("priceLevel", () => {
  test("rupee ranges map by their upper bound", () => {
    assert.equal(priceLevel({ price: "₹1–200" }), 1);
    assert.equal(priceLevel({ price: "₹200–400" }), 2);
    assert.equal(priceLevel({ price: "₹1–400" }), 2);
    assert.equal(priceLevel({ price: "₹400–1,600" }), 4);
    assert.equal(priceLevel({ price: "₹500–800" }), 3);
  });
  test("dollar-style symbols count their length", () => {
    assert.equal(priceLevel({ price: "$" }), 1);
    assert.equal(priceLevel({ price: "$$$" }), 3);
    assert.equal(priceLevel({ price: "₹₹" }), 2);
  });
  test("no price shown: null", () => {
    assert.equal(priceLevel({}), null);
    assert.equal(priceLevel({ price: "" }), null);
    assert.equal(priceLevel({ price: "Free" }), null);
    assert.equal(priceLevel(null), null);
  });
});

describe("closingTime", () => {
  test("reads the closing time from open_state or hours", () => {
    assert.equal(closingTime({ open_state: "Open · Closes 10:30 PM" }), "10:30 PM");
    assert.equal(closingTime({ hours: "Open · Closes 9 PM" }), "9 PM");
    assert.equal(closingTime({ open_state: "Open · Closes 10PM" }), "10 PM");
  });
  test("closed or missing: null", () => {
    assert.equal(closingTime({ open_state: "Closed · Opens 9 AM" }), null);
    assert.equal(closingTime({}), null);
  });
});

describe("listingHealth", () => {
  test("a complete listing", () => {
    assert.deepEqual(
      listingHealth({ website: "https://x.example", phone: "+91 1", hours: "Open", order_online: ["https://o.example"] }),
      { website: true, claimed: true, phone: true, hours: true, onlineOrder: true }
    );
  });
  test("an empty listing is unclaimed-false only when the flag says so", () => {
    assert.deepEqual(listingHealth({}), { website: false, claimed: true, phone: false, hours: false, onlineOrder: false });
    assert.equal(listingHealth({ unclaimed_listing: true }).claimed, false);
  });
  test("delivery counts as online ordering; takeout alone does not", () => {
    assert.equal(listingHealth({ service_options: { delivery: true } }).onlineOrder, true);
    assert.equal(listingHealth({ service_options: { takeout: true, delivery: false } }).onlineOrder, false);
    assert.equal(listingHealth({ order_online: [] }).onlineOrder, false);
  });
  test("operating_hours alone counts as having hours", () => {
    assert.equal(listingHealth({ operating_hours: { monday: "9 AM–5 PM" } }).hours, true);
    assert.equal(listingHealth({ operating_hours: {} }).hours, false);
  });
});

describe("buildBenchmark (demo data, day 30)", () => {
  const b = buildBenchmark(demoResults, HERO_NAME);
  const heroEntry = demoResults.find((r) => r.title === HERO_NAME);
  const others = demoResults.filter((r) => r.title !== HERO_NAME).slice(0, 3);

  test("finds the hero and compares it with the top 3 OTHER listings", () => {
    assert.equal(b.found, true);
    assert.equal(b.own.title, HERO_NAME);
    assert.equal(b.own.position, heroEntry.position);
    assert.deepEqual(b.top.map((t) => t.title), others.map((r) => r.title));
    assert.ok(!b.top.some((t) => t.title === HERO_NAME));
  });

  test("averages are computed from the top 3", () => {
    assert.equal(b.averages.rating, avg(others.map((r) => r.rating), 1));
    assert.equal(b.averages.reviews, avg(others.map((r) => r.reviews), 0));
    assert.ok(b.averages.reviews > b.own.reviews * 5, "the hero has far fewer reviews");
  });

  test("the hero's checklist: no website, unclaimed, no online ordering; has phone and hours", () => {
    const byKey = Object.fromEntries(b.checklist.map((c) => [c.key, c]));
    assert.equal(byKey.website.you, false);
    assert.equal(byKey.claimed.you, false);
    assert.equal(byKey.phone.you, true);
    assert.equal(byKey.hours.you, true);
    assert.equal(byKey.onlineOrder.you, false);
    assert.equal(byKey.website.topCount, others.filter((r) => r.website).length);
    assert.equal(byKey.claimed.topCount, others.filter((r) => !r.unclaimed_listing).length);
    assert.equal(byKey.website.topOf, 3);
  });

  test("the checklist covers every item, in order", () => {
    assert.deepEqual(b.checklist.map((c) => c.key), CHECKLIST.map((c) => c.key));
  });

  test("closing times are read for the hero and the top 3", () => {
    assert.equal(b.own.closes, "7 PM");
    assert.ok(b.top.every((t) => t.closes && t.closes !== "7 PM"));
  });
});

describe("buildBenchmark (edge cases)", () => {
  test("a business that is not in the results: found false, no 'you', top 3 still listed", () => {
    const b = buildBenchmark(demoResults, "Nonexistent Cafe");
    assert.equal(b.found, false);
    assert.equal(b.own, null);
    assert.equal(b.top.length, 3);
    assert.ok(b.checklist.every((c) => c.you === null));
  });

  test("fewer than 3 other listings: uses what exists", () => {
    const b = buildBenchmark(demoResults.slice(0, 2), demoResults[0].title);
    assert.equal(b.top.length, 1);
    assert.equal(b.checklist[0].topOf, 1);
  });

  test("a single listing that is the business itself: empty top, null averages", () => {
    const b = buildBenchmark(demoResults.slice(0, 1), demoResults[0].title);
    assert.equal(b.found, true);
    assert.deepEqual(b.top, []);
    assert.deepEqual(b.averages, { rating: null, reviews: null, priceLevel: null });
  });

  test("averages skip listings that lack a value instead of counting them as zero", () => {
    const results = [
      { position: 1, title: "A One", rating: 4, reviews: 100 },
      { position: 2, title: "B Two", rating: 5 }, // no reviews, no price
      { position: 3, title: "C Three", reviews: 300, price: "$$" },
      { position: 4, title: "Mine Only", rating: 3, reviews: 10 },
    ];
    const b = buildBenchmark(results, "Mine Only");
    assert.equal(b.averages.rating, 4.5);
    assert.equal(b.averages.reviews, 200);
    assert.equal(b.averages.priceLevel, 2);
  });

  test("results given out of order are ranked by position", () => {
    const results = [
      { position: 5, title: "Fifth" },
      { position: 2, title: "Second" },
      { position: 9, title: "Ninth" },
      { position: 1, title: "First" },
      { position: 7, title: "Mine Here" },
    ];
    assert.deepEqual(buildBenchmark(results, "Mine Here").top.map((t) => t.title), ["First", "Second", "Fifth"]);
  });

  test("missing or malformed local_results never throws", () => {
    for (const bad of [undefined, null, {}, "x", [null, 3, {}]]) {
      const b = buildBenchmark(bad, "Anything");
      assert.equal(b.found, false);
      assert.deepEqual(b.top, []);
    }
  });

  test("works on a real fixture: Hangout Cafe has a website", () => {
    const b = buildBenchmark(cafeFixture.local_results, "Hangout Cafe");
    assert.equal(b.found, true);
    assert.equal(b.own.health.website, true);
    assert.equal(b.top.length, 3);
  });
});

describe("loadBenchmark (with a fake sql)", () => {
  const fakeSql = (...results) => {
    const queue = [...results];
    return async () => queue.shift();
  };

  test("unknown business: null", async () => {
    assert.equal(await loadBenchmark(1, { sql: fakeSql([]) }), null);
  });

  test("untracked business: explains instead of failing", async () => {
    const out = await loadBenchmark(1, { sql: fakeSql([{ id: 1, name: "X", category: "c" }], []) });
    assert.equal(out.benchmark, null);
    assert.match(out.note, /isn't tracked/);
  });

  test("no stored response yet: explains", async () => {
    const out = await loadBenchmark(1, { sql: fakeSql([{ id: 1, name: "X", category: "c" }], [{ queryId: 4, queryText: "q" }], []) });
    assert.equal(out.benchmark, null);
    assert.match(out.note, /No SerpApi response stored/);
  });

  test("builds the benchmark from the latest stored payload", async () => {
    const out = await loadBenchmark(1, {
      sql: fakeSql(
        [{ id: 1, name: HERO_NAME, category: "demo cafe" }],
        [{ queryId: 4, queryText: "cafe near Katpadi (demo)" }],
        [{ payloadJson: { local_results: demoResults }, checkedAt: "2026-10-07T12:00:00Z" }]
      ),
    });
    assert.equal(out.queryText, "cafe near Katpadi (demo)");
    assert.equal(out.rawCheckedAt, "2026-10-07T12:00:00Z");
    assert.equal(out.benchmark.found, true);
    assert.equal(out.note, null);
  });
});
