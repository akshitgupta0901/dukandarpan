import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  matchBusinessRank,
  inOrganicMapPack,
  significantTargetTokens,
} from "../lib/rank-matcher.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, name), "utf8"));
}

const maps = {
  restaurant: loadFixture("maps_restaurant.json"),
  salon: loadFixture("maps_salon.json"),
  gym: loadFixture("maps_gym.json"),
  cafe: loadFixture("maps_cafe.json"),
};

const organic = {
  restaurant: loadFixture("organic_restaurant.json"),
  salon: loadFixture("organic_salon.json"),
  gym: loadFixture("organic_gym.json"),
  cafe: loadFixture("organic_cafe.json"),
};

// Ground truth, read directly off the saved fixtures (fixtures/maps_*.json)
// for all 11 businesses across all 4 categories, from explore-serpapi.mjs's
// CATEGORIES[].targets list.
const CASES = [
  { cat: "restaurant", name: "Zaitoon Restaurant", expectPosition: 1, expectTitle: "Zaitoon Restaurant, Vellore" },
  { cat: "restaurant", name: "Eato Restaurant", expectPosition: 4, expectTitle: "Eato Restaurant" },
  { cat: "restaurant", name: "Katpadi Kitchen", expectPosition: null }, // real not_found case (confirmed absent from raw fixture text)
  { cat: "salon", name: "Elegant Landmark Unisex Salon", expectPosition: 3, expectTitle: "Elegant landmark unisex salon and academy pvt ltd" },
  { cat: "salon", name: "Studieo7 Signature Lounge", expectPosition: 18, expectTitle: "Studieo7 Signature Lounge Vellore" },
  { cat: "salon", name: "Simply Sparkle Beauty Salon", expectPosition: 4 },
  { cat: "gym", name: "Infinity Fitness Gym", expectPosition: 1, expectTitle: "Infinity Fitness Gym" },
  { cat: "gym", name: "Aesthetic Den", expectPosition: 3 },
  { cat: "gym", name: "iMMc Fit Club", expectPosition: 9, expectTitle: "iMMc Fit Club" },
  { cat: "cafe", name: "Café Laylat", expectPosition: 1 },
  { cat: "cafe", name: "Hangout Cafe", expectPosition: 2, expectTitle: "Hangout cafe" },
];

describe("matchBusinessRank — real fixtures, all 11 businesses / 4 categories", () => {
  for (const c of CASES) {
    test(`${c.name} (${c.cat})`, () => {
      const result = matchBusinessRank(maps[c.cat], c.name);
      if (c.expectPosition === null) {
        assert.equal(result.found, false);
        assert.equal(result.position, null);
      } else {
        assert.equal(result.found, true);
        assert.equal(result.position, c.expectPosition);
        if (c.expectTitle) assert.equal(result.matchedTitle, c.expectTitle);
      }
    });
  }
});

describe("not_found is a valid, distinguishable result (not an error / not position 0)", () => {
  test("Katpadi Kitchen -> found:false with a clean empty shape", () => {
    const result = matchBusinessRank(maps.restaurant, "Katpadi Kitchen");
    assert.deepEqual(result, {
      found: false,
      position: null,
      matchedTitle: null,
      matchedIndex: null,
      ambiguous: false,
      allMatches: [],
    });
  });

  test("Katpadi Kitchen is genuinely absent from the raw fixture (sanity check on the test case itself)", () => {
    const raw = fs.readFileSync(path.join(FIXTURES_DIR, "maps_restaurant.json"), "utf8");
    assert.equal(raw.includes("Katpadi Kitchen"), false);
  });
});

describe("name-variant handling: case, accents, suffix words, token order", () => {
  test("case-insensitive", () => {
    const r = matchBusinessRank(maps.gym, "infinity fitness gym");
    assert.equal(r.position, 1);
  });

  test("accent-insensitive (Cafe vs Café)", () => {
    const r = matchBusinessRank(maps.cafe, "Cafe Laylat");
    assert.equal(r.position, 1);
  });

  test('"Zaitoon Restaurant" matches the padded real listing "Zaitoon Restaurant, Vellore"', () => {
    const r = matchBusinessRank(maps.restaurant, "Zaitoon Restaurant");
    assert.equal(r.matchedTitle, "Zaitoon Restaurant, Vellore");
  });

  test("token match tolerates an extra descriptor word on the LISTING side (synthetic: 'Zaitoon Family Restaurant')", () => {
    // Real fixtures don't happen to contain this exact padding, but this is
    // the case referenced from Phase 1 exploration — confirming the token
    // (not full-substring) approach still catches it.
    const synthetic = {
      local_results: [
        { position: 1, title: "Zaitoon Family Restaurant, Katpadi" },
        { position: 2, title: "Kailash Parbat" },
      ],
    };
    const r = matchBusinessRank(synthetic, "Zaitoon Restaurant");
    assert.equal(r.found, true);
    assert.equal(r.position, 1);
  });

  test("suffix-stripping lets the target match a LISTING that omits the generic category word (synthetic)", () => {
    // Real fixtures never omit the category word entirely, so this is
    // synthetic — it exercises the strip list itself (restaurant/salon/gym/cafe/pvt ltd/&).
    const synthetic = { local_results: [{ position: 1, title: "Zaitoon" }] };
    const r = matchBusinessRank(synthetic, "Zaitoon Restaurant");
    assert.equal(r.found, true);
    assert.equal(r.position, 1);
  });

  test('"Pvt Ltd" and "&" are stripped as noise (synthetic)', () => {
    const synthetic = { local_results: [{ position: 5, title: "Elegant Landmark Unisex Academy" }] };
    const r = matchBusinessRank(
      synthetic,
      "Elegant Landmark Unisex Salon & Academy Pvt Ltd"
    );
    assert.equal(r.found, true);
    assert.equal(r.position, 5);
  });

  test("stripping never empties the token list (a business literally named 'Restaurant' still matches itself)", () => {
    const synthetic = { local_results: [{ position: 2, title: "Restaurant" }] };
    const r = matchBusinessRank(synthetic, "Restaurant");
    assert.equal(r.found, true);
    assert.equal(r.position, 2);
  });
});

describe("organic map pack — secondary signal only, never used as a rank", () => {
  test("Zaitoon Restaurant is in the organic map pack (top 3)", () => {
    const r = inOrganicMapPack(organic.restaurant, "Zaitoon Restaurant");
    assert.equal(r.inMapPack, true);
    assert.equal(r.position, 1);
  });

  test("Katpadi Kitchen is not in the organic map pack either (consistent with not_found on maps)", () => {
    const r = inOrganicMapPack(organic.restaurant, "Katpadi Kitchen");
    assert.equal(r.inMapPack, false);
  });

  test("Studieo7 Signature Lounge: real maps rank #18 vs absent from the 3-slot organic pack — proves pack-absence != not_found", () => {
    const mapsResult = matchBusinessRank(maps.salon, "Studieo7 Signature Lounge");
    const packResult = inOrganicMapPack(organic.salon, "Studieo7 Signature Lounge");
    assert.equal(mapsResult.found, true);
    assert.equal(mapsResult.position, 18);
    assert.equal(packResult.inMapPack, false);
  });
});

describe("ambiguity detection across the full local_results lists (not just the 11 targets)", () => {
  // Sanity sweep: for every target business, confirm the matcher finds at
  // most one candidate in the *actual* 20-item local_results list for its
  // category — i.e. no real ambiguity exists in this fixture set today.
  for (const c of CASES.filter((c) => c.expectPosition !== null)) {
    test(`${c.name}: exactly one candidate matches in maps_${c.cat}.json`, () => {
      const r = matchBusinessRank(maps[c.cat], c.name);
      assert.equal(
        r.ambiguous,
        false,
        `expected a single match, got: ${JSON.stringify(r.allMatches)}`
      );
    });
  }

  test("flag: 4 of the 11 businesses reduce to a single significant token after suffix-stripping", () => {
    // "Zaitoon Restaurant" / "Eato Restaurant" / "Hangout Cafe" / "Café Laylat"
    // all lose their only category word (restaurant/cafe) in stripping, so
    // matching falls back to ONE token ("zaitoon", "eato", "hangout",
    // "laylat"). That's still unambiguous in this fixture set, but a
    // single-token match is inherently weaker evidence than 2+ tokens: it
    // would also match "New Zaitoon Grill" or "Zaitoon Bakery" if either
    // showed up in a future response. Documented here, not asserted as a
    // failure — see the write-up for how to harden this if it matters.
    const oneTokenCases = ["Zaitoon Restaurant", "Eato Restaurant", "Hangout Cafe", "Café Laylat"];
    for (const name of oneTokenCases) {
      const tokens = significantTargetTokens(name);
      assert.equal(tokens.length, 1, `${name} -> ${JSON.stringify(tokens)}`);
    }
  });

  test("constructed ambiguous case: two candidates both contain the single stripped token (synthetic)", () => {
    const synthetic = {
      local_results: [
        { position: 1, title: "Zaitoon Restaurant" },
        { position: 7, title: "Zaitoon Bakery & Grill" },
      ],
    };
    const r = matchBusinessRank(synthetic, "Zaitoon Restaurant");
    assert.equal(r.ambiguous, true);
    assert.equal(r.allMatches.length, 2);
    // The tighter overlap (exact-ish name, no extra "Bakery & Grill" tokens)
    // wins over the merely-lower-position one — score beats raw position.
    assert.equal(r.position, 1);
    assert.equal(r.matchedTitle, "Zaitoon Restaurant");
  });

  test('REAL ambiguous case found in maps_restaurant.json: "The Vellore Kitchen" has two branch listings', () => {
    
    const r = matchBusinessRank(maps.restaurant, "The Vellore Kitchen");
    assert.equal(r.found, true);
    assert.equal(r.ambiguous, true);
    assert.deepEqual(r.allMatches, [
      { position: 7, title: "The Vellore Kitchen" },
      { position: 15, title: "The Vellore Kitchen | Gandhi Nagar" },
    ]);
    assert.equal(r.position, 7); // exact-name branch wins the tie-break over the address-suffixed one
  });
});
