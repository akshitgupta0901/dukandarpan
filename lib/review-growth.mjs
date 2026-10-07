/**
 * Competitor review growth (Step 3) -- pure, zero I/O.
 *
 * From the stored search responses for ONE query over the last week, works out
 * how many reviews each listing gained and how its rating moved ("gained 12
 * reviews this week"). It only reads responses that were already stored, so it
 * costs no SerpApi credits. Listings are matched across responses by place_id,
 * with the title as the fallback, like lib/overtake.mjs.
 *
 * The baseline for a listing is the EARLIEST response in the window that
 * contains it, so a competitor that only just entered the top 20 is measured
 * from when it first appeared, and one seen only in the latest response has no
 * growth figure at all (null), never a guessed zero.
 */
import { normalize } from "./rank-matcher.mjs";

export const GROWTH_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Stable key for a listing across responses. */
export function growthKey(item) {
  return item.place_id ? `id:${item.place_id}` : `title:${normalize(item.title ?? "")}`;
}

const isNumber = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * @param {Array<{ checkedAt: string|Date, results: Array<{place_id?: string, title: string, reviews?: number, rating?: number}> }>} history
 *   stored responses for one query, any order. The newest one is the "now" end of the window.
 * @returns {Map<string, { reviewsGained: number|null, ratingChange: number|null, since: string, days: number }>}
 */
export function computeReviewGrowth(history, { windowDays = GROWTH_WINDOW_DAYS } = {}) {
  const out = new Map();
  const sorted = (Array.isArray(history) ? history : [])
    .map((h) => ({ time: new Date(h.checkedAt).getTime(), checkedAt: new Date(h.checkedAt).toISOString(), results: Array.isArray(h.results) ? h.results : [] }))
    .filter((h) => Number.isFinite(h.time))
    .sort((a, b) => a.time - b.time);
  if (sorted.length < 2) return out;

  const latest = sorted[sorted.length - 1];
  const windowStart = latest.time - windowDays * DAY_MS;
  const earlier = sorted.slice(0, -1).filter((h) => h.time >= windowStart);
  if (earlier.length === 0) return out;

  // The earliest in-window response that contains each listing.
  const baselines = new Map();
  for (const h of earlier) {
    for (const r of h.results) {
      const key = growthKey(r);
      if (!baselines.has(key)) baselines.set(key, { r, h });
    }
  }

  for (const r of latest.results) {
    const base = baselines.get(growthKey(r));
    if (!base) continue;
    out.set(growthKey(r), {
      reviewsGained: isNumber(r.reviews) && isNumber(base.r.reviews) ? r.reviews - base.r.reviews : null,
      ratingChange: isNumber(r.rating) && isNumber(base.r.rating) ? Math.round((r.rating - base.r.rating) * 10) / 10 : null,
      since: base.h.checkedAt,
      days: Math.max(1, Math.round((latest.time - base.h.time) / DAY_MS)),
    });
  }
  return out;
}

/**
 * Short phrases for one competitor, e.g. ["gained 12 reviews this week", "rating up 0.2"].
 * Empty when there is nothing worth saying (no data, or no change).
 */
export function describeGrowth(growth) {
  if (!growth) return [];
  const parts = [];
  const span = growth.days >= 6 ? "this week" : `in ${growth.days} day${growth.days === 1 ? "" : "s"}`;
  if (isNumber(growth.reviewsGained) && growth.reviewsGained !== 0) {
    const n = Math.abs(growth.reviewsGained);
    parts.push(`${growth.reviewsGained > 0 ? "gained" : "lost"} ${n} review${n === 1 ? "" : "s"} ${span}`);
  }
  if (isNumber(growth.ratingChange) && growth.ratingChange !== 0) {
    parts.push(`rating ${growth.ratingChange > 0 ? "up" : "down"} ${Math.abs(growth.ratingChange).toFixed(1)}`);
  }
  return parts;
}
