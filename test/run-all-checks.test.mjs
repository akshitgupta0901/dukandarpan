import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { runOneQueryWithRetry, runQueriesSequentially } from "../lib/run-all-checks.mjs";

function makeQuery(id, category) {
  return { id, category, query_text: `${category} near VIT Vellore` };
}

describe("runOneQueryWithRetry", () => {
  test("succeeds on the first attempt: no retry, no delay", async () => {
    let calls = 0;
    const sleepCalls = [];
    const result = await runOneQueryWithRetry(makeQuery(1, "cafe"), {
      runCheckFn: async () => {
        calls++;
        return { rawResultId: 99, snapshots: [{}, {}] };
      },
      sleepFn: async (ms) => sleepCalls.push(ms),
    });
    assert.equal(calls, 1);
    assert.equal(sleepCalls.length, 0);
    assert.equal(result.status, "success");
    assert.equal(result.attempts, 1);
    assert.equal(result.snapshotCount, 2);
  });

  test("fails once, retries, then succeeds: exactly one retry, one delay", async () => {
    let calls = 0;
    const sleepCalls = [];
    const result = await runOneQueryWithRetry(makeQuery(2, "gym"), {
      runCheckFn: async () => {
        calls++;
        if (calls === 1) throw new Error("SerpApi timeout");
        return { rawResultId: 100, snapshots: [{}] };
      },
      sleepFn: async (ms) => sleepCalls.push(ms),
    });
    assert.equal(calls, 2);
    assert.equal(sleepCalls.length, 1); // exactly one delay, before the retry
    assert.equal(result.status, "success");
    assert.equal(result.attempts, 2);
  });

  test("fails twice: reports status 'failed' after exactly 2 attempts, never a 3rd", async () => {
    let calls = 0;
    const result = await runOneQueryWithRetry(makeQuery(3, "salon"), {
      runCheckFn: async () => {
        calls++;
        throw new Error("SerpApi 429");
      },
      sleepFn: async () => {},
    });
    assert.equal(calls, 2);
    assert.equal(result.status, "failed");
    assert.equal(result.attempts, 2);
    assert.equal(result.error, "SerpApi 429");
  });

  test("includeOrganic defaults to true and is forwarded to runCheckFn as { includeOrganic }", async () => {
    let receivedOpts;
    await runOneQueryWithRetry(makeQuery(4, "cafe"), {
      runCheckFn: async (id, opts) => {
        receivedOpts = opts;
        return { rawResultId: 1, snapshots: [], organicChecked: true, serpApiCallsMade: 2 };
      },
      sleepFn: async () => {},
    });
    assert.deepEqual(receivedOpts, { includeOrganic: true });
  });

  test("includeOrganic: false is forwarded to runCheckFn, and its own reported serpApiCallsMade is used", async () => {
    let receivedOpts;
    const result = await runOneQueryWithRetry(makeQuery(5, "restaurant"), {
      includeOrganic: false,
      runCheckFn: async (id, opts) => {
        receivedOpts = opts;
        return { rawResultId: 1, snapshots: [{}], organicChecked: false, serpApiCallsMade: 1 };
      },
      sleepFn: async () => {},
    });
    assert.deepEqual(receivedOpts, { includeOrganic: false });
    assert.equal(result.organicChecked, false);
    assert.equal(result.serpApiCallsMade, 1); // maps-only: 1, not the includeOrganic:true default of 2
  });

  test("a failed query with includeOrganic:false estimates credits at 1/attempt, not 2", async () => {
    const result = await runOneQueryWithRetry(makeQuery(6, "gym"), {
      includeOrganic: false,
      runCheckFn: async () => {
        throw new Error("SerpApi 500");
      },
      sleepFn: async () => {},
    });
    assert.equal(result.status, "failed");
    assert.equal(result.attempts, 2);
    assert.equal(result.serpApiCallsMade, 2); // 2 attempts x 1 call/attempt (maps-only), not x 2
  });

  test("alertsFn runs against the snapshots from a successful check, and its count is reported", async () => {
    const receivedSnapshots = [];
    const result = await runOneQueryWithRetry(makeQuery(7, "cafe"), {
      runCheckFn: async () => ({ rawResultId: 1, snapshots: [{ id: 1 }, { id: 2 }, { id: 3 }] }),
      sleepFn: async () => {},
      alertsFn: async (snapshots) => {
        receivedSnapshots.push(...snapshots);
        return [{ id: 100 }, { id: 101 }]; // pretend 2 of the 3 fired
      },
    });
    assert.equal(receivedSnapshots.length, 3);
    assert.equal(result.alertsFired, 2);
  });

  test("alertsFn is NOT called on a failed attempt, and a failed query reports no alertsFired", async () => {
    let alertsCalls = 0;
    const result = await runOneQueryWithRetry(makeQuery(8, "salon"), {
      runCheckFn: async () => {
        throw new Error("SerpApi down");
      },
      sleepFn: async () => {},
      alertsFn: async () => {
        alertsCalls++;
        return [];
      },
    });
    assert.equal(result.status, "failed");
    assert.equal(alertsCalls, 0);
    assert.equal(result.alertsFired, undefined);
  });

  test("a throwing alertsFn does not fail the query -- the check itself already succeeded", async () => {
    const result = await runOneQueryWithRetry(makeQuery(9, "restaurant"), {
      runCheckFn: async () => ({ rawResultId: 1, snapshots: [{ id: 1 }] }),
      sleepFn: async () => {},
      alertsFn: async () => {
        throw new Error("Telegram is on fire");
      },
    });
    assert.equal(result.status, "success");
    assert.equal(result.alertsFired, 0); // evaluation failed, so nothing confirmed fired
  });
});

describe("runQueriesSequentially", () => {
  test("runs queries in order, one at a time (never concurrently)", async () => {
    const order = [];
    const queries = [makeQuery(1, "restaurant"), makeQuery(2, "salon"), makeQuery(3, "gym")];
    await runQueriesSequentially(queries, {
      runCheckFn: async (id) => {
        order.push(`start:${id}`);
        await new Promise((r) => setTimeout(r, 0)); // let the microtask/macrotask queue turn over
        order.push(`end:${id}`);
        return { rawResultId: id, snapshots: [] };
      },
      sleepFn: async () => {},
    });
    assert.deepEqual(order, ["start:1", "end:1", "start:2", "end:2", "start:3", "end:3"]);
  });

  test("a failed query does not stop the rest from running", async () => {
    const queries = [makeQuery(1, "restaurant"), makeQuery(2, "salon"), makeQuery(3, "gym")];
    const results = await runQueriesSequentially(queries, {
      runCheckFn: async (id) => {
        if (id === 2) throw new Error("always fails"); // fails both attempts
        return { rawResultId: id, snapshots: [{}] };
      },
      sleepFn: async () => {},
    });
    assert.equal(results.length, 3);
    assert.equal(results[0].status, "success");
    assert.equal(results[1].status, "failed"); // query 2, after 2 attempts
    assert.equal(results[1].queryId, 2);
    assert.equal(results[2].status, "success"); // query 3 still ran
  });

  test("delays between every query, and before the in-query retry, using the given delayMs", async () => {
    const sleepCalls = [];
    const queries = [makeQuery(1, "restaurant"), makeQuery(2, "salon")];
    let query1Calls = 0;
    await runQueriesSequentially(queries, {
      delayMs: 5000,
      runCheckFn: async (id) => {
        if (id === 1) {
          query1Calls++;
          if (query1Calls === 1) throw new Error("transient");
        }
        return { rawResultId: id, snapshots: [] };
      },
      sleepFn: async (ms) => sleepCalls.push(ms),
    });
    // query 1: fails once -> 1 delay (before its retry); then 1 delay between query 1 and query 2
    assert.deepEqual(sleepCalls, [5000, 5000]);
  });

  test("no trailing delay after the last query", async () => {
    const sleepCalls = [];
    await runQueriesSequentially([makeQuery(1, "cafe")], {
      runCheckFn: async () => ({ rawResultId: 1, snapshots: [] }),
      sleepFn: async (ms) => sleepCalls.push(ms),
    });
    assert.equal(sleepCalls.length, 0);
  });

  test("empty query list resolves to an empty result array (no crash, no delay)", async () => {
    const sleepCalls = [];
    const results = await runQueriesSequentially([], { sleepFn: async (ms) => sleepCalls.push(ms) });
    assert.deepEqual(results, []);
    assert.equal(sleepCalls.length, 0);
  });

  test("includeOrganic:false flows through to every query in the run", async () => {
    const receivedOptsByQuery = [];
    const queries = [makeQuery(1, "restaurant"), makeQuery(2, "salon"), makeQuery(3, "gym"), makeQuery(4, "cafe")];
    const results = await runQueriesSequentially(queries, {
      includeOrganic: false,
      runCheckFn: async (id, opts) => {
        receivedOptsByQuery.push(opts);
        return { rawResultId: id, snapshots: [{}], organicChecked: false, serpApiCallsMade: 1 };
      },
      sleepFn: async () => {},
    });
    assert.equal(receivedOptsByQuery.length, 4);
    for (const opts of receivedOptsByQuery) assert.deepEqual(opts, { includeOrganic: false });
    for (const r of results) {
      assert.equal(r.organicChecked, false);
      assert.equal(r.serpApiCallsMade, 1);
    }
    const totalCalls = results.reduce((sum, r) => sum + r.serpApiCallsMade, 0);
    assert.equal(totalCalls, 4); // 4 queries x 1 call (maps-only) = 4, not 8
  });
});
