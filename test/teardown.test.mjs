import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeTeardown, normalizeLanguage, LOW_REVIEWS_RATIO } from "../lib/teardown.mjs";
import { composeInsight, cacheMatchesLanguage, cacheLanguage } from "../lib/insight.mjs";
import { buildBenchmark } from "../lib/benchmark.mjs";
import { generateDemoData, HERO_NAME } from "../lib/demo-data.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGS = ["en", "hinglish"];

// ---------------------------------------------------------------------------
// A synthetic search: three strong competitors (300 reviews, 4.5 stars, everything
// listed, open until 10 PM) and one listing that is "you". Override either side.
// ---------------------------------------------------------------------------
const STRONG = {
  rating: 4.5,
  reviews: 300,
  website: "https://x.example",
  phone: "+91 0",
  hours: "Open · Closes 10 PM",
  open_state: "Open · Closes 10 PM",
  order_online: ["https://order.example"],
};
const ME = "Brew & Bloom Cafe";

function scenario({ own = {}, top = {}, topCount = 3 } = {}) {
  const tops = Array.from({ length: topCount }, (_, i) => ({ position: i + 1, title: `Rival ${i + 1}`, place_id: `r${i + 1}`, ...STRONG, ...top }));
  const mine = { position: topCount + 1, title: ME, place_id: "me", ...STRONG, ...own };
  for (const [k, v] of Object.entries(own)) if (v === undefined) delete mine[k];
  return buildBenchmark([...tops, mine], ME);
}
const tear = (opts, language = "en") => writeTeardown(scenario(opts), { language });

const DEVANAGARI = /[ऀ-ॿ]/;
const numbersIn = (text) => (String(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(Number(n.replace(/,/g, ""))));
function sentenceCount(text) {
  return text.trim().split(/(?<=[.!?])\s+(?=[A-Z"'\d])/).filter(Boolean).length;
}

describe("writeTeardown: the fixed priority for sentence 2", () => {
  // each case: what the own listing lacks -> the focus it must pick, in both languages
  const cases = [
    ["reviews far below the top average", { own: { reviews: 100 } }, "reviews"],
    ["unclaimed listing (reviews fine)", { own: { unclaimed_listing: true } }, "claimed"],
    ["no website (everything else fine)", { own: { website: undefined } }, "website"],
    ["no phone number", { own: { phone: undefined } }, "contact"],
    ["no opening hours", { own: { hours: undefined, open_state: undefined } }, "contact"],
    ["no phone and no hours", { own: { phone: undefined, hours: undefined, open_state: undefined } }, "contact"],
    ["no online ordering or delivery", { own: { order_online: undefined } }, "onlineOrder"],
    ["nothing missing", {}, "competitive"],
  ];

  for (const [name, opts, focus] of cases) {
    for (const language of LANGS) {
      test(`${name} -> ${focus} (${language})`, () => {
        const t = tear(opts, language);
        assert.equal(t.focus, focus);
        assert.equal(t.language, language);
      });
    }
  }

  test("reviews win over everything else, then claimed, website, contact, online ordering, in that order", () => {
    const lacking = { reviews: 10, unclaimed_listing: true, website: undefined, phone: undefined, hours: undefined, open_state: undefined, order_online: undefined };
    const order = ["reviews", "claimed", "website", "contact", "onlineOrder", "competitive"];
    const remove = [{ reviews: 300 }, { unclaimed_listing: undefined }, { website: STRONG.website }, { phone: STRONG.phone, hours: STRONG.hours, open_state: STRONG.open_state }, { order_online: STRONG.order_online }];
    let own = { ...lacking };
    for (let i = 0; i < order.length; i++) {
      assert.equal(tear({ own }).focus, order[i], `step ${i}`);
      if (remove[i]) {
        own = { ...own, ...remove[i] };
        for (const [k, v] of Object.entries(own)) if (v === undefined) delete own[k];
        own = { ...own, ...Object.fromEntries(Object.entries(lacking).filter(([k, v]) => v === undefined && !(k in own)).map(([k]) => [k, undefined])) };
      }
    }
  });

  test("reviews exactly at 50% of the top average are NOT 'far below'; just under 50% are", () => {
    assert.equal(LOW_REVIEWS_RATIO, 0.5);
    assert.equal(tear({ own: { reviews: 150 } }).focus, "competitive");
    assert.equal(tear({ own: { reviews: 149 } }).focus, "reviews");
    assert.equal(tear({ own: { reviews: 150, unclaimed_listing: true } }).focus, "claimed");
  });

  test("reviews between 50% and 100% are mentioned in sentence 1 but never the 'fix first'", () => {
    const t = tear({ own: { reviews: 200 } });
    assert.equal(t.focus, "competitive");
    assert.ok(t.gaps.includes("reviewsBelow"));
    assert.match(t.sentences[0], /200 reviews while the top 3 average 300/);
  });

  test("the sentence-2 text matches the focus, in both languages", () => {
    const expectEn = { reviews: /more reviews/, claimed: /claim your Google Business Profile/, website: /add a website link/, contact: /phone number and opening hours/, onlineOrder: /online ordering or delivery/, competitive: /competitive/ };
    const expectHi = { reviews: /reviews badhana/, claimed: /Google Business Profile claim karna/, website: /website ka link/, contact: /phone number aur opening hours/, onlineOrder: /online ordering ya delivery/, competitive: /competitive hain/ };
    const byFocus = {
      reviews: { own: { reviews: 10 } },
      claimed: { own: { unclaimed_listing: true } },
      website: { own: { website: undefined } },
      contact: { own: { phone: undefined, hours: undefined, open_state: undefined } },
      onlineOrder: { own: { order_online: undefined } },
      competitive: {},
    };
    for (const [focus, opts] of Object.entries(byFocus)) {
      assert.match(tear(opts, "en").sentences[1], expectEn[focus], `en ${focus}`);
      assert.match(tear(opts, "hinglish").sentences[1], expectHi[focus], `hinglish ${focus}`);
    }
    // phone alone and hours alone each get their own wording
    assert.match(tear({ own: { phone: undefined } }).sentences[1], /add your phone number to your Google listing/);
    assert.match(tear({ own: { hours: undefined, open_state: undefined } }).sentences[1], /add your opening hours/);
  });
});

describe("writeTeardown: sentence 1 states the gaps with the benchmark's exact numbers", () => {
  test("reviews, unclaimed and missing website, quoted from the data", () => {
    const t = tear({ own: { reviews: 30, unclaimed_listing: true, website: undefined }, top: { reviews: 440 } });
    assert.equal(
      t.sentences[0],
      "You have 30 reviews while the top 3 average 440, your listing is unclaimed while 3 of the top 3 are claimed, and 3 of the top 3 have a website and you don't."
    );
    assert.equal(t.text, `${t.sentences[0]} ${t.sentences[1]}`);
  });

  test("the same facts in Hinglish", () => {
    const t = tear({ own: { reviews: 30, unclaimed_listing: true, website: undefined }, top: { reviews: 440 } }, "hinglish");
    assert.equal(
      t.sentences[0],
      "Aapke 30 reviews hain jabki top 3 ka average 440 hai, aapki listing claim nahi hui hai jabki top 3 mein se 3 claimed hain aur top 3 mein se 3 ke paas website hai aur aapke paas nahi hai."
    );
  });

  test("at most 3 gaps are in the sentence (the biggest ones), but all are reported in `gaps`", () => {
    const t = tear({ own: { reviews: 10, unclaimed_listing: true, website: undefined, phone: undefined, order_online: undefined } });
    assert.deepEqual(t.gaps, ["reviews", "claimed", "website", "phone", "onlineOrder"]);
    assert.doesNotMatch(t.sentences[0], /phone number/);
    assert.match(t.sentences[0], /reviews/);
    assert.match(t.sentences[0], /unclaimed/);
    assert.match(t.sentences[0], /website/);
  });

  test("a lower rating is stated with both numbers", () => {
    const t = tear({ own: { rating: 4.1 } });
    assert.match(t.sentences[0], /^Your rating is 4.1 against the top 3 average of 4.5/);
    assert.match(tear({ own: { rating: 4.1 } }, "hinglish").sentences[0], /^Aapki rating 4.1 hai jabki top 3 ka average 4.5 hai/);
  });

  test("an earlier closing time is stated with the top listings' times", () => {
    const t = tear({ own: { hours: "Open · Closes 7 PM", open_state: "Open · Closes 7 PM" } });
    assert.match(t.sentences[0], /^You close at 7 PM while the top listings close at 10 PM/);
    assert.equal(t.focus, "competitive"); // closing time is worth saying but never the fix-first
    assert.match(tear({ own: { open_state: "Open · Closes 7 PM", hours: "x" } }, "hinglish").sentences[0], /^Aap 7 PM par band karte hain jabki top listings 10 PM par band hoti hain/);
  });

  test("top listings that close at different times give a range", () => {
    const own = { own: { open_state: "Open · Closes 7 PM", hours: "x" } };
    const benchmark = buildBenchmark(
      [
        { position: 1, title: "A", open_state: "Open · Closes 9 PM", hours: "x" },
        { position: 2, title: "B", open_state: "Open · Closes 11:30 PM", hours: "x" },
        { position: 3, title: ME, open_state: "Open · Closes 7 PM", hours: "x" },
      ],
      ME
    );
    assert.match(writeTeardown(benchmark).sentences[0], /^You close at 7 PM while the top listings close between 9 PM and 11:30 PM/);
    assert.ok(own);
  });

  test("closing at the same time, or later, is not a gap", () => {
    assert.ok(!tear({}).gaps.includes("closing"));
    assert.ok(!tear({ own: { open_state: "Open · Closes 11 PM", hours: "x" } }).gaps.includes("closing"));
  });

  test("a basic that none of the top listings have is not a gap", () => {
    const t = tear({ own: { website: undefined }, top: { website: undefined } });
    assert.ok(!t.gaps.includes("website"));
    assert.equal(t.focus, "competitive");
  });

  test("only some of the top listings having a basic is stated as 'N of the top 3'", () => {
    const benchmark = buildBenchmark(
      [
        { position: 1, title: "A", ...STRONG },
        { position: 2, title: "B", ...STRONG, website: undefined },
        { position: 3, title: "C", ...STRONG, website: undefined },
        { position: 4, title: ME, ...STRONG, website: undefined },
      ],
      ME
    );
    assert.match(writeTeardown(benchmark).sentences[0], /1 of the top 3 have a website and you don't/);
  });
});

describe("writeTeardown: edge cases", () => {
  test("rating higher than the top 3 is never a gap, and is mentioned as a strength", () => {
    const t = tear({ own: { rating: 4.9, website: undefined } });
    assert.ok(!t.gaps.includes("rating"));
    assert.match(t.sentences[0], /your rating of 4.9 is above the top 3 average of 4.5/);
    assert.match(tear({ own: { rating: 4.9, website: undefined } }, "hinglish").sentences[0], /aapki rating 4.9 hai jo top 3 ke average 4.5 se zyada hai/);
  });

  test("ties are not gaps: equal reviews and equal rating", () => {
    const t = tear({ own: { reviews: 300, rating: 4.5 } });
    assert.deepEqual(t.gaps, []);
    assert.equal(t.focus, "competitive");
  });

  test("no gaps at all: 'keeping pace', quoting the numbers, and the competitive fix", () => {
    const t = tear({ own: { reviews: 400, rating: 4.8 } });
    assert.match(t.sentences[0], /^You are keeping pace with the top 3: your rating of 4.8 is above the top 3 average of 4.5, and your 400 reviews match or beat the top 3 average of 300\.$/);
    assert.equal(t.sentences[1], "You are competitive with the top listings, so keep collecting reviews and replying to them.");
    assert.match(tear({ own: { reviews: 400, rating: 4.8 } }, "hinglish").sentences[0], /^Aap top 3 ke saath barabari par hain: /);
  });

  test("no gaps and no numbers to quote: still two sentences", () => {
    const b = buildBenchmark([{ position: 1, title: "Rival", website: "x", phone: "1", hours: "h", order_online: ["x"] }, { position: 2, title: ME, website: "x", phone: "1", hours: "h", order_online: ["x"] }], ME);
    const t = writeTeardown(b);
    assert.equal(t.focus, "competitive");
    assert.match(t.sentences[0], /^You are keeping pace with the top listing on the basics we check\.$/);
  });

  test("the business is not found, or there is nobody to compare with: null (the caller uses the rule-based text)", () => {
    const results = scenario().top.map((t, i) => ({ position: i + 1, title: t.title, place_id: `r${i}`, ...STRONG }));
    assert.equal(writeTeardown(buildBenchmark(results, "Nobody At All")), null);
    assert.equal(writeTeardown(buildBenchmark([{ position: 1, title: ME, ...STRONG }], ME)), null);
    for (const bad of [null, undefined, {}, { found: false }, { found: true, own: null, top: [] }]) assert.equal(writeTeardown(bad), null);
  });

  test("an own listing with missing fields never produces undefined, null or NaN in the text", () => {
    const b = buildBenchmark([{ position: 1, title: "Rival", ...STRONG }, { position: 2, title: ME }], ME); // no rating, reviews, phone, ...
    for (const language of LANGS) {
      const t = writeTeardown(b, { language });
      assert.doesNotMatch(t.text, /undefined|null|NaN|\[object/);
      assert.equal(sentenceCount(t.text), 2);
    }
    const noRating = tear({ own: { rating: undefined, reviews: undefined } });
    assert.doesNotMatch(noRating.text, /undefined|null|NaN/);
    assert.ok(!noRating.gaps.includes("rating") && !noRating.gaps.includes("reviews"));
  });

  test("competitors with no review numbers: no review or rating gap is invented", () => {
    const t = tear({ top: { reviews: undefined, rating: undefined } });
    assert.ok(!t.gaps.includes("reviews") && !t.gaps.includes("reviewsBelow") && !t.gaps.includes("rating"));
  });

  test("fewer than 3 competitors uses wording that still reads correctly", () => {
    const one = tear({ own: { reviews: 20, website: undefined }, topCount: 1 });
    assert.match(one.sentences[0], /^You have 20 reviews while the top listing has 300/);
    assert.match(one.sentences[0], /the top listing has a website and you don't/);
    const two = tear({ own: { reviews: 20, website: undefined }, topCount: 2 });
    assert.match(two.sentences[0], /the top 2 average 300/);
    assert.match(two.sentences[0], /2 of the top 2 have a website/);
    assert.match(tear({ own: { reviews: 20 }, topCount: 1 }, "hinglish").sentences[0], /top listing ke 300 hain/);
  });

  test("unknown languages are English; normalizeLanguage", () => {
    assert.equal(writeTeardown(scenario(), { language: "klingon" }).language, "en");
    assert.equal(writeTeardown(scenario()).language, "en");
    assert.equal(normalizeLanguage(" HINGLISH "), "hinglish");
    for (const v of ["en", "", null, undefined, "hindi", 7]) assert.equal(normalizeLanguage(v), "en");
  });

  test("businessName is accepted but the text speaks to the owner", () => {
    assert.equal(writeTeardown(scenario(), { businessName: ME }).text, writeTeardown(scenario()).text);
  });
});

describe("writeTeardown: guarantees across many situations", () => {
  const situations = [
    {},
    { own: { reviews: 10 } },
    { own: { reviews: 10, unclaimed_listing: true, website: undefined, phone: undefined, order_online: undefined } },
    { own: { rating: 3.2 } },
    { own: { rating: 5 } },
    { own: { hours: "Open · Closes 6 PM", open_state: "Open · Closes 6 PM" } },
    { own: { website: undefined } },
    { own: { reviews: 1234, rating: 4.9 }, top: { reviews: 5 } },
    { topCount: 1 },
    { topCount: 2, own: { reviews: 1, unclaimed_listing: true } },
  ];

  for (const language of LANGS) {
    test(`always exactly two sentences, only numbers from the benchmark, no stray tokens (${language})`, () => {
      for (const s of situations) {
        const benchmark = scenario(s);
        const t = writeTeardown(benchmark, { language });
        assert.equal(sentenceCount(t.text), 2, t.text);
        assert.equal(t.sentences.length, 2);
        assert.doesNotMatch(t.text, /undefined|null|NaN|\[object|\{|\}/);
        const allowed = new Set(numbersIn(JSON.stringify(benchmark)));
        for (const n of numbersIn(t.text)) assert.ok(allowed.has(n), `"${n}" is not in the benchmark: ${t.text}`);
      }
    });

    test(`${language}: Roman script only, never Devanagari`, () => {
      for (const s of situations) {
        const t = writeTeardown(scenario(s), { language });
        assert.doesNotMatch(t.text, DEVANAGARI);
        assert.match(t.text, /^[\x20-\x7E]+$/, `non-ASCII character in: ${t.text}`);
      }
    });
  }

  test("deterministic: the same benchmark always gives the same text", () => {
    for (const language of LANGS) {
      assert.equal(writeTeardown(scenario({ own: { reviews: 30 } }), { language }).text, writeTeardown(scenario({ own: { reviews: 30 } }), { language }).text);
    }
  });

  test("Hinglish and English differ, and each template set is complete", () => {
    const en = tear({ own: { reviews: 30 } }, "en").text;
    const hi = tear({ own: { reviews: 30 } }, "hinglish").text;
    assert.notEqual(en, hi);
    assert.match(hi, /hain/);
  });
});

describe("the demo hero's teardown (re-seeded data)", () => {
  const demo = generateDemoData({ endDate: "2026-10-07T12:00:00Z" });
  const bench = (day) => buildBenchmark(demo.days[day].payload.local_results, HERO_NAME);

  test("latest day: ~30 reviews against a top-3 average in the hundreds, unclaimed, no website", () => {
    const b = bench(29);
    const t = writeTeardown(b);
    assert.equal(t.focus, "reviews");
    assert.equal(b.own.reviews, 30);
    assert.ok(b.averages.reviews >= 300);
    assert.match(t.sentences[0], new RegExp(`You have 30 reviews while the top 3 average ${b.averages.reviews}`));
    assert.match(t.sentences[0], /your listing is unclaimed while 3 of the top 3 are claimed/);
    assert.match(t.sentences[0], /2 of the top 3 have a website and you don't/);
    assert.match(t.sentences[1], /more reviews/);
  });

  test("first day: 14 reviews against the top-3 average", () => {
    const b = bench(0);
    assert.equal(b.own.reviews, 14);
    assert.match(writeTeardown(b).sentences[0], new RegExp(`You have 14 reviews while the top 3 average ${b.averages.reviews}`));
  });

  test("Hinglish version for the same hero, in Roman script", () => {
    const t = writeTeardown(bench(29), { language: "hinglish" });
    assert.match(t.sentences[0], /^Aapke 30 reviews hain jabki top 3 ka average \d+ hai/);
    assert.doesNotMatch(t.text, DEVANAGARI);
  });

  test("the other tracked businesses also get a teardown (or none, if not in the top 20)", () => {
    const grind = writeTeardown(buildBenchmark(demo.days[29].payload.local_results, "The Daily Grind"));
    assert.ok(grind === null || grind.sentences.length === 2);
  });
});

describe("composeInsight", () => {
  const RULE = { text: "Rule-based fallback text." };
  const found = scenario({ own: { reviews: 30 } });
  const notFound = buildBenchmark(scenario().top.map((t) => ({ position: t.position, title: t.title, ...STRONG })), "Nobody");
  const alone = buildBenchmark([{ position: 1, title: ME, ...STRONG }], ME);

  test("with the business found and a competitor: the teardown, labeled 'teardown'", () => {
    const out = composeInsight({ rule: RULE, benchmark: found });
    assert.equal(out.source, "teardown");
    assert.equal(out.language, "en");
    assert.equal(out.text, writeTeardown(found).text);
  });

  test("the language is passed through and returned", () => {
    const out = composeInsight({ rule: RULE, benchmark: found, language: "hinglish" });
    assert.deepEqual([out.source, out.language], ["teardown", "hinglish"]);
    assert.match(out.text, /^Aapke 30 reviews hain/);
  });

  test("not in the top 20, nobody to compare with, or no benchmark: the rule-based text, always English", () => {
    for (const benchmark of [notFound, alone, null, undefined]) {
      for (const language of LANGS) {
        assert.deepEqual(composeInsight({ rule: RULE, benchmark, language }), { text: RULE.text, source: "rules", language: "en" });
      }
    }
  });

  test("it is synchronous and takes no model or network parameters", () => {
    const out = composeInsight({ rule: RULE, benchmark: found });
    assert.ok(!(out instanceof Promise));
    assert.ok(!("llmFn" in composeInsight) && composeInsight.length === 1);
  });
});

describe("the cache is keyed by language", () => {
  test("a cached text is only usable for the same language; NULL (older rows) counts as English", () => {
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

describe("insights use no network and no external service", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("writing a teardown and composing an insight never call fetch", () => {
    let calls = 0;
    globalThis.fetch = () => {
      calls++;
      throw new Error("fetch must not be called for insights");
    };
    for (const language of LANGS) {
      writeTeardown(scenario({ own: { reviews: 5 } }), { language });
      composeInsight({ rule: { text: "x" }, benchmark: scenario(), language });
      composeInsight({ rule: { text: "x" }, benchmark: null, language });
    }
    assert.equal(calls, 0);
  });

  test("the insight modules don't mention fetch, a network client, or an external AI service", () => {
    const files = ["lib/insight.mjs", "lib/teardown.mjs", "lib/benchmark.mjs", "lib/benchmark-data.mjs", "app/api/businesses/[id]/insight/route.js", "app/api/businesses/[id]/benchmark/route.js", "components/InsightCard.jsx", "components/BenchmarkPanel.jsx"];
    for (const f of files) {
      const src = fs.readFileSync(path.join(ROOT, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(src, /\bfetch\s*\(|from ["'][^"']*llm[^"']*["']|XMLHttpRequest|https?:\/\//, `${f} must not make network calls`);
      if (f.startsWith("lib/")) assert.doesNotMatch(src, /node:https?|node:net/, f);
    }
    assert.equal(fs.existsSync(path.join(ROOT, "lib/llm.mjs")), false);
  });

  test("nothing in the project refers to an external AI service (guards against it coming back)", () => {
    const needle = new RegExp(["gem" + "ini", "generative" + "language", "open" + "ai", "anthro" + "pic", "GEM" + "INI_"].join("|"), "i");
    const roots = ["lib", "app", "components", "db", "scripts", "test", "README.md", "STATUS.md", ".env.local.example", "package.json", "next.config.mjs", "vercel.json"];
    const hits = [];
    const walk = (p) => {
      const full = path.join(ROOT, p);
      if (!fs.existsSync(full)) return;
      if (fs.statSync(full).isDirectory()) return fs.readdirSync(full).forEach((f) => walk(path.join(p, f)));
      if (needle.test(fs.readFileSync(full, "utf8"))) hits.push(p);
    };
    roots.forEach(walk);
    assert.deepEqual(hits, []);
  });
});
