/**
 * "Share on WhatsApp" text (Step 5) -- pure, no backend. A short summary a shop
 * owner can send to a partner or staff: current rank, change since the last check,
 * the top competitor and, if one is cached, the recommendation. Opened as a
 * wa.me link, so nothing is sent anywhere until the person taps Send in WhatsApp.
 *
 * Sample (demo) data is labeled as such so it can't be passed on as real.
 */
export const SHARE_INSIGHT_MAX_CHARS = 280;

function changeText(trend, trendChange) {
  if (trend === "up") return trendChange ? ` (up ${trendChange} since the last check)` : " (up since the last check)";
  if (trend === "down") return trendChange ? ` (down ${trendChange} since the last check)` : " (down since the last check)";
  return "";
}

/** Cut at a word boundary with an ellipsis, never mid-word. */
export function truncateAtWord(text, max = SHARE_INSIGHT_MAX_CHARS) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * @param {{
 *   businessName: string, queryText?: string|null,
 *   found: boolean|null, position?: number|null,
 *   trend?: "up"|"down"|"flat"|null, trendChange?: number|null,
 *   topCompetitor?: { title: string, position: number }|null,
 *   insight?: string|null, isDemo?: boolean
 * }} input
 */
export function buildShareText({ businessName, queryText, found, position, trend, trendChange, topCompetitor, insight, isDemo }) {
  const search = queryText ? ` for "${queryText}"` : "";
  const lines = [];

  if (found === true) {
    lines.push(`${businessName} is #${position} on Google Maps${search}${changeText(trend, trendChange)}.`);
  } else if (found === false) {
    lines.push(`${businessName} is not in the top 20 on Google Maps${search}${changeText(trend, trendChange)}.`);
  } else {
    lines.push(`${businessName} hasn't been checked on Google Maps yet${search}.`);
  }

  if (found === true && position === 1) {
    lines.push("Nobody ranks above it right now.");
  } else if (topCompetitor?.title) {
    lines.push(`Top competitor: ${topCompetitor.title} (#${topCompetitor.position}).`);
  }

  const advice = truncateAtWord(insight);
  if (advice) lines.push("", advice);

  lines.push("", isDemo ? "Sent from DukanDarpan (sample data)" : "Sent from DukanDarpan");
  return (isDemo ? "[Sample data] " : "") + lines.join("\n");
}

/** The competitor ranked best (lowest position) in a list of { position, title }. */
export function pickTopCompetitor(competitors) {
  const list = (Array.isArray(competitors) ? competitors : []).filter((c) => c && c.title && typeof c.position === "number");
  if (list.length === 0) return null;
  return list.reduce((best, c) => (c.position < best.position ? c : best));
}

export function whatsAppUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
