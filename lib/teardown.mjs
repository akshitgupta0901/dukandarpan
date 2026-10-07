/**
 * The AI competitor teardown's prompt and answer checks (Step 2) -- pure.
 *
 * buildTeardownPrompt turns a benchmark (lib/benchmark.mjs) into a compact JSON
 * fact sheet plus instructions. checkTeardownText then refuses any answer that
 * is not exactly two plain sentences or that contains a number that was not in
 * the fact sheet, so a model that "calculates" or invents figures is dropped
 * and lib/insight.mjs falls back to the rule-based text. The model is told to
 * copy numbers, never compute them, because everything it needs is precomputed.
 */

const SYSTEM_PROMPT = [
  "You are a friendly local-business advisor writing for the owner of a small shop in India. The owner is not technical.",
  "Use ONLY the data in the JSON the user sends. Write exactly 2 sentences in plain, simple English.",
  "Sentence 1: what the owner's listing is missing compared with the top results on Google Maps, with the specific numbers.",
  "Sentence 2: the single most useful thing to fix first.",
  "Rules: copy numbers exactly as they appear in the data and never calculate, round or estimate new numbers.",
  "Do not mention anything that is not in the data. No jargon, no markdown, no lists, no emojis.",
  'Speak to the owner directly with "you" and "your".',
].join(" ");

const RUPEES = ["", "₹", "₹₹", "₹₹₹", "₹₹₹₹"];

function listingFacts(l) {
  return {
    name: l.title,
    rank: l.position,
    rating: l.rating,
    reviews: l.reviews,
    price: l.priceLevel ? RUPEES[l.priceLevel] : null,
    type: l.type,
    closes: l.closes,
    hasWebsite: l.health.website,
    listingClaimed: l.health.claimed,
    hasPhone: l.health.phone,
    takesOnlineOrders: l.health.onlineOrder,
  };
}

/**
 * @returns {{ system: string, prompt: string, facts: object }} `facts` is what the answer is checked against.
 */
export function buildTeardownPrompt(benchmark, { businessName, queryText }) {
  const facts = {
    search: queryText,
    you: benchmark.own ? { ...listingFacts(benchmark.own), name: businessName } : null,
    topCompetitors: benchmark.top.map(listingFacts),
    topAverages: {
      rating: benchmark.averages.rating,
      reviews: benchmark.averages.reviews,
      price: benchmark.averages.priceLevel,
    },
    listingBasics: benchmark.checklist.map((c) => ({
      item: c.label,
      you: c.you,
      topCompetitorsWithIt: `${c.topCount} of ${c.topOf}`,
    })),
  };
  return {
    system: SYSTEM_PROMPT,
    prompt: `Google Maps search: "${queryText}".\nData:\n${JSON.stringify(facts)}`,
    facts,
  };
}

/** Every number written in `text`, normalised ("1,480" -> "1480", "4.50" -> "4.5"). */
function numbersIn(text) {
  return (String(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(Number(n.replace(/,/g, ""))));
}

/** Sentences split at . ! ? followed by whitespace and a capital letter, quote or digit (so "4.5" and "7 PM." stay whole). */
export function splitSentences(text) {
  return text.trim().split(/(?<=[.!?])\s+(?=[A-Z"'“₹\d])/).map((s) => s.trim()).filter(Boolean);
}

/**
 * @returns {{ ok: true, text: string } | { ok: false, reason: string }}
 */
export function checkTeardownText(raw, facts) {
  const text = String(raw ?? "").trim().replace(/^["“]|["”]$/g, "").trim();
  if (!text) return { ok: false, reason: "empty" };
  if (text.length > 600) return { ok: false, reason: "too long" };
  if (/[\n\r]|^\s*[-*•#>]|\*\*|`|^\d+\.\s/m.test(text)) return { ok: false, reason: "has formatting" };
  if (splitSentences(text).length !== 2) return { ok: false, reason: "not exactly two sentences" };

  // Grounding: numbers must come from the fact sheet (plus 1 to 3, as in "top 3" or "1 thing").
  const allowed = new Set([...numbersIn(JSON.stringify(facts)), "1", "2", "3"]);
  const invented = numbersIn(text).filter((n) => !allowed.has(n));
  if (invented.length > 0) return { ok: false, reason: `number not in the data: ${invented[0]}` };

  return { ok: true, text };
}
