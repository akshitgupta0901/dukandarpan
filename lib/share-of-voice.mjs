/**
 * Share of Voice text (Step 4) -- pure.
 *
 * "Map Pack: #2 | Organic: #12": where a business shows up on the Google Maps
 * results and in the regular Google results, plus a one-line "visibility gap"
 * when the two disagree badly (good on the map, poor or absent in regular results).
 *
 * `found` is the project's usual tri-state (true / false / null = never checked).
 * `organicChecked` says whether any check ever ran the organic search, so a
 * business we never looked up is "not checked yet", never "not ranking".
 */
export const GOOD_MAP_RANK = 5; // this good or better on the map counts as a strong map presence
export const POOR_ORGANIC_RANK = 7; // regular-results rank this far down is easy to miss

export function describeShareOfVoice({ found, position, organicChecked, organicPosition }) {
  const mapText = found === true ? `#${position}` : found === false ? "Not in top 20" : "Not checked yet";

  let organicText;
  if (!organicChecked) organicText = "Not checked yet";
  else organicText = organicPosition ? `#${organicPosition}` : "Not ranking organically";

  let gap = null;
  const mapGood = found === true && position <= GOOD_MAP_RANK;
  if (mapGood && organicChecked) {
    if (!organicPosition) {
      gap = `You show up on the map at #${position}, but not in the regular Google results. People who skip the map won't find you.`;
    } else if (organicPosition >= POOR_ORGANIC_RANK) {
      gap = `You're #${position} on the map but only #${organicPosition} in the regular Google results, so you're easy to miss outside the map.`;
    }
  }

  return { mapText, organicText, gap, organicMissing: organicChecked && !organicPosition };
}
