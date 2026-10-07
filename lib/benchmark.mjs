/**
 * Competitor benchmark + listing health (Step 2) -- pure, zero I/O.
 *
 * From ONE stored google_maps response (raw_results.payload_json.local_results,
 * so no extra SerpApi credits) it compares a business with the top 3 listings
 * that are not itself: average rating, review count and price level, plus a
 * checklist of listing basics (website, claimed, phone, hours, online order or
 * delivery) with how many of the top 3 have each. The numbers are computed
 * here, never by the LLM, so the text can say "2 of the top 3 have a website,
 * you don't" and every figure is checkable.
 *
 * Like lib/rank-matcher.mjs and lib/alert-rule.mjs it has no dependencies on
 * the database, so it is tested offline (test/benchmark.test.mjs).
 */
import { matchBusinessRank } from "./rank-matcher.mjs";

export const TOP_N = 3;

export const CHECKLIST = [
  { key: "website", label: "Has a website" },
  { key: "claimed", label: "Listing is claimed by its owner" },
  { key: "phone", label: "Phone number listed" },
  { key: "hours", label: "Opening hours listed" },
  { key: "onlineOrder", label: "Online ordering or delivery" },
];

/**
 * 1 (cheap) to 4 (expensive), or null when the listing shows no price.
 * Handles "$$"-style symbols and rupee ranges like "₹200–400" (by the upper bound).
 */
export function priceLevel(item) {
  const price = typeof item?.price === "string" ? item.price.trim() : "";
  if (!price) return null;
  if (/^[$€£₹]{1,4}$/.test(price)) return price.length;
  const numbers = (price.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
  if (numbers.length === 0) return null;
  const upper = Math.max(...numbers);
  if (upper <= 200) return 1;
  if (upper <= 400) return 2;
  if (upper <= 1000) return 3;
  return 4;
}

/** "10:30 PM" from "Open · Closes 10:30 PM", or null. */
export function closingTime(item) {
  const m = /Closes (\d{1,2}(?::\d{2})?\s?[AP]M)/i.exec(String(item?.open_state ?? item?.hours ?? ""));
  return m ? m[1].replace(/\s+/g, " ").toUpperCase().replace(/(\d)(AM|PM)/, "$1 $2") : null;
}

export function listingHealth(item) {
  const orderOnline = Array.isArray(item?.order_online) ? item.order_online.length > 0 : Boolean(item?.order_online);
  return {
    website: Boolean(item?.website),
    claimed: item?.unclaimed_listing !== true,
    phone: Boolean(item?.phone),
    hours: Boolean(item?.hours || item?.open_state || (item?.operating_hours && Object.keys(item.operating_hours).length > 0)),
    onlineOrder: orderOnline || item?.service_options?.delivery === true,
  };
}

function toFacts(item) {
  return {
    title: item.title,
    position: item.position,
    rating: typeof item.rating === "number" ? item.rating : null,
    reviews: typeof item.reviews === "number" ? item.reviews : null,
    priceLevel: priceLevel(item),
    type: item.type ?? null,
    closes: closingTime(item),
    health: listingHealth(item),
  };
}

function mean(values, decimals) {
  const nums = values.filter((v) => typeof v === "number");
  if (nums.length === 0) return null;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const f = 10 ** decimals;
  return Math.round(avg * f) / f;
}

/**
 * @param {Array<object>} localResults google_maps local_results (any order)
 * @param {string} businessName the tracked business, matched the same way ranks are
 * @returns {{
 *   found: boolean,
 *   own: object|null,
 *   top: object[],
 *   averages: { rating: number|null, reviews: number|null, priceLevel: number|null },
 *   checklist: Array<{ key: string, label: string, you: boolean|null, topCount: number, topOf: number }>
 * }}
 */
export function buildBenchmark(localResults, businessName, { topN = TOP_N } = {}) {
  const items = Array.isArray(localResults) ? localResults.filter((r) => r && typeof r.title === "string") : [];
  const match = matchBusinessRank({ local_results: items }, businessName);
  const ownItem = match.found ? items[match.matchedIndex] : null;

  const top = items
    .filter((r) => r !== ownItem)
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
    .slice(0, topN)
    .map(toFacts);
  const own = ownItem ? toFacts(ownItem) : null;

  const averages = {
    rating: mean(top.map((t) => t.rating), 1),
    reviews: mean(top.map((t) => t.reviews), 0),
    priceLevel: mean(top.map((t) => t.priceLevel), 1),
  };

  const checklist = CHECKLIST.map(({ key, label }) => ({
    key,
    label,
    you: own ? own.health[key] : null,
    topCount: top.filter((t) => t.health[key]).length,
    topOf: top.length,
  }));

  return { found: Boolean(own), own, top, averages, checklist };
}
