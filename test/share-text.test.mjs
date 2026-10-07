import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildShareText, pickTopCompetitor, truncateAtWord, whatsAppUrl, SHARE_INSIGHT_MAX_CHARS } from "../lib/share-text.mjs";

const base = { businessName: "Brew & Bloom Cafe", queryText: "cafe near Katpadi", found: true, position: 3, trend: "down", trendChange: 1, topCompetitor: { title: "Mocha Meadow Cafe", position: 1 }, insight: null, isDemo: false };

describe("buildShareText", () => {
  test("the standard summary: rank, change, top competitor, footer", () => {
    assert.equal(
      buildShareText(base),
      [
        'Brew & Bloom Cafe is #3 on Google Maps for "cafe near Katpadi" (down 1 since the last check).',
        "Top competitor: Mocha Meadow Cafe (#1).",
        "",
        "Sent from DukanDarpan",
      ].join("\n")
    );
  });

  test("moving up, and a move with no position count (into or out of the top 20)", () => {
    assert.match(buildShareText({ ...base, trend: "up", trendChange: 2 }), /\(up 2 since the last check\)/);
    assert.match(buildShareText({ ...base, trend: "up", trendChange: null }), /\(up since the last check\)/);
  });

  test("flat or unknown trend adds no change text", () => {
    for (const trend of ["flat", null, undefined]) {
      assert.doesNotMatch(buildShareText({ ...base, trend }), /since the last check/);
    }
  });

  test("not in the top 20, and never checked, are said plainly", () => {
    assert.match(buildShareText({ ...base, found: false, position: null, trend: "down", trendChange: null }), /is not in the top 20 on Google Maps for "cafe near Katpadi" \(down since the last check\)\./);
    assert.match(buildShareText({ ...base, found: null, position: null, trend: null }), /hasn't been checked on Google Maps yet for "cafe near Katpadi"\./);
  });

  test("ranked #1: nobody above, instead of a competitor line", () => {
    const t = buildShareText({ ...base, position: 1, topCompetitor: null });
    assert.match(t, /Nobody ranks above it right now\./);
    assert.doesNotMatch(t, /Top competitor/);
  });

  test("no competitor known: that line is simply left out", () => {
    assert.doesNotMatch(buildShareText({ ...base, topCompetitor: null }), /Top competitor/);
  });

  test("the cached recommendation is included when there is one", () => {
    const t = buildShareText({ ...base, insight: "Add a website to your listing." });
    assert.match(t, /\n\nAdd a website to your listing\.\n\nSent from DukanDarpan$/);
  });

  test("a long recommendation is cut at a word boundary with an ellipsis", () => {
    const long = "word ".repeat(200);
    const t = buildShareText({ ...base, insight: long });
    const advice = t.split("\n\n")[1];
    assert.ok(advice.length <= SHARE_INSIGHT_MAX_CHARS);
    assert.ok(advice.endsWith("…"));
    assert.doesNotMatch(advice, /wor…$/);
  });

  test("sample data is labeled so it can't be passed on as real", () => {
    const t = buildShareText({ ...base, isDemo: true });
    assert.ok(t.startsWith("[Sample data] "));
    assert.match(t, /Sent from DukanDarpan \(sample data\)$/);
  });
});

describe("helpers", () => {
  test("truncateAtWord leaves short text alone and collapses whitespace", () => {
    assert.equal(truncateAtWord("  a   b \n c "), "a b c");
    assert.equal(truncateAtWord(null), "");
  });

  test("pickTopCompetitor takes the best-ranked one and ignores junk", () => {
    assert.deepEqual(pickTopCompetitor([{ title: "B", position: 4 }, { title: "A", position: 2 }, null, { position: 1 }]), { title: "A", position: 2 });
    assert.equal(pickTopCompetitor([]), null);
    assert.equal(pickTopCompetitor(undefined), null);
  });

  test("whatsAppUrl is a wa.me link with the text fully URL-encoded", () => {
    const text = 'Cafe & Co #3\nline two "quoted" 100%';
    const url = whatsAppUrl(text);
    assert.ok(url.startsWith("https://wa.me/?text="));
    assert.ok(!/[ \n#&"]/.test(url.slice("https://wa.me/?text=".length)), "no raw special characters");
    assert.equal(decodeURIComponent(url.slice("https://wa.me/?text=".length)), text);
  });
});
