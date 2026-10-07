
import { sql } from "./db.mjs";
import { runCheck } from "./run-check.mjs";
import { checkAndSendAlerts } from "./alerts.mjs";

const DELAY_MS = 3000; // gap between SerpApi-hitting calls, to stay well clear of rate limits
const STALE_RUNNING_MS = 20 * 60 * 1000; // a 'running' row older than this is presumed crashed, not in-progress


function fallbackCallsPerAttempt(includeOrganic) {
  return includeOrganic ? 2 : 1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}


export async function runOneQueryWithRetry(
  query,
  {
    runCheckFn = runCheck,
    delayMs = DELAY_MS,
    sleepFn = sleep,
    includeOrganic = true,
    alertsFn = checkAndSendAlerts,
  } = {}
) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await runCheckFn(query.id, { includeOrganic });

      
      let alertsFired = [];
      try {
        alertsFired = await alertsFn(result.snapshots);
      } catch (alertErr) {
        console.warn(
          `[runAllChecks] alert evaluation failed for query ${query.id} ("${query.query_text}"): ${alertErr.message}`
        );
      }

      return {
        queryId: query.id,
        category: query.category,
        queryText: query.query_text,
        status: "success",
        attempts: attempt,
        rawResultId: result.rawResultId,
        snapshotCount: result.snapshots.length,
        organicChecked: result.organicChecked ?? includeOrganic,
        // Prefer runCheck()'s own reported count; fall back only if a test
        // double / older runCheckFn doesn't report one.
        serpApiCallsMade: result.serpApiCallsMade ?? fallbackCallsPerAttempt(includeOrganic),
        alertsFired: alertsFired.length,
      };
    } catch (err) {
      lastError = err;
      console.warn(
        `[runAllChecks] query ${query.id} ("${query.query_text}") failed on attempt ${attempt}: ${err.message}`
      );
      if (attempt === 1) await sleepFn(delayMs); // brief pause before the single retry
    }
  }
  return {
    queryId: query.id,
    category: query.category,
    queryText: query.query_text,
    status: "failed",
    attempts: 2,
    error: lastError?.message ?? "unknown error",
    organicChecked: includeOrganic,
   
    serpApiCallsMade: 2 * fallbackCallsPerAttempt(includeOrganic),
  };
}


export async function runQueriesSequentially(queries, opts = {}) {
  const { delayMs = DELAY_MS, sleepFn = sleep } = opts;
  const results = [];
  for (let i = 0; i < queries.length; i++) {
    const result = await runOneQueryWithRetry(queries[i], opts);
    results.push(result);
    console.log(
      `[runAllChecks] (${i + 1}/${queries.length}) "${queries[i].query_text}" -> ${result.status}` +
        (result.status === "failed" ? ` (${result.error})` : ` (${result.snapshotCount} snapshot(s), ${result.attempts} attempt(s))`)
    );
    if (i < queries.length - 1) await sleepFn(delayMs);
  }
  return results;
}

// --- DB-backed guard + durable logging (needs a live connection) ----------

async function claimCronSlot(runDate) {
  const rows = await sql`
    INSERT INTO cron_runs (run_date, status, triggered_by)
    VALUES (${runDate}, 'running', 'cron')
    ON CONFLICT (run_date) WHERE triggered_by = 'cron' DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

async function getTodaysCronRun(runDate) {
  const rows = await sql`
    SELECT id, status, started_at FROM cron_runs
    WHERE run_date = ${runDate} AND triggered_by = 'cron'
  `;
  return rows[0] ?? null;
}


async function claimOrReclaimCronSlot(runDate) {
  const claimedId = await claimCronSlot(runDate);
  if (claimedId) return { id: claimedId, reclaimed: false };

  const existing = await getTodaysCronRun(runDate);
  if (!existing) return null; // lost a race to claim it; treat as "already running elsewhere"
  if (existing.status === "completed") return null; // guard: today's run is already done

  const ageMs = Date.now() - new Date(existing.started_at).getTime();
  if (existing.status === "running" && ageMs < STALE_RUNNING_MS) {
    return null; // presumed still in progress elsewhere
  }

  // status === 'failed', or a 'running' row stuck long enough to look
  // crashed: reclaim it and try again.
  await sql`
    UPDATE cron_runs
    SET status = 'running', started_at = now(), finished_at = NULL, results_json = NULL
    WHERE id = ${existing.id}
  `;
  return { id: existing.id, reclaimed: true };
}

async function startManualRun(runDate) {
  const [row] = await sql`
    INSERT INTO cron_runs (run_date, status, triggered_by)
    VALUES (${runDate}, 'running', 'manual')
    RETURNING id
  `;
  return row.id;
}

async function finishRun(runRowId, status, resultsSummary) {
  await sql`
    UPDATE cron_runs
    SET status = ${status}, finished_at = now(), results_json = ${JSON.stringify(resultsSummary)}::jsonb
    WHERE id = ${runRowId}
  `;
}

export async function runAllChecks({ triggeredBy = "manual" } = {}) {
  if (triggeredBy !== "cron" && triggeredBy !== "manual") {
    throw new Error('triggeredBy must be "cron" or "manual"');
  }

  const runDate = todayDateString();
  let runRowId;

  if (triggeredBy === "cron") {
    const claim = await claimOrReclaimCronSlot(runDate);
    if (!claim) {
      const reason = `a cron run for ${runDate} is already completed or in progress`;
      console.log(`[runAllChecks] skipped: ${reason}`);
      return { skipped: true, reason, runDate };
    }
    runRowId = claim.id;
    if (claim.reclaimed) {
      console.log(`[runAllChecks] reclaimed a stuck/failed cron run for ${runDate} (row ${runRowId})`);
    }
  } else {
    runRowId = await startManualRun(runDate);
  }

  console.log(`[runAllChecks] starting ${triggeredBy} run ${runRowId} for ${runDate}`);

  // Automated (cron) runs are google_maps-only to conserve SerpApi credits;
  // manual/ad-hoc runs keep the organic call too. See lib/run-check.mjs.
  const includeOrganic = triggeredBy !== "cron";

  try {
    const queries = await sql`SELECT id, query_text, category FROM queries ORDER BY id`;
    const results = await runQueriesSequentially(queries, { includeOrganic });

    const successCount = results.filter((r) => r.status === "success").length;
    const failureCount = results.length - successCount;
    const serpApiCallsMade = results.reduce((sum, r) => sum + (r.serpApiCallsMade ?? 0), 0);
    const alertsFired = results.reduce((sum, r) => sum + (r.alertsFired ?? 0), 0);

    const summary = {
      runDate,
      triggeredBy,
      includeOrganic,
      successCount,
      failureCount,
      serpApiCallsMade,
      alertsFired,
      queries: results,
    };

    await finishRun(runRowId, "completed", summary);

    const noRetryBaseline = fallbackCallsPerAttempt(includeOrganic) * results.length;
    const monthlyEstimate = noRetryBaseline * 30;
    console.log(
      `[runAllChecks] run ${runRowId} complete: ${successCount}/${results.length} succeeded, ` +
        `${serpApiCallsMade} SerpApi call(s) used this run (includeOrganic=${includeOrganic}), ` +
        `${alertsFired} alert(s) fired ` +
        `(no-retry baseline at ${results.length} queries/day: ~${monthlyEstimate}/month)`
    );

    return { runRowId, ...summary };
  } catch (err) {
    console.error(`[runAllChecks] run ${runRowId} crashed: ${err.message}`);
    try {
      await finishRun(runRowId, "failed", { error: err.message });
    } catch (finishErr) {
      console.error(`[runAllChecks] additionally failed to record the failure: ${finishErr.message}`);
    }
    throw err;
  }
}
