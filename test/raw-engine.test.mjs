import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextTabIndex } from "../lib/tabs.mjs";
import { FOCUSABLE_SELECTOR } from "../lib/focus-trap.mjs";
import { generateDemoData, HERO_NAME } from "../lib/demo-data.mjs";
import { matchOrganicRank } from "../lib/rank-matcher.mjs";
import { redactSecrets } from "../lib/redact.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(mjs|js|jsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

describe("every reader of raw_results picks an engine (the new organic rows must not leak into maps features)", () => {
  const files = [...sourceFiles("lib"), ...sourceFiles("app"), ...sourceFiles("scripts"), "db/seed-demo.mjs", "db/seed.mjs"];
  const reads = [];
  for (const file of files) {
    const text = read(file);
    for (const m of text.matchAll(/FROM raw_results/g)) {
      // the window covers the WHERE clause of this read (and the subselect inside it, if any)
      reads.push({ file, window: text.slice(m.index, m.index + 240) });
    }
  }

  test("there are readers to check (the scan itself works)", () => {
    const names = new Set(reads.map((r) => r.file));
    for (const expected of ["lib/competitors.mjs", "lib/benchmark-data.mjs", "lib/history-data.mjs", "lib/run-check.mjs", "lib/raw-data.mjs"]) {
      assert.ok(names.has(expected), `${expected} was not found reading raw_results`);
    }
    assert.ok(reads.length >= 7, `found only ${reads.length} reads`);
  });

  test("each read filters on engine", () => {
    for (const { file, window } of reads) {
      assert.match(window, /engine\s*(=|IN)\s*['(]/, `${file} reads raw_results without an engine filter:\n${window}`);
    }
  });

  test("every read that feeds a maps feature filters on 'google_maps' specifically", () => {
    for (const { file, window } of reads.filter((r) => r.file !== "lib/raw-data.mjs")) {
      assert.match(window, /engine = 'google_maps'/, `${file} must use only the maps payload`);
    }
  });

  test("the subselect in the review-growth query (max checked_at) is filtered too", () => {
    const text = read("lib/competitors.mjs");
    const sub = /SELECT max\(checked_at\) FROM raw_results WHERE query_id = \$\{queryId\} AND engine = 'google_maps'/;
    assert.match(text, sub);
  });

  test("the only code that WRITES raw_results is lib/raw-store.mjs and the demo seed, and both name the engine", () => {
    const writers = files.filter((f) => /INSERT INTO raw_results/.test(read(f)));
    assert.deepEqual(writers.sort(), ["db/seed-demo.mjs", "lib/raw-store.mjs"]);
    for (const f of writers) assert.match(read(f), /INSERT INTO raw_results \(query_id, engine, payload_json/);
  });

  test("lib/run-check.mjs saves through raw-store (no inline INSERT of its own)", () => {
    const text = read("lib/run-check.mjs");
    assert.match(text, /storeRawResults/);
    assert.doesNotMatch(text, /INSERT INTO raw_results/);
  });
});

describe("migration 0011", () => {
  const sql = read("db/migrations/0011_raw_results_engine.sql");
  const code = sql.split("\n").map((l) => (l.includes("--") ? l.slice(0, l.indexOf("--")) : l)).join("\n");

  test("adds raw_results.engine as TEXT NOT NULL DEFAULT 'google_maps', re-runnably", () => {
    assert.match(code, /ALTER TABLE raw_results ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'google_maps'/);
  });

  test("adds a supporting index, also re-runnably", () => {
    assert.match(code, /CREATE INDEX IF NOT EXISTS \S+ ON raw_results \(query_id, engine, checked_at DESC\)/);
  });

  test("is additive: nothing dropped, deleted, or rewritten", () => {
    assert.doesNotMatch(code, /\bDROP\b|\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
  });

  test("splits into exactly two statements the way db/migrate.mjs does", () => {
    assert.equal(code.split(";").map((s) => s.trim()).filter(Boolean).length, 2);
  });
});

describe("nextTabIndex", () => {
  test("ArrowRight / ArrowLeft move and wrap", () => {
    assert.equal(nextTabIndex(2, 0, "ArrowRight"), 1);
    assert.equal(nextTabIndex(2, 1, "ArrowRight"), 0);
    assert.equal(nextTabIndex(2, 0, "ArrowLeft"), 1);
    assert.equal(nextTabIndex(2, 1, "ArrowLeft"), 0);
  });

  test("Home and End jump to the ends", () => {
    assert.equal(nextTabIndex(3, 1, "Home"), 0);
    assert.equal(nextTabIndex(3, 0, "End"), 2);
  });

  test("other keys are not ours (null), so Tab and typing behave normally", () => {
    for (const key of ["Tab", "Enter", "a", " ", "ArrowDown", "Escape"]) assert.equal(nextTabIndex(2, 0, key), null);
  });

  test("a bad count or current index is handled", () => {
    assert.equal(nextTabIndex(0, 0, "ArrowRight"), null);
    assert.equal(nextTabIndex(NaN, 0, "ArrowRight"), null);
    assert.equal(nextTabIndex(2, -1, "ArrowRight"), 1);
    assert.equal(nextTabIndex(2, 99, "ArrowLeft"), 1);
  });
});

describe("the focus trap skips inactive tabs", () => {
  test("every focusable kind excludes tabindex=-1, so a roving-tabindex tab list has one Tab stop", () => {
    for (const kind of ["a[href]", "button:not([disabled])", "input:not([disabled])", "select:not([disabled])", "textarea:not([disabled])", "[tabindex]"]) {
      assert.ok(FOCUSABLE_SELECTOR.includes(`${kind}:not([tabindex="-1"])`), kind);
    }
  });
});

describe("demo data: the organic (engine google) payload", () => {
  const demo = generateDemoData({ endDate: "2026-10-07T12:00:00Z" });

  test("every day has a regular-results payload shaped like a real one", () => {
    for (const day of demo.days) {
      const p = day.organicPayload;
      assert.equal(p.search_parameters.engine, "google");
      assert.equal(p.search_parameters.q, demo.query.queryText);
      assert.equal(p.search_metadata.status, "Success");
      assert.equal(p.organic_results.length, 10);
      assert.deepEqual(p.organic_results.map((r) => r.position), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      for (const r of p.organic_results) {
        for (const f of ["position", "title", "link", "displayed_link", "snippet"]) assert.ok(r[f], `${f} missing`);
        assert.match(r.link, /^https:\/\/[a-z0-9.-]+\.example\//); // fictional, reserved domains only
      }
      assert.equal(p.is_demo_data, true);
    }
  });

  test("it agrees with the snapshots: the real organic matcher finds each tracked business at its stored organic position", () => {
    for (const day of demo.days) {
      for (const s of day.snapshots) {
        const found = matchOrganicRank(day.organicPayload, s.businessName);
        assert.equal(found.position, s.organicPosition ?? null, `${s.businessName} on day ${day.dayIndex}`);
      }
    }
  });

  test("the hero (no website) never appears in the regular results, as its Share of Voice says", () => {
    for (const day of demo.days) assert.equal(matchOrganicRank(day.organicPayload, HERO_NAME).found, false);
  });

  test("The Daily Grind (has a website) appears by its own site", () => {
    const day = demo.days[29];
    const r = matchOrganicRank(day.organicPayload, "The Daily Grind");
    assert.equal(r.found, true);
    assert.equal(r.matchedLink, "https://www.the-daily-grind.example/");
  });

  test("it is deterministic and carries no secrets", () => {
    assert.deepEqual(generateDemoData({ endDate: "2026-10-07T12:00:00Z" }).days[3].organicPayload, demo.days[3].organicPayload);
    assert.deepEqual(redactSecrets(demo.days[3].organicPayload, ["abcdef0123456789"]), demo.days[3].organicPayload);
  });

  test("the maps payload and the snapshots are unchanged by adding it", () => {
    assert.equal(demo.days[29].payload.search_parameters.engine, "google_maps");
    assert.equal(demo.days[29].payload.local_results.length, 20);
  });
});
