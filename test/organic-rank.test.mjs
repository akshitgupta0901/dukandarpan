import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { matchOrganicRank } from "../lib/rank-matcher.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIXTURES, `organic_${name}.json`), "utf8"));
const cafe = fixture("cafe");
const gym = fixture("gym");
const salon = fixture("salon");
const restaurant = fixture("restaurant");

describe("matchOrganicRank on the real organic fixtures", () => {
  test("Café Laylat ranks #5 organically (a Swiggy listing names it in the title and link)", () => {
    const r = matchOrganicRank(cafe, "Café Laylat");
    assert.equal(r.found, true);
    assert.equal(r.position, 5);
    assert.match(r.matchedTitle, /Cafe Laylat/);
    assert.match(r.matchedLink, /swiggy\.com/);
  });

  test("Elegant Landmark Unisex Salon ranks #3", () => {
    const r = matchOrganicRank(salon, "Elegant Landmark Unisex Salon");
    assert.equal(r.position, 3);
    assert.match(r.matchedTitle, /Elegant Landmark/i);
  });

  test("a business is found by its own website: Muscle Engineer is #4", () => {
    const r = matchOrganicRank(gym, "Muscle Engineer");
    assert.equal(r.position, 4);
    assert.match(r.matchedLink, /muscleengineer\.in/);
  });

  test("seeded businesses that don't rank organically come back not found, with a null position", () => {
    const cases = [
      [cafe, "Hangout Cafe"],
      [restaurant, "Zaitoon Restaurant"],
      [restaurant, "Eato Restaurant"],
      [restaurant, "Katpadi Kitchen"], // "Katpadi" is in a title, but "Kitchen" is not, so not a match
      [gym, "Infinity Fitness Gym"],
      [gym, "Aesthetic Den"],
      [gym, "iMMc Fit Club"],
      [salon, "Studieo7 Signature Lounge"],
      [salon, "Simply Sparkle Beauty Salon"],
    ];
    for (const [response, name] of cases) {
      assert.deepEqual(matchOrganicRank(response, name), { found: false, position: null, matchedTitle: null, matchedLink: null }, name);
    }
  });

  test("generic listing pages that merely contain a category word are not mistaken for the business", () => {
    // "Best Gym in Vit Main Road" (Justdial) is not "Vit Gym Palace"
    assert.equal(matchOrganicRank(gym, "Vit Gym Palace").found, false);
  });
});

describe("matchOrganicRank: matching rules", () => {
  const response = (...items) => ({ organic_results: items.map((it, i) => ({ position: i + 1, ...it })) });

  test("whole words only: 'Eato' is not found inside 'Theatre' or 'Cheating'", () => {
    const r = response({ title: "Best Theatre Cafes", link: "https://x.example/theatre" }, { title: "Cheating at cards", link: "https://y.example" });
    assert.equal(matchOrganicRank(r, "Eato Restaurant").found, false);
  });

  test("every name word must be present, in any order and case", () => {
    const r = response({ title: "STUDIEO7 | the signature lounge salon" });
    assert.equal(matchOrganicRank(r, "Studieo7 Signature Lounge").position, 1);
    assert.equal(matchOrganicRank(response({ title: "Signature moments" }), "Studieo7 Signature Lounge").found, false);
  });

  test("accents and punctuation are ignored", () => {
    assert.equal(matchOrganicRank(response({ title: "Order from Café Laylat online" }), "Cafe Laylat").position, 1);
    assert.equal(matchOrganicRank(response({ title: "Toni & Guy in Katpadi" }), "Toni&Guy").position, 1);
  });

  test("the displayed_link counts when the title doesn't name the business", () => {
    const r = response({ title: "Welcome", displayed_link: "https://www.hangout-cafe-vlr.waiterio.com › menu" });
    assert.equal(matchOrganicRank(r, "Hangout Cafe").position, 1);
  });

  test("a domain that fuses the name together still matches (long names only)", () => {
    const r = response({ title: "Welcome", link: "https://www.gorgeousfamilyspa.com/" });
    assert.equal(matchOrganicRank(r, "Gorgeous Family Spa").position, 1);
    // a short fused name inside a URL is too risky to trust
    assert.equal(matchOrganicRank(response({ title: "Hi", link: "https://www.cocoacove.example" }), "Co Co").found, false);
  });

  test("the best-ranked match wins when several results match", () => {
    const r = response({ title: "Other" }, { title: "Brew Bloom page two" }, { title: "Brew Bloom page three" });
    assert.equal(matchOrganicRank(r, "Brew & Bloom Cafe").position, 2);
  });

  test("uses the result's own position field, falling back to its index", () => {
    assert.equal(matchOrganicRank({ organic_results: [{ position: 7, title: "Brew Bloom" }] }, "Brew & Bloom Cafe").position, 7);
    assert.equal(matchOrganicRank({ organic_results: [{ title: "x" }, { title: "Brew Bloom" }] }, "Brew & Bloom Cafe").position, 2);
  });

  test("missing, empty or malformed responses never throw and report not found", () => {
    for (const bad of [undefined, null, {}, { organic_results: null }, { organic_results: "x" }, { organic_results: [null, 5, {}] }]) {
      assert.equal(matchOrganicRank(bad, "Brew & Bloom Cafe").found, false);
    }
  });

  test("an empty business name matches nothing", () => {
    assert.equal(matchOrganicRank(response({ title: "Anything at all" }), "").found, false);
    assert.equal(matchOrganicRank(response({ title: "Anything at all" }), "   ").found, false);
  });
});
