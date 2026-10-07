
const FILLER_WORDS = new Set([
  "restaurant", "restaurants",
  "salon", "salons",
  "gym", "gyms",
  "cafe", "cafes", // "café" normalizes to "cafe" before this check
  "pvt", "private",
  "ltd", "limited",
  "and", // from "&"
]);

function normalize(str) {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents/diacritics: é -> e
    .replace(/&/g, " and ") // "&" -> "and" (dropped as a filler word next)
    .replace(/[^a-z0-9\s]/g, " ") // punctuation -> space, never delete-in-place
    // (deleting "&" outright would fuse "Toni&Guy" into "toniguy")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(normalized) {
  return normalized.length ? normalized.split(" ") : [];
}

/**
 * Target-side only: drop stray single letters and generic filler words.
 * Falls back to the un-stripped token list if stripping would remove every
 * token — a match should never be reduced to zero required tokens.
 */
function significantTargetTokens(name) {
  const allTokens = tokenize(normalize(name)).filter((w) => w.length > 1);
  const stripped = allTokens.filter((w) => !FILLER_WORDS.has(w));
  return stripped.length > 0 ? stripped : allTokens;
}

/**
 * Does every target token appear as a substring somewhere in the
 * candidate's normalized name? This is token-based, not a single
 * full-string substring test, so word order and extra words on the
 * candidate side don't break the match.
 */
function tokensContainedIn(targetTokens, candidateNormalized) {
  return targetTokens.every((tok) => candidateNormalized.includes(tok));
}

/**
 * Used only to rank *multiple* matching candidates against each other:
 * fraction of the candidate's own tokens accounted for by the target's
 * tokens. Higher = tighter match (an exact-name candidate outscores one
 * padded with an address or a second business name).
 */
function overlapScore(targetTokens, candidateNormalized) {
  const candidateTokens = tokenize(candidateNormalized);
  if (candidateTokens.length === 0) return 0;
  const targetSet = new Set(targetTokens);
  const hits = candidateTokens.filter((t) => targetSet.has(t)).length;
  return hits / candidateTokens.length;
}

/**
 * Match a business name against a google_maps engine response's
 * local_results[] and return its rank.
 *
 * @param {object} mapsResponse raw google_maps (type=search) JSON
 * @param {string} businessName
 * @returns {{
 *   found: boolean,
 *   position: number|null,
 *   matchedTitle: string|null,
 *   matchedIndex: number|null,
 *   ambiguous: boolean,
 *   allMatches: Array<{position:number, title:string}>
 * }}
 */
export function matchBusinessRank(mapsResponse, businessName) {
  const items = mapsResponse?.local_results ?? [];
  const targetTokens = significantTargetTokens(businessName);

  const matches = [];
  items.forEach((item, index) => {
    if (typeof item.title !== "string") return;
    const candidateNormalized = normalize(item.title);
    if (tokensContainedIn(targetTokens, candidateNormalized)) {
      matches.push({
        position: item.position,
        title: item.title,
        index,
        score: overlapScore(targetTokens, candidateNormalized),
      });
    }
  });

  if (matches.length === 0) {
    return {
      found: false,
      position: null,
      matchedTitle: null,
      matchedIndex: null,
      ambiguous: false,
      allMatches: [],
    };
  }

  // Best match = tightest overlap first, then lowest (best) position.
  const sorted = [...matches].sort(
    (a, b) => b.score - a.score || a.position - b.position
  );
  const best = sorted[0];

  return {
    found: true,
    position: best.position,
    matchedTitle: best.title,
    matchedIndex: best.index,
    ambiguous: matches.length > 1,
    allMatches: matches.map(({ position, title }) => ({ position, title })),
  };
}

export function inOrganicMapPack(organicResponse, businessName) {
  const raw = organicResponse?.local_results;
  const items = Array.isArray(raw) ? raw : raw?.places ?? [];
  const targetTokens = significantTargetTokens(businessName);

  for (const item of items) {
    if (typeof item.title !== "string") continue;
    if (tokensContainedIn(targetTokens, normalize(item.title))) {
      return { inMapPack: true, position: item.position, matchedTitle: item.title };
    }
  }
  return { inMapPack: false, position: null, matchedTitle: null };
}

/**
 * Every target token appears as a WHOLE word. Organic titles and links are long
 * and wordy, so the substring test used for map listings would match "Eato"
 * inside unrelated words; whole words keep that out.
 */
function wordsContainAll(targetTokens, text) {
  const words = new Set(tokenize(normalize(text)));
  return targetTokens.every((tok) => words.has(tok));
}

/** A site's own domain often fuses the name ("muscleengineer.in"), so also try the name with no spaces. */
function fusedNameInLink(targetTokens, link) {
  const fused = targetTokens.join("");
  if (fused.length < 6) return false; // too short to trust inside a URL
  return String(link).toLowerCase().replace(/[^a-z0-9]/g, "").includes(fused);
}

/**
 * Where does this business rank in the regular (organic) Google results?
 * Looks for the name, as whole words, in each result's title and link /
 * displayed_link; the first (best-ranked) match wins.
 *
 * @param {object} organicResponse raw `google` engine JSON
 * @param {string} businessName
 * @returns {{ found: boolean, position: number|null, matchedTitle: string|null, matchedLink: string|null }}
 */
export function matchOrganicRank(organicResponse, businessName) {
  const items = Array.isArray(organicResponse?.organic_results) ? organicResponse.organic_results : [];
  const targetTokens = significantTargetTokens(businessName);
  if (targetTokens.length === 0) return { found: false, position: null, matchedTitle: null, matchedLink: null };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== "object") continue;
    const link = [item.link, item.displayed_link].filter((l) => typeof l === "string").join(" ");
    const inTitle = typeof item.title === "string" && wordsContainAll(targetTokens, item.title);
    const inLink = link.length > 0 && (wordsContainAll(targetTokens, link) || fusedNameInLink(targetTokens, link));
    if (inTitle || inLink) {
      return {
        found: true,
        position: typeof item.position === "number" ? item.position : i + 1,
        matchedTitle: item.title ?? null,
        matchedLink: item.link ?? item.displayed_link ?? null,
      };
    }
  }
  return { found: false, position: null, matchedTitle: null, matchedLink: null };
}

// Exported for tests / callers that want the normalization primitives directly.
export { normalize, significantTargetTokens };
