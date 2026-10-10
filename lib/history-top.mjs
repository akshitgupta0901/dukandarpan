/**
 * "Who was on top at each check" for the rank-history chart -- pure, zero I/O, no SerpApi calls.
 *
 * Every check stores the full google_maps response (raw_results). For each point in a
 * business's rank history this finds the stored response from that same check and picks the
 * best-ranked listing that is NOT the business itself, so the chart can draw a faded second
 * line ("Top-ranked business at that check") and the tooltip can say "Rank #4. Mocha Meadow
 * Cafe was #1."
 *
 * When the business is itself #1 there is no one above it. We then show the NEXT-BEST
 * business (the runner-up at #2) instead of skipping the point, so the dashed line stays
 * continuous; `ownIsFirst` is set so the tooltip words it as "Next best", not "was #1".
 */
import { matchBusinessRank } from "./rank-matcher.mjs";

/** A snapshot is written moments after its raw response, so allow some slack when pairing them. */
export const RAW_MATCH_TOLERANCE_MS = 10 * 60 * 1000;

const isListing = (r) => r && typeof r.title === "string" && typeof r.position === "number";

/**
 * @param {Array<{ position: number, title: string }>} localResults a stored response's local_results (any order)
 * @param {string} businessName
 * @returns {{ name: string, position: number, ownIsFirst: boolean } | null}
 */
export function topCompetitorAt(localResults, businessName) {
  const items = (Array.isArray(localResults) ? localResults : []).filter(isListing).sort((a, b) => a.position - b.position);
  if (items.length === 0) return null;

  const own = matchBusinessRank({ local_results: items }, businessName);
  const others = own.found ? items.filter((_, i) => i !== own.matchedIndex) : items;
  const top = others[0];
  if (!top) return null;
  return { name: top.title, position: top.position, ownIsFirst: own.found && own.position < top.position };
}

/**
 * The stored response nearest in time to a check, within `toleranceMs`; null if none is close enough.
 * @param {Array<{ checkedAt: string|Date, results: Array }>} rawRows
 */
export function matchRawToCheck(rawRows, checkedAt, toleranceMs = RAW_MATCH_TOLERANCE_MS) {
  const target = new Date(checkedAt).getTime();
  if (!Number.isFinite(target)) return null;
  let best = null;
  let bestGap = Infinity;
  for (const row of Array.isArray(rawRows) ? rawRows : []) {
    const gap = Math.abs(new Date(row.checkedAt).getTime() - target);
    if (gap < bestGap) {
      best = row;
      bestGap = gap;
    }
  }
  return best && bestGap <= toleranceMs ? best : null;
}

/**
 * Adds `topCompetitor` ({name, position, ownIsFirst} or null) to every history point.
 * Points keep all their own fields, including the business's own `position`.
 */
export function attachTopCompetitors(history, rawRows, businessName, { toleranceMs = RAW_MATCH_TOLERANCE_MS } = {}) {
  return (Array.isArray(history) ? history : []).map((point) => {
    const raw = matchRawToCheck(rawRows, point.checkedAt, toleranceMs);
    return { ...point, topCompetitor: raw ? topCompetitorAt(raw.results, businessName) : null };
  });
}

/** Rows for the chart: the two series as numbers (null = a gap) plus what the tooltip needs. */
export function chartPoints(history) {
  return (Array.isArray(history) ? history : []).map((h) => ({
    checkedAt: h.checkedAt,
    position: typeof h.position === "number" ? h.position : null,
    topPosition: typeof h.topCompetitor?.position === "number" ? h.topCompetitor.position : null,
    topName: h.topCompetitor?.name ?? null,
    ownIsFirst: Boolean(h.topCompetitor?.ownIsFirst),
  }));
}

/**
 * The tooltip sentence for one check, e.g. "Oct 7: Rank #4. Mocha Meadow Cafe was #1."
 * @param {{ label: string, position: number|null, topName?: string|null, topPosition?: number|null, ownIsFirst?: boolean }} p
 */
export function describeCheck({ label, position, topName, topPosition, ownIsFirst }) {
  const own = typeof position === "number" ? `Rank #${position}.` : "Not in top 20.";
  if (!topName || typeof topPosition !== "number") return `${label}: ${own}`;
  const other = ownIsFirst ? `Next best: ${topName} (#${topPosition}).` : `${topName} was #${topPosition}.`;
  return `${label}: ${own} ${other}`;
}
