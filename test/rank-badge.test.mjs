import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rankBadge, mapRankBadge, organicRankBadge, TONES } from "../lib/rank-badge.mjs";

describe("rankBadge: the tone for each rank", () => {
  test("#1 is gold with a trophy", () => {
    assert.deepEqual(rankBadge({ position: 1 }), { tone: "gold", label: "#1", icon: "🏆" });
  });

  test("#2 and #3 are green with a trophy", () => {
    for (const p of [2, 3]) assert.deepEqual(rankBadge({ position: p }), { tone: "green", label: `#${p}`, icon: "🏆" });
  });

  test("#4 to #10 are amber, with no icon", () => {
    for (const p of [4, 5, 7, 10]) assert.deepEqual(rankBadge({ position: p }), { tone: "amber", label: `#${p}`, icon: null });
  });

  test("#11 to #20 are neutral, with no icon", () => {
    for (const p of [11, 15, 20]) assert.deepEqual(rankBadge({ position: p }), { tone: "neutral", label: `#${p}`, icon: null });
  });

  test("the boundaries: 3|4, 10|11, 20|21", () => {
    assert.equal(rankBadge({ position: 3 }).tone, "green");
    assert.equal(rankBadge({ position: 4 }).tone, "amber");
    assert.equal(rankBadge({ position: 10 }).tone, "amber");
    assert.equal(rankBadge({ position: 11 }).tone, "neutral");
    assert.equal(rankBadge({ position: 20 }).tone, "neutral");
    assert.equal(rankBadge({ position: 21 }).tone, "crimson");
  });
});

describe("rankBadge: not ranking", () => {
  test("on the map: crimson with a warning icon and 'Not in top 20'", () => {
    assert.deepEqual(rankBadge({ position: null }), { tone: "crimson", label: "Not in top 20", icon: "⚠️" });
    assert.deepEqual(rankBadge({}), { tone: "crimson", label: "Not in top 20", icon: "⚠️" });
  });

  test("in regular results: 'Not ranking organically'", () => {
    assert.deepEqual(rankBadge({ position: null, kind: "organic" }), { tone: "crimson", label: "Not ranking organically", icon: "⚠️" });
  });

  test("invalid ranks count as not ranking, never as a made-up number", () => {
    for (const bad of [0, -3, 2.5, NaN, Infinity, "3", undefined, null, 99]) {
      assert.equal(rankBadge({ position: bad }).tone, "crimson", String(bad));
      assert.match(rankBadge({ position: bad }).label, /^Not in top 20$/);
    }
  });
});

describe("rankBadge: never checked", () => {
  test("is muted and claims nothing", () => {
    assert.deepEqual(rankBadge({ checked: false }), { tone: "muted", label: "Not checked yet", icon: null });
    assert.deepEqual(rankBadge({ checked: false, position: 3 }), { tone: "muted", label: "Not checked yet", icon: null });
  });
});

describe("colour is never the only signal", () => {
  test("every badge has a non-empty text label, and the tone is one of the known tones", () => {
    const inputs = [{}, { position: 1 }, { position: 2 }, { position: 5 }, { position: 12 }, { position: 25 }, { checked: false }, { kind: "organic" }, { position: 4, kind: "organic" }];
    for (const input of inputs) {
      const b = rankBadge(input);
      assert.ok(typeof b.label === "string" && b.label.trim().length > 0);
      assert.ok(TONES.includes(b.tone));
    }
  });

  test("the only icons are the trophy (top 3) and the warning (not ranking)", () => {
    const icons = new Set();
    for (let p = 0; p <= 25; p++) icons.add(rankBadge({ position: p }).icon);
    assert.deepEqual([...icons].sort(), [null, "⚠️", "🏆"].sort());
  });

  test("a trophy always sits next to a rank label, a warning next to a 'not' label", () => {
    for (let p = 0; p <= 25; p++) {
      const b = rankBadge({ position: p });
      if (b.icon === "🏆") assert.match(b.label, /^#[123]$/);
      if (b.icon === "⚠️") assert.match(b.label, /^Not /);
    }
  });
});

describe("mapRankBadge / organicRankBadge", () => {
  test("map: found, not found and never checked", () => {
    assert.equal(mapRankBadge({ found: true, position: 3 }).label, "#3");
    assert.equal(mapRankBadge({ found: true, position: 3 }).tone, "green");
    assert.equal(mapRankBadge({ found: false, position: null }).label, "Not in top 20");
    assert.equal(mapRankBadge({ found: null, position: null }).label, "Not checked yet");
    assert.equal(mapRankBadge({ found: undefined }).tone, "muted");
  });

  test("a found=false business is crimson even if a stale position is passed along", () => {
    assert.equal(mapRankBadge({ found: false, position: 2 }).tone, "crimson");
  });

  test("organic: ranked, not ranking, and never looked up", () => {
    assert.deepEqual(organicRankBadge({ checked: true, position: 3 }), { tone: "green", label: "#3", icon: "🏆" });
    assert.equal(organicRankBadge({ checked: true, position: null }).label, "Not ranking organically");
    assert.equal(organicRankBadge({ checked: false, position: null }).label, "Not checked yet");
    assert.equal(organicRankBadge({ checked: false, position: 4 }).tone, "muted");
    assert.equal(organicRankBadge({}).tone, "muted");
  });
});
