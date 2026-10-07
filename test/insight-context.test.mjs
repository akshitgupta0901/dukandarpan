import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeRankHistory,
  summarizeCompetitors,
  buildInsightContext,
  selectRecommendation,
  RECOMMENDATIONS,
} from "../lib/insight-context.mjs";

describe("summarizeRankHistory (pure, zero I/O)", () => {
  test("empty history", () => {
    assert.equal(summarizeRankHistory([]), "No check history yet for this business.");
  });

  test("single found snapshot", () => {
    assert.equal(
      summarizeRankHistory([{ position: 3, checkedAt: "2026-01-01" }]),
      "Currently ranking #3 (only one check on record)."
    );
  });

  test("single not_found snapshot", () => {
    assert.equal(
      summarizeRankHistory([{ position: null, checkedAt: "2026-01-01" }]),
      "Not currently appearing in the local pack (only one check on record)."
    );
  });

  test("rank dropped over several checks (matches the example in the spec)", () => {
    const history = [
      { position: 1, checkedAt: "2026-01-01" },
      { position: 3, checkedAt: "2026-01-02" },
      { position: 5, checkedAt: "2026-01-03" },
    ];
    assert.equal(summarizeRankHistory(history), "Rank dropped from #1 to #5 over the last 3 checks.");
  });

  test("rank improved over several checks", () => {
    const history = [
      { position: 8, checkedAt: "2026-01-01" },
      { position: 4, checkedAt: "2026-01-02" },
    ];
    assert.equal(summarizeRankHistory(history), "Rank improved from #8 to #4 over the last 2 checks.");
  });

  test("rank held steady, no not_found in between", () => {
    const history = [
      { position: 2, checkedAt: "2026-01-01" },
      { position: 2, checkedAt: "2026-01-02" },
      { position: 2, checkedAt: "2026-01-03" },
    ];
    assert.equal(summarizeRankHistory(history), "Rank has held steady at #2 over the last 3 checks.");
  });

  test("same start/end position but dropped out in between counts as unstable, not steady", () => {
    const history = [
      { position: 2, checkedAt: "2026-01-01" },
      { position: null, checkedAt: "2026-01-02" },
      { position: 2, checkedAt: "2026-01-03" },
    ];
    assert.match(summarizeRankHistory(history), /unstable/);
    assert.match(summarizeRankHistory(history), /#2/);
  });

  test("found -> not_found (fell out)", () => {
    const history = [
      { position: 4, checkedAt: "2026-01-01" },
      { position: null, checkedAt: "2026-01-02" },
    ];
    assert.equal(summarizeRankHistory(history), "Was ranking #4 but fell out of the local pack over the last 2 checks.");
  });

  test("not_found -> found (recovered)", () => {
    const history = [
      { position: null, checkedAt: "2026-01-01" },
      { position: 6, checkedAt: "2026-01-02" },
    ];
    assert.equal(
      summarizeRankHistory(history),
      "Wasn't appearing in the local pack but is now ranking #6 (last 2 checks)."
    );
  });

  test("not_found the whole window", () => {
    const history = [
      { position: null, checkedAt: "2026-01-01" },
      { position: null, checkedAt: "2026-01-02" },
    ];
    assert.equal(summarizeRankHistory(history), "Hasn't appeared in the local pack in any of the last 2 checks.");
  });

  test("only the last maxChecks entries are considered", () => {
    const history = [
      { position: 1, checkedAt: "2026-01-01" },
      { position: 9, checkedAt: "2026-01-02" },
      { position: 2, checkedAt: "2026-01-03" },
      { position: 2, checkedAt: "2026-01-04" },
    ];
    assert.equal(
      summarizeRankHistory(history, { maxChecks: 2 }),
      "Rank has held steady at #2 over the last 2 checks."
    );
  });
});

describe("summarizeCompetitors (pure, zero I/O)", () => {
  test("found, with competitors above it (matches the example in the spec)", () => {
    const text = summarizeCompetitors({
      found: true,
      position: 5,
      competitors: [
        { position: 1, title: "Coffee & Bite Cafe" },
        { position: 2, title: "Barista Rohtak" },
      ],
    });
    assert.equal(text, "Currently ranking below: Coffee & Bite Cafe, Barista Rohtak.");
  });

  test("found, nothing above it", () => {
    assert.equal(
      summarizeCompetitors({ found: true, position: 1, competitors: [] }),
      "Nothing is currently ranking above this business for this query."
    );
  });

  test("not_found, with a preview of who's showing up", () => {
    const text = summarizeCompetitors({
      found: false,
      position: null,
      competitors: [{ position: 1, title: "Katpadi Kitchen" }],
    });
    assert.equal(text, "Not currently ranking in the local pack. Businesses currently appearing: Katpadi Kitchen.");
  });

  test("never checked (found: null), no competitor data available", () => {
    assert.equal(
      summarizeCompetitors({ found: null, position: null, competitors: [] }),
      "No competitor listings are available for this query right now."
    );
  });

  test("caps the competitor list at maxNames", () => {
    const text = summarizeCompetitors(
      {
        found: false,
        position: null,
        competitors: [
          { position: 1, title: "A" },
          { position: 2, title: "B" },
          { position: 3, title: "C" },
          { position: 4, title: "D" },
        ],
      },
      { maxNames: 2 }
    );
    assert.equal(text, "Not currently ranking in the local pack. Businesses currently appearing: A, B.");
  });
});

describe("buildInsightContext", () => {
  test("combines both summaries into one context block", () => {
    const { contextText } = buildInsightContext({
      history: [
        { position: 1, checkedAt: "2026-01-01" },
        { position: 5, checkedAt: "2026-01-03" },
      ],
      found: true,
      position: 5,
      competitors: [{ position: 1, title: "Coffee & Bite Cafe" }],
    });
    assert.equal(
      contextText,
      "Rank dropped from #1 to #5 over the last 2 checks. Currently ranking below: Coffee & Bite Cafe."
    );
  });
});

describe("selectRecommendation (rule layer, pure)", () => {
  const h = (...positions) => positions.map((position, i) => ({ position, checkedAt: `2026-01-0${i + 1}` }));

  test("rule 1: fell out of the local pack entirely", () => {
    const r = selectRecommendation({
      history: h(2, 3, null),
      found: false,
      position: null,
      competitors: [{ position: 1, title: "Katpadi Kitchen" }],
    });
    assert.equal(r.rule, "droppedOut");
    assert.equal(
      r.text,
      "You've dropped out of the local pack for this search. Check that your Google Business Profile is claimed, verified, and has accurate hours/category."
    );
  });

  test("rule 1 also covers never appearing in any check (checked, but not found)", () => {
    const r = selectRecommendation({ history: h(null, null), found: false, position: null, competitors: [] });
    assert.equal(r.rule, "droppedOut");
  });

  test("rule 2: dropped 3+ positions while still found names the competitor above", () => {
    const r = selectRecommendation({
      history: h(1, 3, 5),
      found: true,
      position: 5,
      competitors: [
        { position: 3, title: "Barista Rohtak" },
        { position: 1, title: "Coffee & Bite Cafe" },
      ],
    });
    assert.equal(r.rule, "dropped");
    assert.equal(
      r.text,
      "You dropped 4 positions. Coffee & Bite Cafe currently ranks above you — consider matching their review count or updating your listing photos."
    );
  });

  test("rule 2: exactly 3 positions counts; 2 does not", () => {
    const comp = [{ position: 1, title: "A" }];
    assert.equal(selectRecommendation({ history: h(2, 5), found: true, position: 5, competitors: comp }).rule, "dropped");
    assert.equal(selectRecommendation({ history: h(2, 4), found: true, position: 4, competitors: comp }).rule, "stable");
  });

  test("rule 2: falls back to generic wording when no competitor names are available", () => {
    const r = selectRecommendation({ history: h(1, 6), found: true, position: 6, competitors: [] });
    assert.equal(r.rule, "dropped");
    assert.equal(
      r.text,
      "You dropped 5 positions. Consider matching your top competitors' review counts or updating your listing photos."
    );
  });

  test("rule 3: steady rank", () => {
    const r = selectRecommendation({ history: h(2, 2, 2), found: true, position: 2, competitors: [{ position: 1, title: "A" }] });
    assert.equal(r.rule, "stable");
    assert.equal(r.text, RECOMMENDATIONS.stable);
    assert.equal(r.text, "Your ranking is stable/improving for this search. Keep up review responses and posting activity.");
  });

  test("rule 3: improving rank, and recovering from not-found", () => {
    assert.equal(selectRecommendation({ history: h(8, 4), found: true, position: 4, competitors: [] }).rule, "stable");
    assert.equal(selectRecommendation({ history: h(null, 6), found: true, position: 6, competitors: [] }).rule, "stable");
  });

  test("rule 4: no history at all", () => {
    const r = selectRecommendation({ history: [], found: null, position: null, competitors: [] });
    assert.equal(r.rule, "noData");
    assert.equal(r.text, "Not enough data yet — check back after a few days of tracking.");
  });

  test("rule 4: never checked (found: null) wins even if history is somehow non-empty", () => {
    assert.equal(selectRecommendation({ history: h(3), found: null, position: null, competitors: [] }).rule, "noData");
  });

  test("only the last maxChecks entries count toward a drop", () => {
    // 1 -> 9 happened outside the 2-check window; inside it rank is steady at 2.
    const r = selectRecommendation({ history: h(1, 9, 2, 2), found: true, position: 2, competitors: [] }, { maxChecks: 2 });
    assert.equal(r.rule, "stable");
  });
});
