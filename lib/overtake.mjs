/**
 * Overtake detection (Step 3) -- pure, zero I/O.
 *
 * Given the previous and the current google_maps local_results for one query
 * and a tracked business name, returns the competitors that were BEHIND that
 * business last time and are AHEAD of it now. Competitors are matched across
 * the two responses by place_id (title is the fallback when an id is missing),
 * so a renamed listing is still the same competitor.
 *
 * No alert for: a first-ever check (nothing to compare), a business that is not
 * in the top 20 now (no rank to be overtaken from), one that was not in the
 * top 20 before (every listing was already ahead of it, so nobody "overtook"), or
 * one whose NEW position is worse than OVERTAKE_MAX_POSITION (#10).
 * A competitor that was not in the previous top 20 at all counts as having been
 * behind. The result is capped, closest competitor first, to avoid alert spam.
 */
import { matchBusinessRank, normalize } from "./rank-matcher.mjs";

export const MAX_OVERTAKE_ALERTS = 2;

// Only alert when the business is still somewhere that matters: a shop sliding from #15 to #17
// is not news worth a message, but being passed while at #10 or better is.
export const OVERTAKE_MAX_POSITION = 10;

const hasPosition = (item) => item && typeof item.title === "string" && typeof item.position === "number";

function indexPrevious(items) {
  const byPlace = new Map();
  const byTitle = new Map();
  for (const item of items) {
    if (item.place_id) byPlace.set(item.place_id, item);
    const t = normalize(item.title);
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t).push(item);
  }
  return { byPlace, byTitle };
}

function findPrevious(item, { byPlace, byTitle }) {
  if (item.place_id && byPlace.has(item.place_id)) return byPlace.get(item.place_id);
  // Title fallback, but never across two different known place ids (e.g. two branches of one chain).
  return (byTitle.get(normalize(item.title)) ?? []).find((p) => !p.place_id || !item.place_id) ?? null;
}

/**
 * @param {Array<object>|null|undefined} previousResults previous local_results (null on a first-ever check)
 * @param {Array<object>|null|undefined} currentResults current local_results
 * @param {string} businessName
 * @param {{ limit?: number }} [opts]
 * @returns {Array<{ competitor: string, placeId: string|null, previousPosition: number|null,
 *                   position: number, yourPreviousPosition: number, yourPosition: number }>}
 */
export function detectOvertakes(previousResults, currentResults, businessName, { limit = MAX_OVERTAKE_ALERTS } = {}) {
  if (!Array.isArray(previousResults) || previousResults.length === 0) return [];
  if (!Array.isArray(currentResults) || currentResults.length === 0) return [];

  const previous = previousResults.filter(hasPosition);
  const current = currentResults.filter(hasPosition);

  const nowMine = matchBusinessRank({ local_results: current }, businessName);
  const beforeMine = matchBusinessRank({ local_results: previous }, businessName);
  if (!nowMine.found || !beforeMine.found) return [];
  if (nowMine.position > OVERTAKE_MAX_POSITION) return [];

  const previousIndex = indexPrevious(previous.filter((_, i) => i !== beforeMine.matchedIndex));
  const overtakes = [];

  current.forEach((item, i) => {
    if (i === nowMine.matchedIndex) return;
    if (item.position >= nowMine.position) return; // not ahead of the business now

    const before = findPrevious(item, previousIndex);
    const wasBehind = before === null || before.position > beforeMine.position;
    if (!wasBehind) return;

    overtakes.push({
      competitor: item.title,
      placeId: item.place_id ?? null,
      previousPosition: before ? before.position : null,
      position: item.position,
      yourPreviousPosition: beforeMine.position,
      yourPosition: nowMine.position,
    });
  });

  return overtakes.sort((a, b) => a.position - b.position).slice(0, limit);
}
