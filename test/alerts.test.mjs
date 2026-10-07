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
});
