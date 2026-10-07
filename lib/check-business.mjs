/**
 * "Run check now" for one business: runs the single google_maps search for the
 * query that business is tracked on, writes snapshots, and evaluates alerts.
 *
 * Costs 1 SerpApi search credit per call (maps only -- the organic call is
 * skipped, same as the daily cron; nothing in the UI reads it). The search is
 * per query, so every business tracked on that query gets a fresh snapshot.
 *
 * Unlike /api/run-now (which checks every query and needs CRON_SECRET), this
 * is safe to call from the browser: it only ever touches one query, and is
 * rate-limited per business by the 1-hour cooldown (lib/check-cooldown.mjs),
 * measured from the business's latest snapshot, whether cron or a button made it.
 */
import { sql } from "./db.mjs";
import { runCheck } from "./run-check.mjs";
import { checkAndSendAlerts } from "./alerts.mjs";
import { cooldownRemainingMs, formatWait } from "./check-cooldown.mjs";

export class CheckBusinessError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = "CheckBusinessError";
    this.status = status;
    this.extra = extra;
  }
}

// Query ids with a check running in this server instance. Stops a double
// click or two tabs from paying for the same search twice. Per instance only:
// two serverless instances could still overlap, so the cooldown is the real limit.
const inFlight = new Set();

async function findTarget(businessId) {
  const [row] = await sql`
    SELECT
      b.id,
      b.name,
      t.query_id AS "queryId",
      (SELECT max(s.checked_at) FROM snapshots s WHERE s.business_id = b.id) AS "lastCheckedAt"
    FROM businesses b
    LEFT JOIN tracking t ON t.business_id = b.id
    WHERE b.id = ${businessId}
    ORDER BY t.query_id
    LIMIT 1
  `;
  return row ?? null;
}

export async function checkBusinessNow(
  businessId,
  { findTargetFn = findTarget, runCheckFn = runCheck, alertsFn = checkAndSendAlerts, now = Date.now } = {}
) {
  const target = await findTargetFn(businessId);
  if (!target) throw new CheckBusinessError(404, `No business with id ${businessId}`);
  if (target.queryId === null || target.queryId === undefined) {
    throw new CheckBusinessError(409, `${target.name} isn't tracked on any query, so there is nothing to check.`);
  }

  const waitMs = cooldownRemainingMs(target.lastCheckedAt, now());
  if (waitMs > 0) {
    throw new CheckBusinessError(
      429,
      `${target.name} was checked recently. You can run another check in ${formatWait(waitMs)}.`,
      { retryAfterSeconds: Math.ceil(waitMs / 1000) }
    );
  }

  if (inFlight.has(target.queryId)) {
    throw new CheckBusinessError(409, `A check for ${target.name} is already running.`);
  }

  inFlight.add(target.queryId);
  try {
    let result;
    try {
      result = await runCheckFn(target.queryId, { includeOrganic: false });
    } catch (err) {
      throw new CheckBusinessError(502, `The search failed: ${err.message}`);
    }

    // The check itself already succeeded; a failed alert must not turn it into an error.
    let alertsFired = 0;
    try {
      alertsFired = (await alertsFn(result.snapshots)).length;
    } catch (err) {
      console.warn(`[check-business] alert evaluation failed for query ${target.queryId}: ${err.message}`);
    }

    const mine = result.snapshots.find((s) => s.business_id === businessId);
    return {
      businessId,
      businessName: target.name,
      queryText: result.queryText,
      checkedAt: result.checkedAt,
      found: mine ? mine.found : null,
      position: mine?.found ? mine.position : null,
      snapshotCount: result.snapshots.length,
      serpApiCallsMade: result.serpApiCallsMade,
      alertsFired,
    };
  } finally {
    inFlight.delete(target.queryId);
  }
}
