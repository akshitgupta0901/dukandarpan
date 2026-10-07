/**
 * Insight context + rule-based recommendation (Phase 7) -- pure logic, zero
 * I/O, no LLM.
 *
 * Summarizes raw snapshot history + competitor listings into short factual
 * text, and picks a fixed recommendation from the rank pattern (see
 * selectRecommendation). Kept dependency-free (same pattern as
 * lib/rank-matcher.mjs and lib/alert-rule.mjs) so it's testable without a
 * database -- see test/insight-context.test.mjs.
 */

/**
 * @param {Array<{position: number|null, checkedAt: string}>} history oldest
 *   first; position is null on a not_found snapshot (same convention as the
 *   /history route -- see lib/insight.mjs for where these rows come from).
 * @param {{maxChecks?: number}} [opts]
 */
export function summarizeRankHistory(history, { maxChecks = 5 } = {}) {
  if (!Array.isArray(history) || history.length === 0) {
    return "No check history yet for this business.";
  }

  const recent = history.slice(-maxChecks);
  const n = recent.length;
  const checksWord = n === 1 ? "check" : "checks";
  const first = recent[0];
  const last = recent[n - 1];

  if (n === 1) {
    return last.position !== null
      ? `Currently ranking #${last.position} (only one check on record).`
      : "Not currently appearing in the local pack (only one check on record).";
  }

  if (first.position !== null && last.position !== null) {
    if (first.position === last.position) {
      const droppedOutInBetween = recent.some((s) => s.position === null);
      return droppedOutInBetween
        ? `Rank has been unstable -- back at #${last.position} now after dropping out of the pack during the last ${n} ${checksWord}.`
        : `Rank has held steady at #${last.position} over the last ${n} ${checksWord}.`;
    }
    const direction = last.position > first.position ? "dropped" : "improved";
    return `Rank ${direction} from #${first.position} to #${last.position} over the last ${n} ${checksWord}.`;
  }

  if (first.position !== null && last.position === null) {
    return `Was ranking #${first.position} but fell out of the local pack over the last ${n} ${checksWord}.`;
  }

  if (first.position === null && last.position !== null) {
    return `Wasn't appearing in the local pack but is now ranking #${last.position} (last ${n} ${checksWord}).`;
  }

  return `Hasn't appeared in the local pack in any of the last ${n} ${checksWord}.`;
}

/**
 * @param {{found: boolean|null, position: number|null, competitors: Array<{position:number, title:string}>}} args
 *   Same tri-state `found` contract used throughout the project: true =
 *   ranking, false = checked and not in the pack, null = never checked.
 * @param {{maxNames?: number}} [opts]
 */
export function summarizeCompetitors({ found, position, competitors }, { maxNames = 3 } = {}) {
  const names = (Array.isArray(competitors) ? competitors : [])
    .slice(0, maxNames)
    .map((c) => c.title)
    .filter(Boolean);

  if (found && position) {
    return names.length > 0
      ? `Currently ranking below: ${names.join(", ")}.`
      : "Nothing is currently ranking above this business for this query.";
  }

  if (names.length === 0) {
    return "No competitor listings are available for this query right now.";
  }
  return `Not currently ranking in the local pack. Businesses currently appearing: ${names.join(", ")}.`;
}

/**
 * Combines both summaries into one compact factual block (e.g. "Rank went from #1 to #5 over the last 3 checks.
 * Currently ranking below: Coffee & Bite Cafe, Barista Rohtak.").
 */
export function buildInsightContext({ history, found, position, competitors }) {
  const historyText = summarizeRankHistory(history);
  const competitorText = summarizeCompetitors({ found, position, competitors });
  return { historyText, competitorText, contextText: `${historyText} ${competitorText}` };
}

export const DROP_THRESHOLD = 3; // positions lost across the window before we call it a real drop

export const RECOMMENDATIONS = {
  noData: "Not enough data yet — check back after a few days of tracking.",
  droppedOut:
    "You've dropped out of the local pack for this search. Check that your Google Business Profile is claimed, verified, and has accurate hours/category.",
  stable:
    "Your ranking is stable/improving for this search. Keep up review responses and posting activity.",
};

/**
 * Rule layer on top of the same history window summarizeRankHistory reads.
 * First matching rule wins:
 *
 *   1. never checked / no history         -> "not enough data"
 *   2. latest check: not in the pack      -> "dropped out of the local pack"
 *   3. found, lost >= DROP_THRESHOLD      -> "dropped N positions" (names the
 *      positions over the window          top competitor above, when known)
 *   4. anything else (steady / improving) -> "stable/improving"
 *
 * `found` is the same tri-state used across the project: true = ranking,
 * false = checked and not in the pack, null = never checked. `competitors`
 * are the businesses ranking above this one (see lib/competitors.mjs); the
 * one with the best (lowest) position is named.
 *
 * @returns {{rule: "noData"|"droppedOut"|"dropped"|"stable", text: string}}
 */
export function selectRecommendation({ history, found, position, competitors }, { maxChecks = 5 } = {}) {
  const recent = Array.isArray(history) ? history.slice(-maxChecks) : [];
  if (recent.length === 0 || found === null || found === undefined) {
    return { rule: "noData", text: RECOMMENDATIONS.noData };
  }

  if (!found || position === null || position === undefined) {
    return { rule: "droppedOut", text: RECOMMENDATIONS.droppedOut };
  }

  const firstFound = recent.find((s) => s.position !== null);
  const startPosition = recent[0].position !== null ? recent[0].position : firstFound?.position;
  const lost = startPosition !== undefined ? position - startPosition : 0;
  if (lost >= DROP_THRESHOLD) {
    const top = (Array.isArray(competitors) ? competitors : [])
      .filter((c) => c && c.title)
      .sort((a, b) => a.position - b.position)[0];
    const lead = top
      ? `${top.title} currently ranks above you — consider matching their review count`
      : "Consider matching your top competitors' review counts";
    return {
      rule: "dropped",
      text: `You dropped ${lost} positions. ${lead} or updating your listing photos.`,
    };
  }

  return { rule: "stable", text: RECOMMENDATIONS.stable };
}
