import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { alertSeverity, findPointForAlert, ALERT_POINT_TOLERANCE_MS } from "../lib/alert-focus.mjs";

describe("alertSeverity", () => {
  test("a rank drop is a red down-trending arrow", () => {
    assert.deepEqual(alertSeverity("rank_drop"), { icon: "trend-down", tone: "critical", label: "Rank drop" });
  });

  test("being overtaken is an orange warning", () => {
    assert.equal(alertSeverity("overtaken").icon, "warning");
    assert.equal(alertSeverity("overtaken").tone, "warning");
  });

  test("falling out of the top 20 shares the red down-trend icon (it is a drop)", () => {
    assert.equal(alertSeverity("fell_out").icon, "trend-down");
    assert.equal(alertSeverity("fell_out").tone, "critical");
  });

  test("there is no 'rank up' alert type, so no up-arrow icon exists", () => {
    for (const type of ["rank_drop", "fell_out", "overtaken", "rank_up", "recovered", "improved"]) {
      assert.ok(!/up/i.test(alertSeverity(type).icon ?? ""), type);
    }
  });

  test("an unknown or missing type gets no icon (never a wrong one) and a readable label", () => {
    assert.deepEqual(alertSeverity("something_new"), { icon: null, tone: "neutral", label: "something_new" });
    assert.equal(alertSeverity(undefined).icon, null);
    assert.equal(alertSeverity(null).label, "Alert");
  });

  test("every known type has a text label (the icon is never the only signal)", () => {
    for (const type of ["rank_drop", "fell_out", "overtaken"]) assert.ok(alertSeverity(type).label.length > 0);
  });
});

describe("findPointForAlert", () => {
  const T = Date.parse("2026-10-07T12:00:00Z");
  const at = (ms) => new Date(T + ms).toISOString();
  const DAY = 24 * 3600 * 1000;
  const history = [{ checkedAt: at(-2 * DAY) }, { checkedAt: at(-DAY) }, { checkedAt: at(0) }];

  test("an alert written moments after its check points at that check", () => {
    assert.equal(findPointForAlert(history, at(3000)), history[2].checkedAt);
    assert.equal(findPointForAlert(history, at(-DAY + 1500)), history[1].checkedAt);
  });

  test("an alert at exactly the check's time matches it (the demo data)", () => {
    assert.equal(findPointForAlert(history, history[0].checkedAt), history[0].checkedAt);
  });

  test("it returns the point's own checkedAt value, untouched, for the chart's x axis", () => {
    const odd = [{ checkedAt: "2026-10-07T12:00:00.123Z" }];
    assert.equal(findPointForAlert(odd, "2026-10-07T12:00:05Z"), "2026-10-07T12:00:00.123Z");
  });

  test("the nearest of several points wins", () => {
    const two = [{ checkedAt: at(0) }, { checkedAt: at(60 * 60 * 1000) }];
    assert.equal(findPointForAlert(two, at(50 * 60 * 1000)), two[1].checkedAt);
    assert.equal(findPointForAlert(two, at(10 * 60 * 1000)), two[0].checkedAt);
  });

  test("nothing close enough: null, so the UI only scrolls", () => {
    assert.equal(findPointForAlert(history, at(10 * DAY)), null);
    assert.equal(findPointForAlert(history, at(ALERT_POINT_TOLERANCE_MS + DAY / 2 + 2 * DAY)), null);
  });

  test("the tolerance edge: exactly at it matches, just past it does not", () => {
    const one = [{ checkedAt: at(0) }];
    assert.equal(findPointForAlert(one, at(ALERT_POINT_TOLERANCE_MS)), one[0].checkedAt);
    assert.equal(findPointForAlert(one, at(ALERT_POINT_TOLERANCE_MS + 1)), null);
  });

  test("history in any order, Date objects, and bad input are all safe", () => {
    assert.equal(findPointForAlert([...history].reverse(), at(0)), history[2].checkedAt);
    assert.equal(findPointForAlert([{ checkedAt: new Date(T) }], new Date(T)).getTime(), T);
    assert.equal(findPointForAlert([], at(0)), null);
    assert.equal(findPointForAlert(undefined, at(0)), null);
    assert.equal(findPointForAlert(history, "not a date"), null);
    assert.equal(findPointForAlert(history, null), null);
    assert.equal(findPointForAlert([{ checkedAt: "garbage" }, null, {}], at(0)), null);
  });
});
