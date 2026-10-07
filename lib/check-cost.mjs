/**
 * How many SerpApi searches one check costs. The google_maps search always runs
 * (1 credit). The organic google search (the regular results, for Share of Voice)
 * runs only when the caller wants it AND the query has a location_text to send
 * as SerpApi's `location` -- without one we skip it rather than guess a place.
 * The daily cron is maps-only; a manual "Run check now" asks for both.
 *
 * Shared by lib/run-check.mjs (what it does) and the UI (what the button says),
 * so the two cannot drift apart.
 */
export function organicApplies({ includeOrganic, locationText }) {
  return Boolean(includeOrganic) && typeof locationText === "string" && locationText.trim().length > 0;
}

export function checkCredits({ includeOrganic, locationText }) {
  return organicApplies({ includeOrganic, locationText }) ? 2 : 1;
}

/** What the "Run check now" button costs, from the business's `organicEnabled` flag (see app/api/businesses). */
export function manualCheckCredits(organicEnabled) {
  return checkCredits({ includeOrganic: true, locationText: organicEnabled ? "set" : null });
}
