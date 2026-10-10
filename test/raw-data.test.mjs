import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactSecrets, buildRawView, loadRawView, REDACTED, ORGANIC_MISSING_MESSAGE, DEMO_NOTICE } from "../lib/raw-data.mjs";
import { generateDemoData } from "../lib/demo-data.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const cafe = JSON.parse(fs.readFileSync(path.join(FIXTURES, "maps_cafe.json"), "utf8"));
const KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("redactSecrets", () => {
  test("a real stored response and the demo payload come through unchanged (they hold no key)", () => {
    assert.deepEqual(redactSecrets(cafe, [KEY]), cafe);
    const demo = generateDemoData({ endDate: "2026-10-07T12:00:00Z" }).days[0].payload;
    assert.deepEqual(redactSecrets(demo, [KEY]), demo);
  });

  test("it works on a copy: the input is never modified", () => {
    const input = { search_parameters: { api_key: KEY, q: "x" } };
    const out = redactSecrets(input, [KEY]);
    assert.equal(input.search_parameters.api_key, KEY);
    assert.deepEqual(out, { search_parameters: { q: "x" } });
  });

  test("drops api_key properties at any depth, in any spelling", () => {
    const out = redactSecrets({ a: { api_key: "k1", apiKey: "k2", "api-key": "k3", API_KEY: "k4", keep: 1 }, list: [{ api_key: "k5", ok: true }] });
    assert.deepEqual(out, { a: { keep: 1 }, list: [{ ok: true }] });
  });

  test("scrubs api_key= from URLs inside strings, wherever the parameter sits", () => {
    const out = redactSecrets({
      a: "https://serpapi.com/search.json?engine=google_maps&api_key=SECRETVALUE123&q=cafe",
      b: "https://serpapi.com/search.json?api_key=SECRETVALUE123",
      c: "https://x.example/?q=1;api_key=SECRETVALUE123#frag",
    });
    for (const v of Object.values(out)) assert.doesNotMatch(v, /SECRETVALUE123/);
    assert.equal(out.a, `https://serpapi.com/search.json?engine=google_maps&api_key=${REDACTED}&q=cafe`);
  });

  test("masks the configured key values anywhere in a string (and both keys)", () => {
    const k2 = "zzzzzzzz-second-key-9999";
    const out = redactSecrets({ note: `used ${KEY} then ${k2}`, nested: [{ u: `x/${KEY}/y` }] }, [KEY, k2]);
    assert.equal(out.note, `used ${REDACTED} then ${REDACTED}`);
    assert.equal(out.nested[0].u, `x/${REDACTED}/y`);
  });

  test("very short 'secrets' are ignored so ordinary words are not mangled", () => {
    assert.deepEqual(redactSecrets({ a: "cafe" }, ["caf", "", null, undefined]), { a: "cafe" });
  });

  test("non-object values pass through", () => {
    assert.equal(redactSecrets(5), 5);
    assert.equal(redactSecrets(null), null);
    assert.deepEqual(redactSecrets([1, "a", null]), [1, "a", null]);
  });
});

describe("buildRawView: two tabs, Maps and Organic", () => {
  const business = { id: 10, name: "Café Laylat" };
  const organic = JSON.parse(fs.readFileSync(path.join(FIXTURES, "organic_cafe.json"), "utf8"));
  const mapsRow = { id: 7, engine: "google_maps", payload: cafe, checkedAt: "2026-10-07T12:00:00.000Z" };
  const organicRow = { id: 8, engine: "google", payload: organic, checkedAt: "2026-10-07T12:00:01.000Z" };
  const view = (rows, extra = {}) => buildRawView({ business, queryText: "cafe near VIT Vellore", isDemo: false, rows, ...extra });

  test("always two tabs, Maps first then Organic, each with its payload when it exists", () => {
    const v = view([organicRow, mapsRow]); // order of the rows doesn't matter
    assert.deepEqual(v.tabs.map((t) => [t.label, t.available]), [["Maps", true], ["Organic", true]]);
    assert.deepEqual(v.tabs[0].payload, cafe);
    assert.deepEqual(v.tabs[1].payload, organic);
    assert.equal(v.tabs[0].rawResultId, 7);
    assert.equal(v.tabs[1].rawResultId, 8);
    assert.equal(v.tabs[0].checkedAt, "2026-10-07T12:00:00.000Z");
    assert.equal(v.tabs[1].checkedAt, "2026-10-07T12:00:01.000Z");
    assert.equal(v.queryText, "cafe near VIT Vellore");
    assert.deepEqual(v.business, { id: 10, name: "Café Laylat" });
  });

  test("each tab names its engine, from the stored search_parameters", () => {
    const v = view([mapsRow, organicRow]);
    assert.equal(v.tabs[0].engine, "google_maps");
    assert.equal(v.tabs[1].engine, "google");
    // falls back to the row's own engine when the payload doesn't say
    assert.equal(view([{ ...mapsRow, payload: {} }]).tabs[0].engine, "google_maps");
    assert.equal(view([mapsRow, { ...organicRow, payload: { organic_results: [] } }]).tabs[1].engine, "google");
  });

  test("no organic response yet: the Organic tab is empty with the exact message, and Maps is unaffected", () => {
    const v = view([mapsRow]);
    assert.equal(v.tabs[1].available, false);
    assert.equal(v.tabs[1].payload, null);
    assert.equal(v.tabs[1].emptyMessage, "Organic results are saved on manual 'Run check now' runs for businesses with a place name");
    assert.equal(v.tabs[1].emptyMessage, ORGANIC_MISSING_MESSAGE);
    assert.equal(v.tabs[0].available, true);
    assert.equal(v.tabs[0].emptyMessage, null);
  });

  test("a demo query keeps the sample-data notice; its notes are replaced by that notice", () => {
    const v = view([mapsRow, organicRow], { isDemo: true });
    assert.equal(v.isDemo, true);
    assert.equal(v.notice, "Sample data, not a real SerpApi response.");
    assert.equal(v.notice, DEMO_NOTICE);
    assert.ok(v.tabs.every((t) => t.note === null));
  });

  test("a real query has no demo notice, and each tab says what it is", () => {
    const v = view([mapsRow, organicRow]);
    assert.equal(v.notice, null);
    assert.match(v.tabs[0].note, /Google Maps response/);
    assert.match(v.tabs[1].note, /regular Google results/);
  });

  test("a demo query with no sample organic response doesn't claim 'Run check now' would help", () => {
    const v = view([mapsRow], { isDemo: true });
    assert.doesNotMatch(v.tabs[1].emptyMessage, /Run check now/);
    assert.match(v.tabs[1].emptyMessage, /demo/);
  });

  test("a missing Maps response is reported too (the view never crashes on partial data)", () => {
    const v = view([organicRow]);
    assert.equal(v.tabs[0].available, false);
    assert.match(v.tabs[0].emptyMessage, /Google Maps response/);
    assert.equal(v.tabs[1].available, true);
    assert.equal(view([]).tabs.every((t) => !t.available), true);
    assert.equal(view(undefined).tabs.length, 2);
  });

  test("a Date checkedAt (what the database driver may return) becomes an ISO string", () => {
    const v = view([{ ...mapsRow, checkedAt: new Date("2026-10-07T12:00:00Z") }]);
    assert.equal(v.tabs[0].checkedAt, "2026-10-07T12:00:00.000Z");
  });

  test("a key hiding in EITHER payload is removed from the view", () => {
    const leak = { search_parameters: { engine: "google", api_key: KEY }, link: `https://serpapi.com/x?api_key=${KEY}`, text: `oops ${KEY}` };
    const v = buildRawView({ business, queryText: "q", isDemo: false, rows: [{ ...mapsRow, payload: leak }, { ...organicRow, payload: leak }] }, { secrets: [KEY] });
    assert.ok(!JSON.stringify(v).includes(KEY));
  });
});

describe("loadRawView (with a fake sql)", () => {
  const fakeSql = (...results) => {
    const queue = [...results];
    return async () => queue.shift();
  };
  const business = { id: 1, name: "Zaitoon Restaurant" };
  const tracked = { queryId: 4, queryText: "restaurant near VIT Vellore", isDemo: false };

  test("unknown business", async () => {
    assert.deepEqual(await loadRawView(1, { sql: fakeSql([]), secrets: [] }), { kind: "no_business" });
  });

  test("a business tracked on no query", async () => {
    assert.deepEqual(await loadRawView(1, { sql: fakeSql([business], []), secrets: [] }), { kind: "untracked", business });
  });

  test("a query with no stored response at all", async () => {
    const out = await loadRawView(1, { sql: fakeSql([business], [tracked], []), secrets: [] });
    assert.deepEqual(out, { kind: "no_data", business, queryText: tracked.queryText });
  });

  test("both engines stored: both tabs are filled", async () => {
    const rows = [
      { id: 9, engine: "google_maps", payload: { local_results: [] }, checkedAt: "2026-10-07T12:00:00Z" },
      { id: 10, engine: "google", payload: { organic_results: [] }, checkedAt: "2026-10-07T12:00:01Z" },
    ];
    const out = await loadRawView(1, { sql: fakeSql([business], [tracked], rows), secrets: [] });
    assert.equal(out.kind, "ok");
    assert.deepEqual(out.view.tabs.map((t) => t.available), [true, true]);
  });

  test("only a maps response stored (the cron, or no place name): the Organic tab is empty, not an error", async () => {
    const out = await loadRawView(1, { sql: fakeSql([business], [tracked], [{ id: 9, engine: "google_maps", payload: {}, checkedAt: "2026-10-07T12:00:00Z" }]), secrets: [] });
    assert.equal(out.kind, "ok");
    assert.deepEqual(out.view.tabs.map((t) => t.available), [true, false]);
  });

  test("a key in a stored payload never reaches the view", async () => {
    const rows = [{ id: 9, engine: "google_maps", payload: { local_results: [], api_key: KEY }, checkedAt: "2026-10-07T12:00:00Z" }];
    const out = await loadRawView(1, { sql: fakeSql([business], [tracked], rows), secrets: [KEY] });
    assert.ok(!JSON.stringify(out.view).includes(KEY));
  });

  test("a demo query's view is marked as sample data", async () => {
    const out = await loadRawView(1, { sql: fakeSql([business], [{ ...tracked, isDemo: true }], [{ id: 1, engine: "google_maps", payload: {}, checkedAt: "2026-10-07T12:00:00Z" }]), secrets: [] });
    assert.equal(out.view.isDemo, true);
    assert.equal(out.view.notice, "Sample data, not a real SerpApi response.");
  });

  test("the raw-data query asks the database for both engines, newest of each", async () => {
    const seen = [];
    const sql = async (strings) => {
      seen.push(strings.join("?"));
      return [[business], [tracked], [{ id: 1, engine: "google_maps", payload: {}, checkedAt: "2026-10-07T12:00:00Z" }]][seen.length - 1];
    };
    await loadRawView(1, { sql, secrets: [] });
    const rawQuery = seen[2];
    assert.match(rawQuery, /DISTINCT ON \(engine\)/);
    assert.match(rawQuery, /engine IN \('google_maps', 'google'\)/);
    assert.match(rawQuery, /ORDER BY engine, checked_at DESC/);
  });
});
