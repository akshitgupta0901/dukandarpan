import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { describeShareOfVoice, GOOD_MAP_RANK, POOR_ORGANIC_RANK } from "../lib/share-of-voice.mjs";
import { organicApplies, checkCredits, manualCheckCredits } from "../lib/check-cost.mjs";
import { isLatLng } from "../lib/geocode.mjs";

const sov = (o) => describeShareOfVoice({ found: true, position: 2, organicChecked: true, organicPosition: 12, ...o });

describe("describeShareOfVoice", () => {
  test("shows both ranks", () => {
    const r = sov({ position: 2, organicPosition: 4 });
    assert.equal(r.mapText, "#2");
    assert.equal(r.organicText, "#4");
    assert.equal(r.gap, null);
  });

  test("good on the map, missing from regular results: a visibility gap that names the map rank", () => {
    const r = sov({ position: 3, organicPosition: null });
    assert.equal(r.organicText, "Not ranking organically");
    assert.equal(r.organicMissing, true);
    assert.match(r.gap, /You show up on the map at #3, but not in the regular Google results/);
  });

  test("good on the map, far down the regular results: a gap that names both ranks", () => {
    const r = sov({ position: 2, organicPosition: 12 });
    assert.match(r.gap, /#2 on the map but only #12/);
  });

  test("a regular-results rank just inside the cutoff is not a gap; at the cutoff it is", () => {
    assert.equal(sov({ position: 2, organicPosition: POOR_ORGANIC_RANK - 1 }).gap, null);
    assert.notEqual(sov({ position: 2, organicPosition: POOR_ORGANIC_RANK }).gap, null);
  });

  test("a weak map rank is not 'good', so no gap sentence", () => {
    assert.equal(sov({ position: GOOD_MAP_RANK + 1, organicPosition: null }).gap, null);
    assert.notEqual(sov({ position: GOOD_MAP_RANK, organicPosition: null }).gap, null);
  });

  test("not on the map at all: 'Not in top 20', no gap", () => {
    const r = sov({ found: false, position: null, organicPosition: null });
    assert.equal(r.mapText, "Not in top 20");
    assert.equal(r.gap, null);
  });

  test("never checked: says so, and never claims 'not ranking organically'", () => {
    const r = describeShareOfVoice({ found: null, position: null, organicChecked: false, organicPosition: null });
    assert.equal(r.mapText, "Not checked yet");
    assert.equal(r.organicText, "Not checked yet");
    assert.equal(r.organicMissing, false);
  });

  test("organic never looked up: 'Not checked yet' and no gap, even with a great map rank", () => {
    const r = sov({ position: 1, organicChecked: false, organicPosition: null });
    assert.equal(r.organicText, "Not checked yet");
    assert.equal(r.gap, null);
    assert.equal(r.organicMissing, false);
  });
});

describe("check cost (credits)", () => {
  test("organic runs only when asked for AND the query has a location", () => {
    assert.equal(organicApplies({ includeOrganic: true, locationText: "Vellore, Tamil Nadu, India" }), true);
    assert.equal(organicApplies({ includeOrganic: false, locationText: "Vellore" }), false);
    assert.equal(organicApplies({ includeOrganic: true, locationText: null }), false);
    assert.equal(organicApplies({ includeOrganic: true, locationText: "   " }), false);
    assert.equal(organicApplies({ includeOrganic: true, locationText: undefined }), false);
  });

  test("cron (maps-only) costs 1; a manual check with a location costs 2; without one, 1", () => {
    assert.equal(checkCredits({ includeOrganic: false, locationText: "Vellore" }), 1);
    assert.equal(checkCredits({ includeOrganic: true, locationText: "Vellore" }), 2);
    assert.equal(checkCredits({ includeOrganic: true, locationText: null }), 1);
  });

  test("the button's cost follows the query's organicEnabled flag", () => {
    assert.equal(manualCheckCredits(true), 2);
    assert.equal(manualCheckCredits(false), 1);
    assert.equal(manualCheckCredits(undefined), 1);
  });
});

describe("isLatLng", () => {
  test("recognises coordinates but not place names", () => {
    assert.equal(isLatLng("12.9352,77.6146"), true);
    assert.equal(isLatLng(" -33.86 , 151.2 "), true);
    assert.equal(isLatLng("Koramangala, Bangalore"), false);
    assert.equal(isLatLng("560034"), false);
    assert.equal(isLatLng(""), false);
    assert.equal(isLatLng(null), false);
  });
});
