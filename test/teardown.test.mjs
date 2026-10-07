import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildTeardownPrompt, checkTeardownText, splitSentences } from "../lib/teardown.mjs";
import { composeInsight } from "../lib/insight.mjs";
import { buildBenchmark } from "../lib/benchmark.mjs";
import { generateDemoData, HERO_NAME } from "../lib/demo-data.mjs";

const demo = generateDemoData({ endDate: "2026-10-07T12:00:00Z" });
const benchmark = buildBenchmark(demo.days[29].payload.local_results, HERO_NAME);
const QUERY = "cafe near Katpadi (demo)";
const built = buildTeardownPrompt(benchmark, { businessName: HERO_NAME, queryText: QUERY });
const { facts } = built;
const RULE = { text: "Rule-based fallback text." };
const KEY_ENV = { GEMINI_API_KEY: "test-key-NOT-REAL" };

// A grounded answer that uses only numbers from the fact sheet.
const GOOD = `You have ${benchmark.own.reviews} reviews while the top results average ${benchmark.averages.reviews}, and ${benchmark.checklist[0].topCount} of the top 3 have a website while you don't. The most useful fix is to add your website to your Google listing.`;

describe("buildTeardownPrompt", () => {
  test("the system prompt asks for exactly 2 plain sentences grounded only in the data", () => {
    assert.match(built.system, /exactly 2 sentences/);
    assert.match(built.system, /ONLY the data/);
    assert.match(built.system, /never calculate/);
    assert.match(built.system, /single most useful thing/);
    assert.match(built.system, /No jargon, no markdown/);
  });

  test("the user prompt carries the search and a compact JSON fact sheet", () => {
    assert.ok(built.prompt.includes(`"${QUERY}"`));
    const json = JSON.parse(built.prompt.slice(built.prompt.indexOf("{")));
    assert.deepEqual(json, facts);
  });

  test("facts have the owner's listing, 3 competitors, averages and the listing basics", () => {
    assert.equal(facts.you.name, HERO_NAME);
    assert.equal(facts.you.reviews, benchmark.own.reviews);
    assert.equal(facts.you.hasWebsite, false);
    assert.equal(facts.you.listingClaimed, false);
    assert.equal(facts.topCompetitors.length, 3);
    assert.equal(facts.topAverages.reviews, benchmark.averages.reviews);
    assert.equal(facts.listingBasics.length, 5);
    assert.match(facts.listingBasics[0].topCompetitorsWithIt, /^\d of 3$/);
  });

  test("prices are shown as rupee symbols, and only listing details are sent (no addresses, phones or URLs)", () => {
    assert.match(JSON.stringify(facts), /"price":"₹+"/);
    const text = built.prompt;
    assert.doesNotMatch(text, /Sample Nagar|\+91|\.example|DEMO_PLACE/);
  });

  test("an unranked business sends 'you: null'", () => {
    const none = buildTeardownPrompt(buildBenchmark(demo.days[29].payload.local_results, "Nobody"), { businessName: "Nobody", queryText: QUERY });
    assert.equal(none.facts.you, null);
  });
});

describe("splitSentences", () => {
  test("keeps decimals and 'PM.' endings intact", () => {
    assert.equal(splitSentences("You are rated 4.5 with 30 reviews. They close at 10 PM. Fix it.").length, 3);
    assert.deepEqual(splitSentences("Rated 4.5 overall. Add a website."), ["Rated 4.5 overall.", "Add a website."]);
  });
});

describe("checkTeardownText", () => {
  test("accepts exactly two plain sentences using only numbers from the data", () => {
    const r = checkTeardownText(GOOD, facts);
    assert.equal(r.ok, true, r.reason);
    assert.equal(r.text, GOOD);
  });

  test("strips wrapping quotes", () => {
    assert.equal(checkTeardownText(`"${GOOD}"`, facts).text, GOOD);
  });

  test("rejects empty, one-sentence and three-sentence answers", () => {
    assert.equal(checkTeardownText("", facts).ok, false);
    assert.equal(checkTeardownText(null, facts).ok, false);
    assert.match(checkTeardownText("Add a website to your listing.", facts).reason, /two sentences/);
    assert.match(checkTeardownText("Add a website. Claim your listing. Stay open later.", facts).reason, /two sentences/);
  });

  test("rejects markdown, lists and line breaks", () => {
    for (const bad of ["**Add** a website to your listing. Then claim it.", "- Add a website.\n- Claim it.", "Add a website.\nClaim your listing.", "# Tip\nAdd a website. Claim it."]) {
      assert.equal(checkTeardownText(bad, facts).ok, false, bad);
    }
  });

  test("rejects an answer with a number that was not in the data (invented or calculated)", () => {
    const r = checkTeardownText("You have 4242 reviews so far. Add a website to your listing.", facts);
    assert.equal(r.ok, false);
    assert.match(r.reason, /number not in the data: 4242/);
    // A computed ratio is also a number the data doesn't contain.
    assert.equal(checkTeardownText("Rivals have 99 times more reviews. Add a website.", facts).ok, false);
  });

  test("small counts like 'top 3' and '1 thing' are allowed", () => {
    assert.equal(checkTeardownText("The top 3 results all show more detail than you do. Fix 1 thing first: add a website.", facts).ok, true);
  });

  test("rejects an over-long answer", () => {
    assert.equal(checkTeardownText(`${"Words ".repeat(120)}end. Second one.`, facts).ok, false);
  });
});

describe("composeInsight (AI with rule-based fallback)", () => {
  const input = { rule: RULE, benchmark, businessName: HERO_NAME, queryText: QUERY };
  const silent = () => {};

  test("no API key: rule-based, and the model is never called", async () => {
    let called = 0;
    const out = await composeInsight(input, { env: {}, llmFn: async () => { called++; return GOOD; }, warn: silent });
    assert.deepEqual(out, { text: RULE.text, source: "rules", language: "en" });
    assert.equal(called, 0);
  });

  test("a valid answer is used and labeled 'ai'", async () => {
    const out = await composeInsight(input, { env: KEY_ENV, llmFn: async () => GOOD, warn: silent });
    assert.deepEqual(out, { text: GOOD, source: "ai", language: "en" });
  });

  test("the model receives the built system and user prompts", async () => {
    let seen;
    await composeInsight(input, { env: KEY_ENV, llmFn: async (p) => { seen = p; return GOOD; }, warn: silent });
    assert.equal(seen.system, built.system);
    assert.equal(seen.prompt, built.prompt);
  });

  test("a model error (timeout, HTTP 429...) falls back to rules without throwing", async () => {
    const warnings = [];
    const out = await composeInsight(input, { env: KEY_ENV, llmFn: async () => { throw new Error("Gemini request timed out after 12000 ms"); }, warn: (m) => warnings.push(m) });
    assert.deepEqual(out, { text: RULE.text, source: "rules", language: "en" });
    assert.match(warnings[0], /AI unavailable.*timed out/);
  });

  test("an off-format answer falls back to rules", async () => {
    const warnings = [];
    const out = await composeInsight(input, { env: KEY_ENV, llmFn: async () => "- add a website\n- claim it", warn: (m) => warnings.push(m) });
    assert.equal(out.source, "rules");
    assert.match(warnings[0], /rejected/);
  });

  test("an answer with an invented number falls back to rules", async () => {
    const out = await composeInsight(input, { env: KEY_ENV, llmFn: async () => "You have 77777 reviews. Add a website.", warn: silent });
    assert.equal(out.source, "rules");
  });

  test("an empty answer falls back to rules", async () => {
    assert.equal((await composeInsight(input, { env: KEY_ENV, llmFn: async () => "   ", warn: silent })).source, "rules");
  });

  test("a business that isn't in the top 20 (or has no benchmark) uses rules without calling the model", async () => {
    let called = 0;
    const llmFn = async () => { called++; return GOOD; };
    const unranked = buildBenchmark(demo.days[29].payload.local_results, "Nobody");
    assert.equal((await composeInsight({ ...input, benchmark: unranked }, { env: KEY_ENV, llmFn, warn: silent })).source, "rules");
    assert.equal((await composeInsight({ ...input, benchmark: null }, { env: KEY_ENV, llmFn, warn: silent })).source, "rules");
    assert.equal(called, 0);
  });
});

describe("Hinglish option", () => {
  const hi = buildTeardownPrompt(benchmark, { businessName: HERO_NAME, queryText: QUERY, language: "hinglish" });

  test("English is the default, and its prompt is unchanged by the option", () => {
    assert.equal(buildTeardownPrompt(benchmark, { businessName: HERO_NAME, queryText: QUERY, language: "en" }).system, built.system);
    assert.match(built.system, /plain, simple English/);
    assert.doesNotMatch(built.system, /Hinglish/);
  });

  test("the Hinglish prompt asks for Roman-script Hinglish, keeps every other rule, and sends the same data", () => {
    assert.match(hi.system, /Hinglish/);
    assert.match(hi.system, /Roman \(English\) alphabet/);
    assert.match(hi.system, /never in Devanagari/);
    assert.match(hi.system, /"aap"/);
    assert.match(hi.system, /exactly 2 sentences/);
    assert.match(hi.system, /ONLY the data/);
    assert.match(hi.system, /never calculate/);
    assert.doesNotMatch(hi.system, /plain, simple English/);
    assert.equal(hi.prompt, built.prompt);
    assert.deepEqual(hi.facts, facts);
  });

  test("normalizeLanguage: anything but 'hinglish' is English", async () => {
    const { normalizeLanguage } = await import("../lib/teardown.mjs");
    assert.equal(normalizeLanguage("hinglish"), "hinglish");
    assert.equal(normalizeLanguage(" HINGLISH "), "hinglish");
    for (const v of ["en", "", null, undefined, "hindi", "fr", 7]) assert.equal(normalizeLanguage(v), "en");
  });

  const HINGLISH_GOOD = `Aapke ${benchmark.own.reviews} reviews hain jabki top results ka average ${benchmark.averages.reviews} hai, aur top 3 mein se ${benchmark.checklist[0].topCount} ke paas website hai. Sabse pehle apni listing mein website add kijiye.`;

  test("a Roman-script Hinglish answer that uses only the data's numbers is accepted", () => {
    const r = checkTeardownText(HINGLISH_GOOD, facts, { language: "hinglish" });
    assert.equal(r.ok, true, r.reason);
  });

  test("an answer in Devanagari is rejected when Hinglish was asked for", () => {
    const r = checkTeardownText("आपके पास कम reviews हैं। अपनी listing में website जोड़ें।", facts, { language: "hinglish" });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "wrong script");
  });

  test("Hinglish answers still go through the same two-sentence and invented-number checks", () => {
    assert.equal(checkTeardownText("Aapke paas reviews kam hain.", facts, { language: "hinglish" }).ok, false);
    assert.equal(checkTeardownText("Aapke 99999 reviews hain. Website add kijiye.", facts, { language: "hinglish" }).ok, false);
  });

  test("composeInsight passes the language to the prompt and returns it", async () => {
    let seen;
    const out = await composeInsight(
      { rule: RULE, benchmark, businessName: HERO_NAME, queryText: QUERY, language: "hinglish" },
      { env: KEY_ENV, llmFn: async (p) => { seen = p; return HINGLISH_GOOD; }, warn: () => {} }
    );
    assert.equal(seen.system, hi.system);
    assert.deepEqual(out, { text: HINGLISH_GOOD, source: "ai", language: "hinglish" });
  });

  test("the rule-based fallback is always English, even when Hinglish was asked for", async () => {
    for (const llmFn of [async () => { throw new Error("down"); }, async () => "आपके लिए। सुझाव।", async () => "one sentence only"]) {
      const out = await composeInsight(
        { rule: RULE, benchmark, businessName: HERO_NAME, queryText: QUERY, language: "hinglish" },
        { env: KEY_ENV, llmFn, warn: () => {} }
      );
      assert.deepEqual(out, { text: RULE.text, source: "rules", language: "en" });
    }
    // and with no key at all
    const noKey = await composeInsight({ rule: RULE, benchmark, businessName: HERO_NAME, queryText: QUERY, language: "hinglish" }, { env: {}, warn: () => {} });
    assert.equal(noKey.language, "en");
  });

  test("an English request returns language 'en'", async () => {
    const out = await composeInsight({ rule: RULE, benchmark, businessName: HERO_NAME, queryText: QUERY }, { env: KEY_ENV, llmFn: async () => GOOD, warn: () => {} });
    assert.equal(out.language, "en");
  });
});

describe("insight cache is keyed by language", () => {
  test("a cached text is only usable for the same language; NULL (older rows) counts as English", async () => {
    const { cacheMatchesLanguage, cacheLanguage } = await import("../lib/insight.mjs");
    assert.equal(cacheMatchesLanguage("en", "en"), true);
    assert.equal(cacheMatchesLanguage(null, "en"), true);
    assert.equal(cacheMatchesLanguage(undefined, undefined), true);
    assert.equal(cacheMatchesLanguage("hinglish", "hinglish"), true);
    assert.equal(cacheMatchesLanguage("en", "hinglish"), false);
    assert.equal(cacheMatchesLanguage("hinglish", "en"), false);
    assert.equal(cacheMatchesLanguage(null, "hinglish"), false);
    assert.equal(cacheMatchesLanguage("hinglish", "something-else"), false); // unknown request = English
    assert.equal(cacheLanguage(null), "en");
    assert.equal(cacheLanguage("hinglish"), "hinglish");
  });
});
