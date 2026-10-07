import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { detectOvertakes, MAX_OVERTAKE_ALERTS, OVERTAKE_MAX_POSITION } from "../lib/overtake.mjs";

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

describe("detectOvertakes: only when the business's NEW position is #10 or better", () => {
  // `filler(n)` is n unrelated listings; the business and one rival then sit at positions n+1 and n+2.
  const filler = (n) => Array.from({ length: n }, (_, i) => [`Filler ${i + 1}`, `f${i + 1}`]);
  /** Business at position `mine`, rival right behind; then the two swap. */
  const swap = (mine) => ({
    before: results(...filler(mine - 1), [ME, "me"], ["Rival", "r"]),
    now: results(...filler(mine - 1), ["Rival", "r"], [ME, "me"]),
  });

  test("the cutoff is a named constant, #10", () => {
    assert.equal(OVERTAKE_MAX_POSITION, 10);
  });

  test("new position exactly 10: fires", () => {
    const { before, now } = swap(9); // business #9 -> #10
    const found = detectOvertakes(before, now, ME);
    assert.equal(found.length, 1);
    assert.equal(found[0].yourPosition, OVERTAKE_MAX_POSITION);
    assert.equal(found[0].competitor, "Rival");
  });

  test("new position 11: does not fire, even though a rival really did pass the business", () => {
    const { before, now } = swap(10); // business #10 -> #11
    assert.deepEqual(detectOvertakes(before, now, ME), []);
  });

  test("further down (#15 -> #16, or #19 -> #20): does not fire", () => {
    for (const mine of [15, 19]) {
      const { before, now } = swap(mine);
      assert.deepEqual(detectOvertakes(before, now, ME), [], `#${mine}`);
    }
  });

  test("a big drop that ends past #10 does not fire, but one that ends at #10 does", () => {
    const before = results(...filler(4), [ME, "me"], ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"]); // ME #5
    const endsAt10 = results(...filler(4), ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"], [ME, "me"]); // ME #10
    const endsAt11 = results(...filler(4), ["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"], ["Z", "z"], [ME, "me"]); // ME #11
    assert.equal(detectOvertakes(before, endsAt10, ME).length, MAX_OVERTAKE_ALERTS);
    assert.deepEqual(detectOvertakes(before, endsAt11, ME), []);
  });

  test("a business that is not found now does not fire (regardless of the cutoff)", () => {
    const before = results(...filler(3), [ME, "me"], ["Rival", "r"]);
    const gone = results(...filler(3), ["Rival", "r"], ["Other", "o"]);
    assert.deepEqual(detectOvertakes(before, gone, ME), []);
  });

  test("the cutoff applies to where the business is NOW, not where it was: climbing into the top 10 from lower still needs a real overtake", () => {
    // ME rises from #15 to #8 and nobody that was behind it passes it
    const before = results(...filler(14), [ME, "me"]);
    const now = results(...filler(7), [ME, "me"], ...filler(7).map(([t, id]) => [`${t}b`, `${id}b`]));
    assert.deepEqual(detectOvertakes(before, now, ME), []);
  });
});
