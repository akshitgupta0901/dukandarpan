/**
 * Competitor teardown (Step 2, deterministic) -- pure, zero I/O, no network.
 *
 * writeTeardown turns a benchmark (lib/benchmark.mjs, which is built from a
 * SerpApi response already stored in the database) into exactly two sentences,
 * in English or Hinglish (Roman script only, never Devanagari):
 *
 *   1. the biggest gaps against the top listings, quoting the benchmark's own
 *      numbers (reviews vs the top average, rating, closing time, how many of
 *      the top have a website / phone / hours / online ordering), and
 *   2. the single most useful thing to fix first, chosen by a FIXED priority:
 *        reviews below 50% of the top average
 *        -> unclaimed listing
 *        -> no website (while a top listing has one)
 *        -> no phone or no opening hours (while a top listing has them)
 *        -> no online ordering or delivery (while a top listing has it)
 *        -> otherwise "you are competitive, keep collecting reviews".
 *
 * Every number in the text is copied from the benchmark; nothing is computed
 * except comparisons (is a number lower?) that decide WHICH gaps to mention.
 * Same input, same text, every time.
 */

export const LANGUAGES = ["en", "hinglish"];

/** Anything unrecognised is English. */
export function normalizeLanguage(language) {
  return String(language ?? "").trim().toLowerCase() === "hinglish" ? "hinglish" : "en";
}

/** Reviews below this share of the top average are the first thing to fix. */
export const LOW_REVIEWS_RATIO = 0.5;
export const MAX_GAPS_IN_SENTENCE = 3;

const isNumber = (n) => typeof n === "number" && Number.isFinite(n);

/** Minutes after midnight for "10:30 PM" or "7 PM"; null if unreadable. */
function closingMinutes(text) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/i.exec(String(text ?? "").trim());
  if (!m) return null;
  return ((Number(m[1]) % 12) + (m[3].toUpperCase() === "PM" ? 12 : 0)) * 60 + Number(m[2] ?? 0);
}

function checklistEntry(benchmark, key) {
  return benchmark.checklist.find((c) => c.key === key) ?? { you: null, topCount: 0, topOf: benchmark.top.length };
}

/**
 * The gaps, in the order they are mentioned. The first six are the fix priority
 * (reviews, claimed, website, phone, hours, onlineOrder); the last three
 * (reviewsBelow, rating, closing) are worth stating but never the "fix first".
 * A basic (website, phone, hours, online ordering) only counts as a gap when at
 * least one top listing has it: nobody can be behind on something no one offers.
 */
function findGaps(benchmark) {
  const own = benchmark.own;
  const avg = benchmark.averages;
  const gaps = [];

  const reviewsKnown = isNumber(own.reviews) && isNumber(avg.reviews) && avg.reviews > 0;
  const reviewsLow = reviewsKnown && own.reviews < LOW_REVIEWS_RATIO * avg.reviews;
  if (reviewsLow) gaps.push({ key: "reviews", own: own.reviews, avg: avg.reviews });

  if (!own.health.claimed) gaps.push({ key: "claimed", topClaimed: checklistEntry(benchmark, "claimed").topCount });

  for (const key of ["website", "phone", "hours", "onlineOrder"]) {
    const c = checklistEntry(benchmark, key);
    if (!own.health[key] && c.topCount >= 1) gaps.push({ key, topCount: c.topCount });
  }

  if (reviewsKnown && !reviewsLow && own.reviews < avg.reviews) {
    gaps.push({ key: "reviewsBelow", own: own.reviews, avg: avg.reviews });
  }
  if (isNumber(own.rating) && isNumber(avg.rating) && own.rating < avg.rating) {
    gaps.push({ key: "rating", own: own.rating, avg: avg.rating });
  }

  const topCloses = benchmark.top.map((t) => t.closes).filter((c) => closingMinutes(c) !== null);
  const ownClose = closingMinutes(own.closes);
  if (ownClose !== null && topCloses.length > 0) {
    const mins = topCloses.map(closingMinutes);
    if (ownClose < Math.min(...mins)) {
      gaps.push({
        key: "closing",
        own: own.closes,
        earliest: topCloses[mins.indexOf(Math.min(...mins))],
        latest: topCloses[mins.indexOf(Math.max(...mins))],
      });
    }
  }
  return gaps;
}

/** The single thing to fix first, by the fixed priority above. */
function pickFocus(gaps) {
  const keys = new Set(gaps.map((g) => g.key));
  if (keys.has("reviews")) return "reviews";
  if (keys.has("claimed")) return "claimed";
  if (keys.has("website")) return "website";
  if (keys.has("phone") || keys.has("hours")) return "contact";
  if (keys.has("onlineOrder")) return "onlineOrder";
  return "competitive";
}

// ---------------------------------------------------------------------------
// Wording. Only ASCII, so Hinglish can never come out in Devanagari.
// ---------------------------------------------------------------------------

function topWords(k, lang) {
  if (lang === "hinglish") return k === 1 ? "top listing" : `top ${k}`;
  return k === 1 ? "the top listing" : `the top ${k}`;
}

const CLAUSES = {
  en: {
    reviews: (g, k) => (k === 1 ? `you have ${g.own} reviews while the top listing has ${g.avg}` : `you have ${g.own} reviews while the top ${k} average ${g.avg}`),
    reviewsBelow: (g, k) => (k === 1 ? `you have ${g.own} reviews while the top listing has ${g.avg}` : `you have ${g.own} reviews while the top ${k} average ${g.avg}`),
    rating: (g, k) => (k === 1 ? `your rating is ${g.own} against ${g.avg} for the top listing` : `your rating is ${g.own} against the top ${k} average of ${g.avg}`),
    claimed: (g, k) => (g.topClaimed >= 1 ? `your listing is unclaimed while ${g.topClaimed} of the top ${k} are claimed` : "your listing is unclaimed"),
    website: (g, k) => (k === 1 ? "the top listing has a website and you don't" : `${g.topCount} of the top ${k} have a website and you don't`),
    phone: (g, k) => (k === 1 ? "you have no phone number listed while the top listing does" : `you have no phone number listed while ${g.topCount} of the top ${k} do`),
    hours: (g, k) => (k === 1 ? "you have no opening hours listed while the top listing does" : `you have no opening hours listed while ${g.topCount} of the top ${k} do`),
    onlineOrder: (g, k) => (k === 1 ? "the top listing offers online ordering or delivery and you don't" : `${g.topCount} of the top ${k} offer online ordering or delivery and you don't`),
    closing: (g) => (g.earliest === g.latest ? `you close at ${g.own} while the top listings close at ${g.latest}` : `you close at ${g.own} while the top listings close between ${g.earliest} and ${g.latest}`),
  },
  hinglish: {
    reviews: (g, k) => (k === 1 ? `aapke ${g.own} reviews hain jabki top listing ke ${g.avg} hain` : `aapke ${g.own} reviews hain jabki top ${k} ka average ${g.avg} hai`),
    reviewsBelow: (g, k) => (k === 1 ? `aapke ${g.own} reviews hain jabki top listing ke ${g.avg} hain` : `aapke ${g.own} reviews hain jabki top ${k} ka average ${g.avg} hai`),
    rating: (g, k) => (k === 1 ? `aapki rating ${g.own} hai jabki top listing ki ${g.avg} hai` : `aapki rating ${g.own} hai jabki top ${k} ka average ${g.avg} hai`),
    claimed: (g, k) => (g.topClaimed >= 1 ? `aapki listing claim nahi hui hai jabki top ${k} mein se ${g.topClaimed} claimed hain` : "aapki listing claim nahi hui hai"),
    website: (g, k) => (k === 1 ? "top listing ke paas website hai aur aapke paas nahi hai" : `top ${k} mein se ${g.topCount} ke paas website hai aur aapke paas nahi hai`),
    phone: (g, k) => (k === 1 ? "aapka phone number listed nahi hai jabki top listing ka hai" : `aapka phone number listed nahi hai jabki top ${k} mein se ${g.topCount} ka hai`),
    hours: (g, k) => (k === 1 ? "aapke opening hours listed nahi hain jabki top listing ke hain" : `aapke opening hours listed nahi hain jabki top ${k} mein se ${g.topCount} ke hain`),
    onlineOrder: (g, k) => (k === 1 ? "top listing online ordering ya delivery deti hai aur aap nahi dete" : `top ${k} mein se ${g.topCount} online ordering ya delivery dete hain aur aap nahi dete`),
    closing: (g) => (g.earliest === g.latest ? `aap ${g.own} par band karte hain jabki top listings ${g.latest} par band hoti hain` : `aap ${g.own} par band karte hain jabki top listings ${g.earliest} se ${g.latest} ke beech band hoti hain`),
  },
};

const FIXES = {
  en: {
    reviews: "The most useful fix is to get more reviews: ask happy customers for a Google review at the counter, and reply to every one.",
    claimed: "The most useful fix is to claim your Google Business Profile, so you control your hours, photos and details.",
    website: "The most useful fix is to add a website link to your Google listing, even a simple one-page site, so customers can see your menu and details.",
    phone: "The most useful fix is to add your phone number to your Google listing, so customers can call you.",
    hours: "The most useful fix is to add your opening hours to your Google listing, so customers know when you are open.",
    contact: "The most useful fix is to add your phone number and opening hours to your Google listing, so customers can reach you and know when you are open.",
    onlineOrder: "The most useful fix is to turn on online ordering or delivery on your Google listing, so customers can order without visiting.",
    competitive: "You are competitive with the top listings, so keep collecting reviews and replying to them.",
  },
  hinglish: {
    reviews: "Sabse zaroori kaam hai reviews badhana: khush customers se counter par Google review maangiye aur har review ka jawab dijiye.",
    claimed: "Sabse zaroori kaam hai apni Google Business Profile claim karna, taaki aapke hours, photos aur details aapke control mein rahein.",
    website: "Sabse zaroori kaam hai apni Google listing mein website ka link jodna, chahe ek simple one-page site ho, taaki customers menu aur details dekh sakein.",
    phone: "Sabse zaroori kaam hai apni Google listing mein phone number jodna, taaki customers aapko call kar sakein.",
    hours: "Sabse zaroori kaam hai apni Google listing mein opening hours jodna, taaki customers ko pata rahe aap kab khule hain.",
    contact: "Sabse zaroori kaam hai apni Google listing mein phone number aur opening hours jodna, taaki customers aapse baat kar sakein aur jaan sakein aap kab khule hain.",
    onlineOrder: "Sabse zaroori kaam hai apni Google listing par online ordering ya delivery on karna, taaki customers bina aaye order kar sakein.",
    competitive: "Aap top listings ke saath competitive hain, isliye reviews jama karte rahiye aur unka jawab dete rahiye.",
  },
};

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinClauses(clauses, lang) {
  if (clauses.length === 1) return clauses[0];
  const and = lang === "hinglish" ? "aur" : "and";
  if (clauses.length === 2) return lang === "hinglish" ? `${clauses[0]} ${and} ${clauses[1]}` : `${clauses[0]}, ${and} ${clauses[1]}`;
  const head = clauses.slice(0, -1).join(", ");
  return lang === "hinglish" ? `${head} ${and} ${clauses[clauses.length - 1]}` : `${head}, ${and} ${clauses[clauses.length - 1]}`;
}

/** "the top 3 average of 4.5" / "top 3 ke average 4.5": how a number from the top listings is referred to. */
function topRef(k, lang, value) {
  if (lang === "hinglish") return k === 1 ? `top listing ke ${value}` : `top ${k} ke average ${value}`;
  return k === 1 ? `the top listing's ${value}` : `the top ${k} average of ${value}`;
}

/** What is going well, from the same numbers: used when there are no gaps, or room is left in the sentence. */
function strengthClauses(benchmark, lang) {
  const own = benchmark.own;
  const avg = benchmark.averages;
  const k = benchmark.top.length;
  const out = [];
  if (isNumber(own.rating) && isNumber(avg.rating) && own.rating > avg.rating) {
    out.push(
      lang === "hinglish"
        ? `aapki rating ${own.rating} hai jo ${topRef(k, lang, avg.rating)} se zyada hai`
        : `your rating of ${own.rating} is above ${topRef(k, lang, avg.rating)}`
    );
  }
  if (isNumber(own.reviews) && isNumber(avg.reviews) && own.reviews >= avg.reviews) {
    out.push(
      lang === "hinglish"
        ? `aapke ${own.reviews} reviews ${topRef(k, lang, avg.reviews)} ke barabar ya usse zyada hain`
        : `your ${own.reviews} reviews match or beat ${topRef(k, lang, avg.reviews)}`
    );
  }
  return out;
}

/**
 * @param {object|null} benchmark from lib/benchmark.mjs buildBenchmark
 * @param {{ businessName?: string, language?: string }} [opts] `businessName` is accepted for callers' convenience; the
 *   teardown speaks to the owner ("you"), so it is not used in the text.
 * @returns {null | { text: string, sentences: [string, string], language: "en"|"hinglish",
 *                    focus: "reviews"|"claimed"|"website"|"contact"|"onlineOrder"|"competitive",
 *                    gaps: string[] }}
 *   null when there is nothing to compare: the business is not in the results, or no other listing is.
 */
export function writeTeardown(benchmark, { language = "en" } = {}) {
  if (!benchmark || !benchmark.found || !benchmark.own || !Array.isArray(benchmark.top) || benchmark.top.length === 0) {
    return null;
  }
  const lang = normalizeLanguage(language);
  const k = benchmark.top.length;
  const gaps = findGaps(benchmark);
  const focus = pickFocus(gaps);

  let first;
  if (gaps.length === 0) {
    const strengths = strengthClauses(benchmark, lang);
    if (strengths.length > 0) {
      first = lang === "hinglish"
        ? `Aap top ${k === 1 ? "listing" : k} ke saath barabari par hain: ${joinClauses(strengths, lang)}`
        : `You are keeping pace with ${topWords(k, lang)}: ${joinClauses(strengths, lang)}`;
    } else {
      first = lang === "hinglish"
        ? `Aap top ${k === 1 ? "listing" : k} ke saath un basic cheezon mein barabari par hain jo hum check karte hain`
        : `You are keeping pace with ${topWords(k, lang)} on the basics we check`;
    }
  } else {
    const clauses = gaps.slice(0, MAX_GAPS_IN_SENTENCE).map((g) => CLAUSES[lang][g.key](g, k));
    // Room left in the sentence: say what is going well too (e.g. a rating above the top average).
    if (clauses.length < MAX_GAPS_IN_SENTENCE) clauses.push(...strengthClauses(benchmark, lang).slice(0, MAX_GAPS_IN_SENTENCE - clauses.length));
    first = capitalize(joinClauses(clauses, lang));
  }

  // "contact" covers a missing phone and/or missing hours: word the fix for what is actually missing.
  let fixKey = focus;
  if (focus === "contact") {
    const missing = new Set(gaps.map((g) => g.key));
    fixKey = missing.has("phone") && missing.has("hours") ? "contact" : missing.has("phone") ? "phone" : "hours";
  }

  const sentences = [`${first}.`, FIXES[lang][fixKey]];
  return { text: sentences.join(" "), sentences, language: lang, focus, gaps: gaps.map((g) => g.key) };
}
