import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkBusinessNow, CheckBusinessError } from "../lib/check-business.mjs";
import { CHECK_COOLDOWN_MS, cooldownRemainingMs, formatWait } from "../lib/check-cooldown.mjs";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const ago = (ms) => new Date(NOW - ms).toISOString();

describe("cooldownRemainingMs / formatWait", () => {
  test("never checked: no wait", () => {
    assert.equal(cooldownRemainingMs(null, NOW), 0);
    assert.equal(cooldownRemainingMs(undefined, NOW), 0);
  });

  test("checked 10 minutes ago: 50 minutes left", () => {
    assert.equal(cooldownRemainingMs(ago(10 * 60000), NOW), 50 * 60000);
  });

  test("exactly one hour ago, or older: no wait", () => {
    assert.equal(cooldownRemainingMs(ago(CHECK_COOLDOWN_MS), NOW), 0);
    assert.equal(cooldownRemainingMs(ago(CHECK_COOLDOWN_MS + 1), NOW), 0);
    assert.equal(cooldownRemainingMs(ago(17 * 24 * 3600 * 1000), NOW), 0);
  });

  test("a timestamp slightly in the future (clock skew) never yields more than the cooldown", () => {
    assert.equal(cooldownRemainingMs(new Date(NOW + 5000).toISOString(), NOW), CHECK_COOLDOWN_MS);
    assert.equal(formatWait(cooldownRemainingMs(new Date(NOW + 5000).toISOString(), NOW)), "60 minutes");
  });

  test("the cooldown is one hour", () => {
    assert.equal(CHECK_COOLDOWN_MS, 3600000);
  });

  test("formatWait rounds up and pluralizes", () => {
    assert.equal(formatWait(50 * 60000), "50 minutes");
    assert.equal(formatWait(60000), "1 minute");
    assert.equal(formatWait(1000), "1 minute"); // 1s left still reads as a minute, never "0 minutes"
    assert.equal(formatWait(0), "under a minute");
  });
});

function doubles({ target, runCheckFn, alertsFn } = {}) {
  const calls = { runCheck: [], alerts: [] };
  return {
    calls,
    opts: {
      now: () => NOW,
      findTargetFn: async () => target,
      runCheckFn:
        runCheckFn ??
        (async (queryId, o) => {
          calls.runCheck.push({ queryId, ...o });
          return {
            queryText: "cafe near VIT Vellore",
            checkedAt: new Date(NOW).toISOString(),
            serpApiCallsMade: o.includeOrganic ? 2 : 1,
            snapshots: [
              { business_id: 10, found: true, position: 2 },
              { business_id: 11, found: false, position: null },
            ],
          };
        }),
      alertsFn:
        alertsFn ??
        (async (snaps) => {
          calls.alerts.push(snaps);
          return [];
        }),
    },
  };
}

const tracked = (over = {}) => ({ id: 10, name: "Cafe Laylat", queryId: 4, lastCheckedAt: ago(2 * 3600000), ...over });

describe("checkBusinessNow", () => {
  test("runs maps-only (1 credit), then evaluates alerts, and reports this business's result", async () => {
    const d = doubles({ target: tracked() });
    const out = await checkBusinessNow(10, d.opts);
    assert.deepEqual(d.calls.runCheck, [{ queryId: 4, includeOrganic: false }]);
    assert.equal(d.calls.alerts.length, 1);
    assert.equal(out.serpApiCallsMade, 1);
    assert.equal(out.found, true);
    assert.equal(out.position, 2);
    assert.equal(out.snapshotCount, 2);
  });

  test("a never-checked business is allowed", async () => {
    const d = doubles({ target: tracked({ lastCheckedAt: null }) });
    await checkBusinessNow(10, d.opts);
    assert.equal(d.calls.runCheck.length, 1);
  });

  test("within the hour: 429 with retry info, and SerpApi is NOT called", async () => {
    const d = doubles({ target: tracked({ lastCheckedAt: ago(20 * 60000) }) });
    await assert.rejects(checkBusinessNow(10, d.opts), (err) => {
      assert.ok(err instanceof CheckBusinessError);
      assert.equal(err.status, 429);
      assert.match(err.message, /in 40 minutes/);
      assert.equal(err.extra.retryAfterSeconds, 40 * 60);
      return true;
    });
    assert.equal(d.calls.runCheck.length, 0);
    assert.equal(d.calls.alerts.length, 0);
  });

  test("unknown business: 404", async () => {
    const d = doubles({ target: null });
    await assert.rejects(checkBusinessNow(99, d.opts), { status: 404 });
    assert.equal(d.calls.runCheck.length, 0);
  });

  test("business not tracked on any query: 409, no search", async () => {
    const d = doubles({ target: tracked({ queryId: null }) });
    await assert.rejects(checkBusinessNow(10, d.opts), { status: 409 });
    assert.equal(d.calls.runCheck.length, 0);
  });

  test("a SerpApi failure becomes a 502 with the reason, and the lock is released for a retry", async () => {
    let attempts = 0;
    const d = doubles({
      target: tracked(),
      runCheckFn: async () => {
        attempts++;
        if (attempts === 1) throw new Error("SerpApi request failed (engine=google_maps): Your account has run out of searches.");
        return { queryText: "q", checkedAt: new Date(NOW).toISOString(), serpApiCallsMade: 1, snapshots: [] };
      },
    });
    await assert.rejects(checkBusinessNow(10, d.opts), (err) => {
      assert.equal(err.status, 502);
      assert.match(err.message, /run out of searches/);
      return true;
    });
    await checkBusinessNow(10, d.opts); // not stuck "already running"
    assert.equal(attempts, 2);
  });

  test("a throwing alertsFn does not fail an otherwise successful check", async () => {
    const d = doubles({
      target: tracked(),
      alertsFn: async () => {
        throw new Error("Telegram is on fire");
      },
    });
    const out = await checkBusinessNow(10, d.opts);
    assert.equal(out.alertsFired, 0);
    assert.equal(out.found, true);
  });

  test("a second click while the first check is still running is rejected (409) and costs nothing", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const d = doubles({
      target: tracked(),
      runCheckFn: async (queryId, o) => {
        d.calls.runCheck.push({ queryId, ...o });
        await gate;
        return { queryText: "q", checkedAt: new Date(NOW).toISOString(), serpApiCallsMade: 1, snapshots: [] };
      },
    });
    const first = checkBusinessNow(10, d.opts);
    await new Promise((r) => setImmediate(r)); // let the first call reach the search
    await assert.rejects(checkBusinessNow(10, d.opts), { status: 409 });
    release();
    await first;
    assert.equal(d.calls.runCheck.length, 1);
  });

  test("reports the alert count", async () => {
    const d = doubles({ target: tracked(), alertsFn: async () => [{ id: 1 }, { id: 2 }] });
    assert.equal((await checkBusinessNow(10, d.opts)).alertsFired, 2);
  });

  test("sample (demo) data: 409 with the sample-data message, no SerpApi call, no alerts", async () => {
    const d = doubles({ target: tracked({ isDemo: true, lastCheckedAt: null }) });
    await assert.rejects(checkBusinessNow(10, d.opts), (err) => {
      assert.ok(err instanceof CheckBusinessError);
      assert.equal(err.status, 409);
      assert.equal(err.message, "This is sample data, so live checks are turned off.");
      return true;
    });
    assert.equal(d.calls.runCheck.length, 0);
    assert.equal(d.calls.alerts.length, 0);
  });

  test("demo data is refused even when it was 'checked' long ago (the cooldown never gets a say)", async () => {
    const d = doubles({ target: tracked({ isDemo: true, lastCheckedAt: ago(17 * 24 * 3600000) }) });
    await assert.rejects(checkBusinessNow(10, d.opts), { status: 409 });
    assert.equal(d.calls.runCheck.length, 0);
  });
});
