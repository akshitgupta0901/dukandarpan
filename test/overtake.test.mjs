import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectOvertakes, MAX_OVERTAKE_ALERTS } from "../lib/overtake.mjs";

/** local_results from [title, place_id?] in rank order. */
const results = (...entries) => entries.map(([title, place_id], i) => ({ position: i + 1, title, ...(place_id ? { place_id } : {}) }));
const ME = "Brew & Bloom Cafe";
const names = (o) => o.map((x) => x.competitor);

describe("detectOvertakes: the basic case", () => {
  test("a competitor that was behind and is now ahead is reported with both ranks", () => {
    const before = results(["Alpha", "a"], ["Beta", "b"], [ME, "me"], ["Gamma", "g"]);
    const now = results(["Alpha", "a"], ["Beta", "b"], ["Gamma", "g"], [ME, "me"]);
    assert.deepEqual(detectOvertakes(before, now, ME), [
      { competitor: "Gamma", placeId: "g", previousPosition: 4, position: 3, yourPreviousPosition: 3, yourPosition: 4 },
    ]);
  });

  test("competitors that were already ahead are not reported", () => {
    const before = results(["Alpha", "a"], [ME, "me"], ["Gamma", "g"]);
    const now = results(["Alpha", "a"], ["Gamma", "g"], [ME, "me"]);
    assert.deepEqual(names(detectOvertakes(before, now, ME)), ["Gamma"]); // Alpha was ahead before and is not new news
  });

  test("the business improving (passing others) reports nothing", () => {
    const before = results(["Alpha", "a"], ["Beta", "b"], [ME, "me"]);
    const now = results([ME, "me"], ["Alpha", "a"], ["Beta", "b"]);
    assert.deepEqual(detectOvertakes(before, now, ME), []);
  });

  test("no change reports nothing", () => {
    const r = results(["Alpha", "a"], [ME, "me"], ["Gamma", "g"]);
    assert.deepEqual(detectOvertakes(r, r, ME), []);
  });

  test("a drop past several competitors reports each, closest first", () => {
    const before = results([ME, "me"], ["A", "a"], ["B", "b"], ["C", "c"]);
    const now = results(["A", "a"], ["B", "b"], ["C", "c"], [ME, "me"]);
    assert.deepEqual(names(detectOvertakes(before, now, ME, { limit: 10 })), ["A", "B", "C"]);
  });
});

describe("detectOvertakes: when there is nothing to compare", () => {
  const now = results(["Alpha", "a"], [ME, "me"]);

  test("a first-ever check (no previous response) produces none", () => {
    for (const none of [null, undefined, []]) assert.deepEqual(detectOvertakes(none, now, ME), []);
  });

  test("missing or empty current results produce none", () => {
    assert.deepEqual(detectOvertakes(now, null, ME), []);
    assert.deepEqual(detectOvertakes(now, [], ME), []);
  });

  test("a business that is not found now produces none, even if rivals moved", () => {
    const before = results(["Alpha", "a"], [ME, "me"], ["Gamma", "g"]);
    const after = results(["Alpha", "a"], ["Gamma", "g"], ["Delta", "d"]);
    assert.deepEqual(detectOvertakes(before, after, ME), []);
  });

  test("a business that was not found before produces none (everyone was already ahead)", () => {
    const before = results(["Alpha", "a"], ["Gamma", "g"]);
    assert.deepEqual(detectOvertakes(before, results(["Alpha", "a"], ["Gamma", "g"], [ME, "me"]), ME), []);
  });

  test("malformed entries are ignored without throwing", () => {
    const before = [null, { title: "no position" }, ...results([ME, "me"], ["Gamma", "g"])].map((r, i) => (r && r.position ? { ...r, position: r.position } : r));
    assert.doesNotThrow(() => detectOvertakes(before, [{}, ...results(["Gamma", "g"], [ME, "me"])], ME));
  });
});

describe("detectOvertakes: matching competitors across responses", () => {
  test("a renamed listing is still the same competitor when its place_id matches", () => {
    const before = results(["Latte Lane", "x1"], [ME, "me"]);
    const now = results(["Latte Lane Cafe & Bakery", "x1"], [ME, "me"]);
    assert.deepEqual(detectOvertakes(before, now, ME), []); // it was already ahead; the rename must not look like a new entrant
  });

  test("a renamed listing that overtakes is reported under its new name", () => {
    const before = results([ME, "me"], ["Old Name", "x1"]);
    const now = results(["New Name", "x1"], [ME, "me"]);
    const [o] = detectOvertakes(before, now, ME);
    assert.equal(o.competitor, "New Name");
    assert.equal(o.previousPosition, 2);
  });

  test("with no place_id on either side, the title is the fallback", () => {
    const before = results([ME], ["Gamma"]);
    const now = results(["Gamma"], [ME]);
    assert.deepEqual(names(detectOvertakes(before, now, ME)), ["Gamma"]);
    // ...and a title that was already ahead is recognised as such
    assert.deepEqual(detectOvertakes(results(["Gamma"], [ME]), results(["Gamma"], [ME]), ME), []);
  });

  test("title matching ignores case and punctuation", () => {
    const before = results(["Gamma Cafe!"], [ME]);
    const now = results(["gamma cafe"], [ME]);
    assert.deepEqual(detectOvertakes(before, now, ME), []);
  });

  test("two branches of one chain with different place ids are not confused", () => {
    const before = results([ME, "me"], ["The Kitchen", "k1"], ["The Kitchen", "k2"]);
    const now = results(["The Kitchen", "k2"], ["The Kitchen", "k1"], [ME, "me"]);
    const found = detectOvertakes(before, now, ME, { limit: 10 });
    assert.deepEqual(found.map((o) => [o.placeId, o.previousPosition]), [["k2", 3], ["k1", 2]]);
  });

  test("a competitor that was not in the previous top 20 counts as having been behind", () => {
    const before = results(["Alpha", "a"], [ME, "me"]);
    const now = results(["Alpha", "a"], ["Newcomer", "n"], [ME, "me"]);
    assert.deepEqual(detectOvertakes(before, now, ME), [
      { competitor: "Newcomer", placeId: "n", previousPosition: null, position: 2, yourPreviousPosition: 2, yourPosition: 3 },
    ]);
  });
});

describe("detectOvertakes: ties and limits", () => {
  test("a competitor tied with the business (same position) is not ahead of it", () => {
    const before = [{ position: 2, title: ME, place_id: "me" }, { position: 3, title: "Gamma", place_id: "g" }];
    const now = [{ position: 2, title: ME, place_id: "me" }, { position: 2, title: "Gamma", place_id: "g" }];
    assert.deepEqual(detectOvertakes(before, now, ME), []);
  });

  test("results given out of order are handled by position", () => {
    const before = [...results([ME, "me"], ["Gamma", "g"])].reverse();
    const now = [...results(["Gamma", "g"], [ME, "me"])].reverse();
    assert.deepEqual(names(detectOvertakes(before, now, ME)), ["Gamma"]);
  });

  test("capped at 2 by default, keeping the closest competitors", () => {
    assert.equal(MAX_OVERTAKE_ALERTS, 2);
    const before = results([ME, "me"], ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"]);
    const now = results(["D", "d"], ["C", "c"], ["B", "b"], ["A", "a"], [ME, "me"]);
    assert.deepEqual(names(detectOvertakes(before, now, ME)), ["D", "C"]);
  });

  test("the business's own listing is never reported as a competitor", () => {
    const before = results(["Alpha", "a"], [ME, "me"]);
    const now = results([ME, "me"], ["Alpha", "a"]);
    assert.ok(!names(detectOvertakes(before, now, ME)).includes(ME));
  });
});
