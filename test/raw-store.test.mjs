import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { storeRawResults, ENGINE_MAPS, ENGINE_ORGANIC } from "../lib/raw-store.mjs";
import { redactSecrets, REDACTED } from "../lib/redact.mjs";
import { redactSecrets as redactViaRawData } from "../lib/raw-data.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const maps = JSON.parse(fs.readFileSync(path.join(FIXTURES, "maps_cafe.json"), "utf8"));
const organic = JSON.parse(fs.readFileSync(path.join(FIXTURES, "organic_cafe.json"), "utf8"));
const KEY = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

/** A fake tagged-template sql that records every INSERT and can be told to fail on the Nth. */
function fakeSql({ failOn = [] } = {}) {
  const calls = [];
  const sql = async (strings, ...values) => {
    const n = calls.length + 1;
    calls.push({ text: strings.join("?"), values });
    if (failOn.includes(n)) throw new Error(`insert #${n} failed`);
    return [{ id: 100 + n, checked_at: "2026-10-07T12:00:00Z" }];
  };
  return { sql, calls };
}

describe("storeRawResults", () => {
  test("maps only (the cron, or a query with no place name): ONE row, engine google_maps", async () => {
    const { sql, calls } = fakeSql();
    const out = await storeRawResults({ queryId: 4, mapsJson: maps, organicJson: null }, { sql, secrets: [], warn: () => {} });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].values.slice(0, 2), [4, "google_maps"]);
    assert.deepEqual(out, { mapsRow: { id: 101, checked_at: "2026-10-07T12:00:00Z" }, organicStored: false });
  });

  test("maps + organic: TWO rows, maps first (engine google_maps) then organic (engine google)", async () => {
    const { sql, calls } = fakeSql();
    const out = await storeRawResults({ queryId: 4, mapsJson: maps, organicJson: organic }, { sql, secrets: [], warn: () => {} });
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].values.slice(0, 2), [4, ENGINE_MAPS]);
    assert.deepEqual(calls[1].values.slice(0, 2), [4, ENGINE_ORGANIC]);
    assert.equal(ENGINE_MAPS, "google_maps");
    assert.equal(ENGINE_ORGANIC, "google");
    assert.deepEqual(JSON.parse(calls[0].values[2]), maps);
    assert.deepEqual(JSON.parse(calls[1].values[2]), organic);
    assert.equal(out.organicStored, true);
  });

  test("the returned row is the MAPS row (its id and checked_at identify the check)", async () => {
    const { sql } = fakeSql();
    const out = await storeRawResults({ queryId: 4, mapsJson: maps, organicJson: organic }, { sql, secrets: [], warn: () => {} });
    assert.equal(out.mapsRow.id, 101);
  });

  test("the insert names the engine column and casts the payload to jsonb", async () => {
    const { sql, calls } = fakeSql();
    await storeRawResults({ queryId: 4, mapsJson: maps, organicJson: null }, { sql, secrets: [], warn: () => {} });
    assert.match(calls[0].text, /INSERT INTO raw_results \(query_id, engine, payload_json\)/);
    assert.match(calls[0].text, /::jsonb/);
    assert.match(calls[0].text, /RETURNING id, checked_at/);
  });

  test("a failing ORGANIC insert is non-fatal: the maps row is kept, the check carries on, the problem is logged", async () => {
    const { sql } = fakeSql({ failOn: [2] });
    const warnings = [];
    const out = await storeRawResults({ queryId: 4, mapsJson: maps, organicJson: organic }, { sql, secrets: [], warn: (m) => warnings.push(m) });
    assert.equal(out.mapsRow.id, 101);
    assert.equal(out.organicStored, false);
    assert.match(warnings[0], /couldn't save the organic response for query 4/);
  });

  test("a failing MAPS insert still fails the check (maps is the core), and no organic row is attempted", async () => {
    const { sql, calls } = fakeSql({ failOn: [1] });
    await assert.rejects(storeRawResults({ queryId: 4, mapsJson: maps, organicJson: organic }, { sql, secrets: [], warn: () => {} }), /insert #1 failed/);
    assert.equal(calls.length, 1);
  });

  test("a key is removed from BOTH payloads before they are saved", async () => {
    const { sql, calls } = fakeSql();
    const leakyMaps = { ...maps, search_parameters: { ...maps.search_parameters, api_key: KEY }, next: `https://serpapi.com/x?api_key=${KEY}` };
    const leakyOrganic = { ...organic, search_parameters: { ...organic.search_parameters, api_key: KEY }, note: `key ${KEY}` };
    await storeRawResults({ queryId: 4, mapsJson: leakyMaps, organicJson: leakyOrganic }, { sql, secrets: [KEY], warn: () => {} });
    for (const call of calls) assert.ok(!call.values[2].includes(KEY), "a stored payload still contains the key");
    assert.ok(calls[1].values[2].includes(REDACTED) || !calls[1].values[2].includes("api_key"));
  });

  test("real responses are saved unchanged (redaction only touches secrets)", async () => {
    const { sql, calls } = fakeSql();
    await storeRawResults({ queryId: 4, mapsJson: maps, organicJson: organic }, { sql, secrets: [KEY], warn: () => {} });
    assert.deepEqual(JSON.parse(calls[0].values[2]), maps);
    assert.deepEqual(JSON.parse(calls[1].values[2]), organic);
  });

  test("redactSecrets is one function, shared by saving (lib/redact.mjs) and showing (lib/raw-data.mjs)", () => {
    assert.equal(redactViaRawData, redactSecrets);
  });
});
