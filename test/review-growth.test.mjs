import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeReviewGrowth, describeGrowth, growthKey } from "../lib/review-growth.mjs";

const DAY = 24 * 3600 * 1000;
const T0 = Date.parse("2026-10-07T12:00:00Z");
const at = (daysAgo) => new Date(T0 - daysAgo * DAY).toISOString();
const snap = (daysAgo, ...listings) => ({ checkedAt: at(daysAgo), results: listings });
const L = (place_id, title, reviews, rating) => ({ place_id, title, reviews, rating });
const g = (map, id) => map.get(growthKey({ place_id: id }));

describe("computeReviewGrowth", () => {
  test("reviews gained and rating change since the earliest response in the week", () => {
    const map = computeReviewGrowth([
      snap(7, L("a", "Alpha", 100, 4.2)),
      snap(3, L("a", "Alpha", 108, 4.3)),
      snap(0, L("a", "Alpha", 112, 4.4)),
    ]);
    assert.deepEqual(g(map, "a"), { reviewsGained: 12, ratingChange: 0.2, since: at(7), days: 7 });
  });

  test("responses older than the 7-day window are ignored", () => {
    const map = computeReviewGrowth([snap(20, L("a", "Alpha", 10, 3.0)), snap(6, L("a", "Alpha", 100, 4.0)), snap(0, L("a", "Alpha", 105, 4.0))]);
    assert.equal(g(map, "a").reviewsGained, 5);
    assert.equal(g(map, "a").days, 6);
  });

  test("input order does not matter", () => {
    const history = [snap(0, L("a", "Alpha", 112, 4.4)), snap(7, L("a", "Alpha", 100, 4.2)), snap(3, L("a", "Alpha", 108, 4.3))];
    assert.equal(g(computeReviewGrowth(history), "a").reviewsGained, 12);
  });

  test("a competitor that first appears mid-week is measured from its first appearance", () => {
    const map = computeReviewGrowth([snap(7, L("a", "Alpha", 100, 4)), snap(2, L("a", "Alpha", 101, 4), L("n", "Newcomer", 50, 4.5)), snap(0, L("a", "Alpha", 102, 4), L("n", "Newcomer", 58, 4.6))]);
    assert.equal(g(map, "n").reviewsGained, 8);
    assert.equal(g(map, "n").days, 2);
  });

  test("a competitor seen only in the latest response has no growth figure (not a guessed zero)", () => {
    const map = computeReviewGrowth([snap(5, L("a", "Alpha", 100, 4)), snap(0, L("a", "Alpha", 103, 4), L("n", "Newcomer", 9, 4))]);
    assert.equal(g(map, "n"), undefined);
    assert.equal(g(map, "a").reviewsGained, 3);
  });

  test("fewer than two responses (or none in the window): empty", () => {
    assert.equal(computeReviewGrowth([]).size, 0);
    assert.equal(computeReviewGrowth(null).size, 0);
    assert.equal(computeReviewGrowth([snap(0, L("a", "Alpha", 1, 4))]).size, 0);
    assert.equal(computeReviewGrowth([snap(30, L("a", "Alpha", 1, 4)), snap(0, L("a", "Alpha", 5, 4))]).size, 0);
  });

  test("a loss of reviews is reported as a negative number", () => {
    const map = computeReviewGrowth([snap(4, L("a", "Alpha", 100, 4.5)), snap(0, L("a", "Alpha", 97, 4.4))]);
    assert.equal(g(map, "a").reviewsGained, -3);
    assert.equal(g(map, "a").ratingChange, -0.1);
  });

  test("rating changes are rounded to one decimal (no 0.30000000000000004)", () => {
    const map = computeReviewGrowth([snap(3, L("a", "Alpha", 1, 4.1)), snap(0, L("a", "Alpha", 1, 4.4))]);
    assert.equal(g(map, "a").ratingChange, 0.3);
  });

  test("missing numbers give null for that figure only", () => {
    const map = computeReviewGrowth([snap(3, L("a", "Alpha", undefined, 4.0)), snap(0, L("a", "Alpha", 20, 4.2))]);
    assert.equal(g(map, "a").reviewsGained, null);
    assert.equal(g(map, "a").ratingChange, 0.2);
  });

  test("listings without a place_id are matched by title, and renames with a place_id are not lost", () => {
    const byTitle = computeReviewGrowth([snap(3, { title: "Gamma Cafe!", reviews: 10, rating: 4 }), snap(0, { title: "gamma cafe", reviews: 14, rating: 4 })]);
    assert.equal(byTitle.get(growthKey({ title: "gamma cafe" })).reviewsGained, 4);
    const renamed = computeReviewGrowth([snap(3, L("r", "Old Name", 10, 4)), snap(0, L("r", "New Name", 15, 4))]);
    assert.equal(g(renamed, "r").reviewsGained, 5);
  });
});

describe("describeGrowth", () => {
  test("a week of growth reads naturally", () => {
    assert.deepEqual(describeGrowth({ reviewsGained: 12, ratingChange: 0.2, days: 7 }), ["gained 12 reviews this week", "rating up 0.2"]);
  });
  test("singular, shorter spans, and losses", () => {
    assert.deepEqual(describeGrowth({ reviewsGained: 1, ratingChange: null, days: 3 }), ["gained 1 review in 3 days"]);
    assert.deepEqual(describeGrowth({ reviewsGained: -2, ratingChange: -0.1, days: 7 }), ["lost 2 reviews this week", "rating down 0.1"]);
    assert.deepEqual(describeGrowth({ reviewsGained: 4, days: 1 }), ["gained 4 reviews in 1 day"]);
  });
  test("no data or no change: nothing to say", () => {
    assert.deepEqual(describeGrowth(null), []);
    assert.deepEqual(describeGrowth({ reviewsGained: 0, ratingChange: 0, days: 7 }), []);
    assert.deepEqual(describeGrowth({ reviewsGained: null, ratingChange: null, days: null }), []);
  });
});
