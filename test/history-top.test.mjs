import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { topCompetitorAt, matchRawToCheck, attachTopCompetitors, chartPoints, describeCheck, RAW_MATCH_TOLERANCE_MS } from "../lib/history-top.mjs";
import { loadTopResultsHistory } from "../lib/history-data.mjs";
import { generateDemoData, HERO_NAME } from "../lib/demo-data.mjs";

const ME = "Brew & Bloom Cafe";
const list = (...titles) => titles.map((title, i) => ({ position: i + 1, title }));
const MIN = 60 * 1000;
const T = Date.parse("2026-10-07T12:00:00Z");
const at = (ms) => new Date(T + ms).toISOString();

describe("topCompetitorAt", () => {
  test("the best-ranked listing that is not the business", () => {
    assert.deepEqual(topCompetitorAt(list("Mocha Meadow", "Kettle", ME), ME), { name: "Mocha Meadow", position: 1, ownIsFirst: false });
  });

  test("the business is #1: the NEXT-BEST listing is shown, flagged as the runner-up", () => {
    assert.deepEqual(topCompetitorAt(list(ME, "Kettle", "Latte"), ME), { name: "Kettle", position: 2, ownIsFirst: true });
  });

  test("the business is #2: the #1 listing is the top competitor", () => {
    assert.deepEqual(topCompetitorAt(list("Mocha", ME, "Kettle"), ME), { name: "Mocha", position: 1, ownIsFirst: false });
  });

  test("the business is not in the results: the #1 listing, not flagged", () => {
    assert.deepEqual(topCompetitorAt(list("Mocha", "Kettle", "Latte"), "Nobody"), { name: "Mocha", position: 1, ownIsFirst: false });
  });

  test("results out of order are ranked by position", () => {
    const shuffled = [{ position: 3, title: "C" }, { position: 1, title: "A" }, { position: 2, title: "B" }];
    assert.equal(topCompetitorAt(shuffled, ME).name, "A");
  });

  test("a response cut down to the top 3 (as stored in the history query) still works", () => {
    assert.equal(topCompetitorAt(list("A", "B", "C"), "Beyond Top Three").name, "A");
  });

  test("nothing to compare with: null (the business is the only listing, or the list is empty or malformed)", () => {
    assert.equal(topCompetitorAt(list(ME), ME), null);
    for (const bad of [[], null, undefined, "x", [null, {}, { title: "no position" }, { position: 1 }]]) assert.equal(topCompetitorAt(bad, ME), null);
  });

  test("a renamed or noisy title for the business is still recognised (same matching as ranks)", () => {
    assert.equal(topCompetitorAt(list("Mocha", "Brew & Bloom Cafe, Katpadi"), ME).position, 1);
  });
});

describe("matchRawToCheck", () => {
  const rows = [
    { checkedAt: at(-24 * 60 * MIN), results: "day-1" },
    { checkedAt: at(-2000), results: "today" },
    { checkedAt: at(24 * 60 * MIN), results: "day+1" },
  ];

  test("picks the stored response nearest in time (a snapshot lands moments after its raw response)", () => {
    assert.equal(matchRawToCheck(rows, at(0)).results, "today");
    assert.equal(matchRawToCheck(rows, at(24 * 60 * MIN + 3000)).results, "day+1");
  });

  test("a response too far away is not used", () => {
    assert.equal(matchRawToCheck(rows, at(12 * 60 * MIN)), null);
    assert.equal(matchRawToCheck(rows, at(RAW_MATCH_TOLERANCE_MS + 5 * 60 * MIN)), null);
  });

  test("the tolerance edge: exactly at it matches, just past it does not", () => {
    const one = [{ checkedAt: at(0), results: "r" }];
    assert.ok(matchRawToCheck(one, at(RAW_MATCH_TOLERANCE_MS)));
    assert.equal(matchRawToCheck(one, at(RAW_MATCH_TOLERANCE_MS + 1)), null);
  });

  test("Date objects, no rows and an invalid time are all safe", () => {
    assert.ok(matchRawToCheck([{ checkedAt: new Date(T), results: 1 }], new Date(T)));
    assert.equal(matchRawToCheck([], at(0)), null);
    assert.equal(matchRawToCheck(null, at(0)), null);
    assert.equal(matchRawToCheck(rows, "not a date"), null);
  });
});

describe("attachTopCompetitors", () => {
  const rows = [
    { checkedAt: at(-60 * MIN * 24), results: list("Mocha", "Kettle", ME) },
    { checkedAt: at(0), results: list(ME, "Kettle", "Latte") },
  ];
  const history = [
    { checkedAt: at(-60 * MIN * 24 + 2000), position: 3 },
    { checkedAt: at(1500), position: 1 },
    { checkedAt: at(60 * MIN * 24 * 5), position: null }, // no stored response near this check
  ];

  test("each check gets the top competitor from ITS OWN stored response (it can change between checks)", () => {
    const out = attachTopCompetitors(history, rows, ME);
    assert.deepEqual(out[0].topCompetitor, { name: "Mocha", position: 1, ownIsFirst: false });
    assert.deepEqual(out[1].topCompetitor, { name: "Kettle", position: 2, ownIsFirst: true });
  });

  test("a check with no stored response has a null competitor (a gap), and keeps its own fields", () => {
    const out = attachTopCompetitors(history, rows, ME);
    assert.equal(out[2].topCompetitor, null);
    assert.equal(out[2].position, null);
    assert.equal(out[0].position, 3);
    assert.equal(out[0].checkedAt, history[0].checkedAt);
  });

  test("no stored responses at all, or no history: still well-formed", () => {
    assert.ok(attachTopCompetitors(history, [], ME).every((p) => p.topCompetitor === null));
    assert.deepEqual(attachTopCompetitors([], rows, ME), []);
    assert.deepEqual(attachTopCompetitors(undefined, rows, ME), []);
  });

  test("the input history is not modified", () => {
    const copy = JSON.parse(JSON.stringify(history));
    attachTopCompetitors(history, rows, ME);
    assert.deepEqual(history, copy);
  });

  test("the demo data: the hero's top competitor is a different business at different checks, and is never the hero", () => {
    const demo = generateDemoData({ endDate: "2026-10-07T12:00:00Z" });
    const history = demo.days.map((d) => ({ checkedAt: d.checkedAt, position: d.ranking.indexOf(HERO_NAME) + 1 }));
    const raw = demo.days.map((d) => ({ checkedAt: d.checkedAt, results: d.payload.local_results.slice(0, 3) }));
    const out = attachTopCompetitors(history, raw, HERO_NAME);
    assert.ok(out.every((p) => p.topCompetitor && p.topCompetitor.name !== HERO_NAME));
    assert.ok(new Set(out.map((p) => p.topCompetitor.name)).size > 1, "the leader changes over the month");
    // the hero never reaches #1 in the demo, so the line is the real #1 each time
    assert.ok(out.every((p) => p.topCompetitor.position === 1 && !p.topCompetitor.ownIsFirst));
  });
});

describe("chartPoints", () => {
  test("two series as numbers, nulls for gaps, and the tooltip fields", () => {
    const pts = chartPoints([
      { checkedAt: "a", position: 4, topCompetitor: { name: "X", position: 1, ownIsFirst: false } },
      { checkedAt: "b", position: null, topCompetitor: null },
      { checkedAt: "c", position: 1, topCompetitor: { name: "Y", position: 2, ownIsFirst: true } },
    ]);
    assert.deepEqual(pts, [
      { checkedAt: "a", position: 4, topPosition: 1, topName: "X", ownIsFirst: false },
      { checkedAt: "b", position: null, topPosition: null, topName: null, ownIsFirst: false },
      { checkedAt: "c", position: 1, topPosition: 2, topName: "Y", ownIsFirst: true },
    ]);
  });

  test("history from an older API (no topCompetitor field) still works", () => {
    assert.deepEqual(chartPoints([{ checkedAt: "a", position: 3 }]), [{ checkedAt: "a", position: 3, topPosition: null, topName: null, ownIsFirst: false }]);
    assert.deepEqual(chartPoints(undefined), []);
  });
});

describe("describeCheck (the tooltip sentence)", () => {
  test("rank and who was on top", () => {
    assert.equal(describeCheck({ label: "Oct 7", position: 4, topName: "Mocha Meadow Cafe", topPosition: 1 }), "Oct 7: Rank #4. Mocha Meadow Cafe was #1.");
  });

  test("not in the top 20 keeps its wording, and still says who was on top", () => {
    assert.equal(describeCheck({ label: "Oct 7", position: null, topName: "Mocha", topPosition: 1 }), "Oct 7: Not in top 20. Mocha was #1.");
  });

  test("the business is #1: the runner-up is worded as 'Next best'", () => {
    assert.equal(describeCheck({ label: "Oct 7", position: 1, topName: "Kettle", topPosition: 2, ownIsFirst: true }), "Oct 7: Rank #1. Next best: Kettle (#2).");
  });

  test("no competitor data for that check: just the rank", () => {
    assert.equal(describeCheck({ label: "Oct 7", position: 4 }), "Oct 7: Rank #4.");
    assert.equal(describeCheck({ label: "Oct 7", position: null, topName: null, topPosition: null }), "Oct 7: Not in top 20.");
    assert.equal(describeCheck({ label: "Oct 7, 1:10 PM", position: 2, topName: "X" }), "Oct 7, 1:10 PM: Rank #2.");
  });
});

describe("loadTopResultsHistory (with a fake sql)", () => {
  test("untracked business: no rows, and no second query", async () => {
    let calls = 0;
    const out = await loadTopResultsHistory(1, { sql: async () => (calls++, []) });
    assert.deepEqual(out, []);
    assert.equal(calls, 1);
  });

  test("returns the stored responses' tops for the tracked query", async () => {
    const queue = [[{ queryId: 4 }], [{ checkedAt: "2026-10-07T12:00:00Z", results: [{ position: 1, title: "A" }] }]];
    const out = await loadTopResultsHistory(1, { sql: async () => queue.shift() });
    assert.equal(out.length, 1);
    assert.equal(out[0].results[0].title, "A");
  });
});
