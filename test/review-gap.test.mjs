import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { reviewGap, describeReviewGap, formatSharePercent, ownReviewCount } from "../lib/review-gap.mjs";
import { generateDemoData, HERO_NAME } from "../lib/demo-data.mjs";

describe("reviewGap", () => {
  test("behind: the positive difference, and your reviews as a share of theirs", () => {
    assert.deepEqual(reviewGap(30, 543), { state: "behind", delta: 513, share: 30 / 543, percent: 6 });
    const g = reviewGap(250, 500);
    assert.deepEqual([g.state, g.delta, g.share, g.percent], ["behind", 250, 0.5, 50]);
  });

  test("ahead: a positive delta, with a full bar", () => {
    assert.deepEqual(reviewGap(600, 543), { state: "ahead", delta: 57, share: 1, percent: 100 });
    assert.deepEqual(reviewGap(5, 0), { state: "ahead", delta: 5, share: 1, percent: 100 });
  });

  test("equal: no delta, a full bar (but none when both have zero)", () => {
    assert.deepEqual(reviewGap(100, 100), { state: "equal", delta: 0, share: 1, percent: 100 });
    assert.deepEqual(reviewGap(0, 0), { state: "equal", delta: 0, share: null, percent: null });
  });

  test("you have none and they have some: behind by all of theirs, 0%", () => {
    assert.deepEqual(reviewGap(0, 40), { state: "behind", delta: 40, share: 0, percent: 0 });
  });

  test("missing or unusable counts are 'unknown', never a guess", () => {
    const unknown = { state: "unknown", delta: null, share: null, percent: null };
    for (const [own, theirs] of [[null, 543], [30, null], [undefined, 543], [30, undefined], [NaN, 5], [5, Infinity], ["30", 543], [30, "543"], [-1, 5], [5, -1], [null, null]]) {
      assert.deepEqual(reviewGap(own, theirs), unknown, `${own} vs ${theirs}`);
    }
  });

  test("the share never exceeds 100%, and rounds to a whole percent", () => {
    assert.equal(reviewGap(1, 3).percent, 33);
    assert.equal(reviewGap(2, 3).percent, 67);
    assert.ok(reviewGap(999, 1000).percent <= 100);
    assert.equal(reviewGap(10_000, 3).share, 1);
  });

  test("the delta is always positive and the pair is consistent", () => {
    for (const [a, b] of [[1, 2], [2, 1], [7, 7], [0, 9]]) {
      const g = reviewGap(a, b);
      assert.ok(g.delta >= 0);
      assert.equal(g.delta, Math.abs(a - b));
    }
  });
});

describe("describeReviewGap / formatSharePercent", () => {
  test("the phrases", () => {
    assert.equal(describeReviewGap(reviewGap(131, 543)), "you are behind by 412");
    assert.equal(describeReviewGap(reviewGap(600, 543)), "you are ahead by 57");
    assert.equal(describeReviewGap(reviewGap(9, 9)), "you have the same number of reviews");
    assert.equal(describeReviewGap(reviewGap(null, 9)), null);
  });

  test("numbers can be formatted by the caller (thousands separators)", () => {
    assert.equal(describeReviewGap(reviewGap(10, 2500), (n) => n.toLocaleString("en-US")), "you are behind by 2,490");
  });

  test("the percent label: whole percent, '<1%' when tiny but not zero, nothing when meaningless", () => {
    assert.equal(formatSharePercent(reviewGap(30, 543), 30), "6%");
    assert.equal(formatSharePercent(reviewGap(1, 5000), 1), "<1%");
    assert.equal(formatSharePercent(reviewGap(0, 40), 0), "0%");
    assert.equal(formatSharePercent(reviewGap(600, 543), 600), "100%");
    assert.equal(formatSharePercent(reviewGap(0, 0), 0), null);
    assert.equal(formatSharePercent(reviewGap(null, 5), null), null);
  });
});

describe("ownReviewCount", () => {
  const results = [
    { position: 1, title: "Mocha Meadow Cafe", reviews: 543 },
    { position: 2, title: "Brew & Bloom Cafe", reviews: 30 },
    { position: 3, title: "No Count Cafe" },
  ];

  test("the business's own review count from the same response", () => {
    assert.equal(ownReviewCount(results, "Brew & Bloom Cafe"), 30);
  });

  test("not in the results, or listed without a count: null", () => {
    assert.equal(ownReviewCount(results, "Nobody Here"), null);
    assert.equal(ownReviewCount(results, "No Count Cafe"), null);
    assert.equal(ownReviewCount([{ position: 1, title: "X Cafe", reviews: "12" }], "X Cafe"), null);
  });

  test("missing or malformed results are safe", () => {
    for (const bad of [undefined, null, [], "x", [null, 5, {}]]) assert.equal(ownReviewCount(bad, "Brew & Bloom Cafe"), null);
  });

  test("the demo hero: 30 reviews at the latest check, far behind the leader", () => {
    const demo = generateDemoData({ endDate: "2026-10-07T12:00:00Z" });
    const last = demo.days[29].payload.local_results;
    assert.equal(ownReviewCount(last, HERO_NAME), 30);
    const leader = last.find((r) => r.position === 1);
    const g = reviewGap(30, leader.reviews);
    assert.equal(g.state, "behind");
    assert.equal(g.delta, leader.reviews - 30);
    assert.ok(g.percent < 10);
  });
});
