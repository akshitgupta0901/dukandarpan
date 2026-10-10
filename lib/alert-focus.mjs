/**
 * Alerts feed helpers -- pure, zero I/O.
 *
 * alertSeverity: which icon and tone an alert type gets. The project only raises three alert
 * types (see lib/alert-rule.mjs and lib/alerts.mjs): rank_drop, fell_out and overtaken. There is
 * no "rank up" alert, so no green up-arrow exists and none is invented. A type this doesn't know
 * gets no icon rather than a wrong one.
 *
 * findPointForAlert: when an alert is clicked, which point of the rank chart does it refer to?
 * The alert row is written moments after its check's snapshot, so the match is the history point
 * nearest in time, within a tolerance, and null when nothing is close enough.
 */

const SEVERITY = {
  rank_drop: { icon: "trend-down", tone: "critical", label: "Rank drop" },
  // Falling out of the top 20 is the sharpest drop there is, so it shares the red down-trend icon.
  fell_out: { icon: "trend-down", tone: "critical", label: "Fell out of the top 20" },
  overtaken: { icon: "warning", tone: "warning", label: "A competitor overtook you" },
};

export function alertSeverity(type) {
  return SEVERITY[type] ?? { icon: null, tone: "neutral", label: String(type ?? "Alert") };
}

/** Alerts are written seconds after the snapshot they describe; a few hours is a generous bound for "the same check". */
export const ALERT_POINT_TOLERANCE_MS = 6 * 60 * 60 * 1000;

/**
 * @param {Array<{ checkedAt: string|Date }>} history chart history, any order
 * @param {string|Date} alertAt when the alert was created
 * @returns {string|null} the matching point's checkedAt exactly as it appears in `history` (so the chart can use it as its x value), or null
 */
export function findPointForAlert(history, alertAt, toleranceMs = ALERT_POINT_TOLERANCE_MS) {
  const target = new Date(alertAt).getTime();
  if (!Number.isFinite(target)) return null;
  let best = null;
  let bestGap = Infinity;
  for (const point of Array.isArray(history) ? history : []) {
    const gap = Math.abs(new Date(point?.checkedAt).getTime() - target);
    if (gap < bestGap) {
      best = point;
      bestGap = gap;
    }
  }
  return best && bestGap <= toleranceMs ? best.checkedAt : null;
}
