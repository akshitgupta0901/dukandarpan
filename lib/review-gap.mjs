/**
 * The review gap between a business and a competitor -- pure, zero I/O.
 *
 *   reviewGap(30, 543)   -> behind by 513, your reviews are 6% of theirs
 *   reviewGap(600, 543)  -> ahead by 57 (the bar is simply full)
 *   reviewGap(543, 543)  -> equal
 *   reviewGap(null, 543) -> unknown: shows nothing, never a guess
 *
 * Both counts come straight from the stored SerpApi response (the competitor's from its own
 * listing, the business's from its own listing in the same response).
 */
import { matchBusinessRank } from "./rank-matcher.mjs";

/** A usable review count: a finite number, zero or more. Anything else (missing, NaN, "12", negative) is unknown. */
const isCount = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;

/**
 * @returns {{ state: "behind"|"ahead"|"equal"|"unknown", delta: number|null, share: number|null, percent: number|null }}
 *   delta is always positive (the direction is in `state`); share is own/their capped at 1, or null
 *   when it can't mean anything (nobody has a review); percent is share as a whole number.
 */
export function reviewGap(ownReviews, theirReviews) {
  if (!isCount(ownReviews) || !isCount(theirReviews)) return { state: "unknown", delta: null, share: null, percent: null };

  if (ownReviews === theirReviews) {
    const share = theirReviews === 0 ? null : 1; // two zeros: nothing to compare, so no bar
    return { state: "equal", delta: 0, share, percent: share === null ? null : 100 };
  }
  if (ownReviews > theirReviews) {
    return { state: "ahead", delta: ownReviews - theirReviews, share: 1, percent: 100 };
  }
  const share = ownReviews / theirReviews; // theirs is > 0 here, because own >= 0 and own < theirs
  return { state: "behind", delta: theirReviews - ownReviews, share, percent: Math.round(share * 100) };
}

/** "you are behind by 412" / "you are ahead by 57" / "you have the same number of reviews"; null when unknown. */
export function describeReviewGap(gap, formatNumber = String) {
  if (gap.state === "behind") return `you are behind by ${formatNumber(gap.delta)}`;
  if (gap.state === "ahead") return `you are ahead by ${formatNumber(gap.delta)}`;
  if (gap.state === "equal") return "you have the same number of reviews";
  return null;
}

/** "6%", or "<1%" when you have some reviews but rounding would say 0%. */
export function formatSharePercent(gap, ownReviews) {
  if (gap.percent === null) return null;
  return gap.percent === 0 && ownReviews > 0 ? "<1%" : `${gap.percent}%`;
}

/** The business's own review count in a stored response, or null if it isn't in it or shows no count. */
export function ownReviewCount(localResults, businessName) {
  const items = Array.isArray(localResults) ? localResults.filter((r) => r && typeof r.title === "string") : [];
  const match = matchBusinessRank({ local_results: items }, businessName);
  if (!match.found) return null;
  const reviews = items[match.matchedIndex]?.reviews;
  return isCount(reviews) ? reviews : null;
}
