import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateAlert, formatOvertakeMessage, formatTelegramText, escapeTelegramMarkdown } from "../lib/alert-rule.mjs";

describe("evaluateAlert (pure rule, zero I/O)", () => {
  test("first-ever check (previousFound: null) never alerts, even when not_found", () => {
    assert.equal(evaluateAlert({ previousFound: null, previousPosition: null, found: false, position: null }), null);
  });

  test("first-ever check (previousFound: null) never alerts, even when found", () => {
    assert.equal(evaluateAlert({ previousFound: null, previousPosition: null, found: true, position: 5 }), null);
  });

  test("first-ever check (previousFound: undefined) never alerts either", () => {
    assert.equal(evaluateAlert({ previousFound: undefined, previousPosition: undefined, found: false, position: null }), null);
  });

  test("found -> not_found fires 'fell_out'", () => {
    const alert = evaluateAlert({ previousFound: true, previousPosition: 4, found: false, position: null });
    assert.equal(alert.type, "fell_out");
    assert.match(alert.message, /fell out/);
    assert.match(alert.message, /#4/);
  });

  test("not_found -> not_found does NOT re-fire (already-down business, subsequent check)", () => {
    assert.equal(evaluateAlert({ previousFound: false, previousPosition: null, found: false, position: null }), null);
  });

  test("not_found -> found is a recovery, not an alert", () => {
    assert.equal(evaluateAlert({ previousFound: false, previousPosition: null, found: true, position: 6 }), null);
  });

  test("found -> found, drop of exactly 3 fires 'rank_drop' (threshold is inclusive)", () => {
    const alert = evaluateAlert({ previousFound: true, previousPosition: 2, found: true, position: 5 });
    assert.equal(alert.type, "rank_drop");
    assert.match(alert.message, /#2 to #5/);
  });

  test("found -> found, drop of more than 3 fires 'rank_drop'", () => {
    const alert = evaluateAlert({ previousFound: true, previousPosition: 1, found: true, position: 9 });
    assert.equal(alert.type, "rank_drop");
  });

  test("found -> found, drop of 2 does NOT fire (below threshold)", () => {
    assert.equal(evaluateAlert({ previousFound: true, previousPosition: 3, found: true, position: 5 }), null);
  });

  test("found -> found, no change does NOT fire", () => {
    assert.equal(evaluateAlert({ previousFound: true, previousPosition: 3, found: true, position: 3 }), null);
  });

  test("found -> found, IMPROVED position does NOT fire (rank got better, not worse)", () => {
    assert.equal(evaluateAlert({ previousFound: true, previousPosition: 8, found: true, position: 1 }), null);
  });

  test("repeated identical not_found across 3 consecutive comparisons only ever returns null (no re-alert)", () => {
    // Simulates: found(2) -> not_found -> not_found -> not_found, comparing
    // only adjacent pairs each time, the way checkAndSendAlerts actually
    // calls this (each snapshot only carries its own immediate previous
    // state) -- the first transition is the only one that's a business b/c
    // fired externally; this test just confirms the rule itself agrees.
    assert.equal(evaluateAlert({ previousFound: false, previousPosition: null, found: false, position: null }), null);
    assert.equal(evaluateAlert({ previousFound: false, previousPosition: null, found: false, position: null }), null);
    assert.equal(evaluateAlert({ previousFound: false, previousPosition: null, found: false, position: null }), null);
  });
});

describe("overtake and Telegram text", () => {
  test("formatOvertakeMessage says who passed you and both ranks", () => {
    assert.equal(
      formatOvertakeMessage({ competitorName: "Competitor X", yourPosition: 5, theirPosition: 4 }),
      "Competitor X just outranked you (you are now #5, they are #4)"
    );
  });

  test("each alert type gets its own emoji, and the layout is unchanged", () => {
    const base = { businessName: "Zaitoon", queryText: "restaurant near VIT Vellore", category: "restaurant", message: "m" };
    assert.equal(formatTelegramText({ ...base, type: "fell_out" }), '\u{1F6A8} *Zaitoon*\nm\nQuery: "restaurant near VIT Vellore" (restaurant)');
    assert.ok(formatTelegramText({ ...base, type: "rank_drop" }).startsWith("\u{1F53B} "));
    assert.ok(formatTelegramText({ ...base, type: "overtaken" }).startsWith("\u{26A0}\u{FE0F} "));
  });

  test("Markdown characters in names are escaped so Telegram can't reject the message", () => {
    assert.equal(escapeTelegramMarkdown("Chai_&_Co *Best* `x` [y]"), "Chai\\_&\\_Co \\*Best\\* \\`x\\` \\[y]");
    const text = formatTelegramText({ businessName: "Cafe_One", queryText: "q_1", category: "c", type: "overtaken", message: "Kettle_Crumb just outranked you" });
    assert.ok(text.includes("*Cafe\\_One*"));
    assert.ok(text.includes("Kettle\\_Crumb just outranked you"));
    assert.ok(text.includes('Query: "q\\_1"'));
  });

  test("plain text passes through unchanged", () => {
    assert.equal(escapeTelegramMarkdown("Brew & Bloom Cafe (#4)"), "Brew & Bloom Cafe (#4)");
  });
});
