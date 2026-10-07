import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkAndSendAlerts } from "../lib/alerts.mjs";

function makeSnapshot(overrides) {
  return {
    id: 1,
    business_id: 10,
    query_id: 20,
    businessName: "Cafe My Frappe",
    queryText: "cafe near VIT Vellore",
    category: "cafe",
    position: null,
    found: false,
    previousFound: true,
    previousPosition: 2,
    ...overrides,
  };
}

describe("checkAndSendAlerts (orchestrator)", () => {
  test("no alert conditions met -> sendFn never called, nothing returned", async () => {
    let sendCalls = 0;
    const snapshots = [makeSnapshot({ found: true, position: 2, previousFound: true, previousPosition: 2 })];
    const fired = await checkAndSendAlerts(snapshots, { sendFn: async () => sendCalls++ });
    assert.equal(sendCalls, 0);
    assert.deepEqual(fired, []);
  });

  test("never-checked-before business produces no alert and no send attempt", async () => {
    let sendCalls = 0;
    const snapshots = [makeSnapshot({ found: false, position: null, previousFound: null, previousPosition: null })];
    const fired = await checkAndSendAlerts(snapshots, { sendFn: async () => sendCalls++ });
    assert.equal(sendCalls, 0);
    assert.deepEqual(fired, []);
  });

  test("empty snapshots array short-circuits cleanly", async () => {
    const fired = await checkAndSendAlerts([], { sendFn: async () => { throw new Error("should never be called"); } });
    assert.deepEqual(fired, []);
  });

  describe("overtaken alerts", () => {
    const overtake = (competitor, position, yourPosition = 5, yourPreviousPosition = 3) => ({
      competitor,
      placeId: null,
      previousPosition: position + 2,
      position,
      yourPreviousPosition,
      yourPosition,
    });

    function recorder() {
      const sent = [];
      const rows = [];
      return {
        sent,
        rows,
        opts: {
          sendFn: async (text) => sent.push(text),
          insertFn: async (row) => {
            rows.push(row);
            return { id: rows.length, alertType: row.alert_type, message: row.message, createdAt: "2026-10-07T00:00:00Z" };
          },
        },
      };
    }

    test("an overtake raises an 'overtaken' alert naming the competitor, stored and sent", async () => {
      const r = recorder();
      const snap = makeSnapshot({ found: true, position: 5, previousFound: true, previousPosition: 4, overtakes: [overtake("Kettle & Crumb", 4)] });
      const fired = await checkAndSendAlerts([snap], r.opts);
      assert.equal(fired.length, 1);
      assert.equal(fired[0].alertType, "overtaken");
      assert.equal(fired[0].competitorName, "Kettle & Crumb");
      assert.equal(fired[0].telegramSent, true);
      assert.equal(r.rows[0].message, "Kettle & Crumb just outranked you (you are now #5, they are #4)");
      assert.equal(r.rows[0].competitor_name, "Kettle & Crumb");
      assert.equal(r.rows[0].previous_position, 3);
      assert.equal(r.rows[0].new_position, 5);
      assert.equal(r.rows[0].previous_found, true);
      assert.equal(r.rows[0].new_found, true);
      assert.equal(r.rows[0].business_id, 10);
      assert.match(r.sent[0], /just outranked you/);
    });

    test("a big drop can raise the rank alert and the overtakes together, each stored once", async () => {
      const r = recorder();
      const snap = makeSnapshot({
        found: true, position: 9, previousFound: true, previousPosition: 4,
        overtakes: [overtake("A", 5, 9, 4), overtake("B", 6, 9, 4)],
      });
      const fired = await checkAndSendAlerts([snap], r.opts);
      assert.deepEqual(fired.map((f) => f.alertType), ["rank_drop", "overtaken", "overtaken"]);
      assert.equal(r.rows[0].competitor_name, null);
      assert.equal(r.sent.length, 3);
    });

    test("no overtakes and no rank change sends nothing", async () => {
      const r = recorder();
      const fired = await checkAndSendAlerts([makeSnapshot({ found: true, position: 2, previousPosition: 2, overtakes: [] })], r.opts);
      assert.deepEqual(fired, []);
      assert.equal(r.sent.length, 0);
      assert.equal(r.rows.length, 0);
    });

    test("a snapshot without an overtakes field (older callers) still works", async () => {
      const r = recorder();
      const fired = await checkAndSendAlerts([makeSnapshot({ found: false, position: null })], r.opts);
      assert.deepEqual(fired.map((f) => f.alertType), ["fell_out"]);
    });

    test("a Telegram failure is recorded on the alert, and the alert is still stored", async () => {
      const r = recorder();
      const snap = makeSnapshot({ found: true, position: 5, previousPosition: 4, overtakes: [overtake("A", 4)] });
      const fired = await checkAndSendAlerts([snap], {
        ...r.opts,
        sendFn: async () => {
          throw new Error("Telegram is down");
        },
      });
      assert.equal(fired[0].telegramSent, false);
      assert.equal(r.rows[0].telegram_sent, false);
      assert.equal(r.rows[0].telegram_error, "Telegram is down");
    });
  });
});
