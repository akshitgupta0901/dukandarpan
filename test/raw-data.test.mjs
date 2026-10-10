import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactSecrets, buildRawView, loadRawView, REDACTED } from "../lib/raw-data.mjs";
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

describe("buildRawView", () => {
  const row = { id: 7, payload: cafe, checkedAt: "2026-10-07T12:00:00.000Z" };
  const business = { id: 10, name: "Café Laylat" };

  test("carries the payload, when it was fetched, the engine and the query text", () => {
    const v = buildRawView({ business, queryText: "cafe near VIT Vellore", isDemo: false, row });
    assert.equal(v.engine, "google_maps");
    assert.equal(v.checkedAt, "2026-10-07T12:00:00.000Z");
    assert.equal(v.queryText, "cafe near VIT Vellore");
    assert.equal(v.rawResultId, 7);
    assert.equal(v.isDemo, false);
    assert.deepEqual(v.payload, cafe);
    assert.match(v.note, /organic.*not stored/i);
  });

  test("a demo query is flagged and labeled as sample data", () => {
    const v = buildRawView({ business, queryText: "q", isDemo: true, row });
    assert.equal(v.isDemo, true);
    assert.match(v.note, /Sample data, not a real SerpApi response/);
  });

  test("the engine comes from the stored search_parameters, defaulting to google_maps", () => {
    assert.equal(buildRawView({ business, queryText: "q", isDemo: false, row: { ...row, payload: { search_parameters: { engine: "google" } } } }).engine, "google");
    assert.equal(buildRawView({ business, queryText: "q", isDemo: false, row: { ...row, payload: {} } }).engine, "google_maps");
  });

  test("a Date checkedAt (what the database driver may return) becomes an ISO string", () => {
    const v = buildRawView({ business, queryText: "q", isDemo: false, row: { ...row, checkedAt: new Date("2026-10-07T12:00:00Z") } });
    assert.equal(v.checkedAt, "2026-10-07T12:00:00.000Z");
  });

  test("a key hiding in the payload is removed from the view", () => {
    const payload = { search_parameters: { engine: "google_maps", api_key: KEY }, link: `https://serpapi.com/x?api_key=${KEY}`, text: `oops ${KEY}` };
    const v = buildRawView({ business, queryText: "q", isDemo: false, row: { ...row, payload } }, { secrets: [KEY] });
    assert.ok(!JSON.stringify(v).includes(KEY));
  });
});

describe("loadRawView (with a fake sql)", () => {
  const fakeSql = (...results) => {
    const queue = [...results];
    return async () => queue.shift();
  };
  const business = { id: 1, name: "Zaitoon Restaurant" };

  test("unknown business", async () => {
    assert.deepEqual(await loadRawView(1, { sql: fakeSql([]), secrets: [] }), { kind: "no_business" });
  });

  test("a business tracked on no query", async () => {
    assert.deepEqual(await loadRawView(1, { sql: fakeSql([business], []), secrets: [] }), { kind: "untracked", business });
  });

  test("a query with no stored response yet", async () => {
    const out = await loadRawView(1, { sql: fakeSql([business], [{ queryId: 4, queryText: "q", isDemo: false }], []), secrets: [] });
    assert.deepEqual(out, { kind: "no_data", business, queryText: "q" });
  });

  test("the latest stored response is returned as a safe view", async () => {
    const out = await loadRawView(1, {
      sql: fakeSql([business], [{ queryId: 4, queryText: "restaurant near VIT Vellore", isDemo: false }], [{ id: 9, payload: { local_results: [], api_key: KEY }, checkedAt: "2026-10-07T12:00:00Z" }]),
      secrets: [KEY],
    });
    assert.equal(out.kind, "ok");
    assert.equal(out.view.queryText, "restaurant near VIT Vellore");
    assert.equal(out.view.rawResultId, 9);
    assert.ok(!JSON.stringify(out.view).includes(KEY));
  });

  test("a demo query's view is marked as sample data", async () => {
    const out = await loadRawView(1, { sql: fakeSql([business], [{ queryId: 4, queryText: "q (demo)", isDemo: true }], [{ id: 1, payload: {}, checkedAt: "2026-10-07T12:00:00Z" }]), secrets: [] });
    assert.equal(out.view.isDemo, true);
  });
});
