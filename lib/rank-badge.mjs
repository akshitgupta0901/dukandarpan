/**
 * Rank -> status badge (pure). The one place that decides how a rank is colour-coded, so the
 * business table, the Share of Voice card and anything added later all agree:
 *
 *   #1          gold   🏆
 *   #2 to #3    green  🏆
 *   #4 to #10   amber
 *   #11 to #20  neutral
 *   not ranking crimson ⚠️   ("Not in top 20" on the map, "Not ranking organically" in regular results)
 *   not checked muted        (never looked up, so nothing is claimed about it)
 *
 * Colour is never the only signal: every badge has a text label, and the 🏆 / ⚠️ icons are extra.
 */
import { MAPS_RESULTS_LIMIT } from "./rank-limit.mjs";

export const TONES = ["gold", "green", "amber", "neutral", "crimson", "muted"];

const isRank = (n) => Number.isInteger(n) && n >= 1;

/**
 * @param {{ position?: number|null, checked?: boolean, kind?: "map"|"organic" }} input
 *   `checked: false` means the thing was never looked up (not the same as "not ranking").
 * @returns {{ tone: "gold"|"green"|"amber"|"neutral"|"crimson"|"muted", label: string, icon: string|null }}
 */
export function rankBadge({ position, checked = true, kind = "map" } = {}) {
  if (!checked) return { tone: "muted", label: "Not checked yet", icon: null };

  const notRanking = {
    tone: "crimson",
    label: kind === "organic" ? "Not ranking organically" : `Not in top ${MAPS_RESULTS_LIMIT}`,
    icon: "⚠️",
  };
  if (!isRank(position) || position > MAPS_RESULTS_LIMIT) return notRanking;

  const label = `#${position}`;
  if (position === 1) return { tone: "gold", label, icon: "🏆" };
  if (position <= 3) return { tone: "green", label, icon: "🏆" };
  if (position <= 10) return { tone: "amber", label, icon: null };
  return { tone: "neutral", label, icon: null };
}

/** The map rank from the project's tri-state `found` (true = ranking, false = not in the top 20, null = never checked). */
export function mapRankBadge({ found, position }) {
  if (found === true) return rankBadge({ position, kind: "map" });
  if (found === false) return rankBadge({ position: null, kind: "map" });
  return rankBadge({ checked: false, kind: "map" });
}

/** The organic rank; `checked` is whether any check ever ran the organic search. */
export function organicRankBadge({ checked, position }) {
  return rankBadge({ position, checked: Boolean(checked), kind: "organic" });
}
