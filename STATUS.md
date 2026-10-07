# DukanDarpan: Project Status

Updated 2026-10-07, after the five-step feature push. The first audit of this file (93 tests, no commits, no demo
data, nothing deployed) is superseded by what follows.

**What it is:** a local-search rank tracker for small shops, for the SerpApi India Hackathon 2026 (Commerce & Market
Intelligence). It tracks where businesses rank on Google Maps (and regular Google) through SerpApi, stores every
check in Neon Postgres, and turns the history into charts, competitor intelligence, alerts and plain-language advice.
**Stack:** Next.js 15 (App Router, JS/JSX), React 18, Recharts, `@neondatabase/serverless`, `node-cron`, Node's built-in
test runner. Gemini (plain `fetch`, optional) for the AI teardown.

## 1. Summary

**Overall: about 75% complete.**
- **Product features: about 90%.** Everything planned is built and tested offline.
- **Verified against real services: about 40%.** A lot of this session's work could only be checked with fakes (see section 3).
- **Deployment: about 5%.** Nothing is deployed and the production database has not been migrated.
- **Submission packaging: about 30%.** README now covers problem, solution, SerpApi usage, credits and track fit; there
  are no screenshots, demo video or live link yet.

**Verdict:** the feature set is now strong for a hackathon: rank history, competitor intelligence (review growth,
overtake alerts, benchmark, listing health), Share of Voice, an AI teardown with a safe rule-based fallback, a
Run-check button, WhatsApp sharing, and a labeled judge-mode dataset so the site is full on first open. 341 offline tests
pass, including in a clean clone with no `.env.local`. The remaining risk is almost entirely "has this been run against
the real thing": the new SQL, the migrations, a live organic search and the Gemini call have not. That is a short,
mostly mechanical list (section 6), and it should happen before the demo, not after.

## 2. Done and working (tests pass; see section 3 for what is unproven live)

- [x] **SerpApi integration with spare-key fallback**, out-of-searches detection, non-JSON error handling, keys never in errors. `lib/serpapi.mjs`, `lib/run-check.mjs`
- [x] **Rank matching** for map listings (token) and regular results (whole word, title and link). `lib/rank-matcher.mjs`
- [x] **Daily cron + durable run log**, one run per UTC day, retry once, demo queries skipped. `lib/run-all-checks.mjs`, `app/api/cron/route.js`, `vercel.json`
- [x] **Run check now**: server-side route, 1-hour per-business cooldown, per-query in-flight guard, demo refused, 2 credits (1 without a place name). `lib/check-business.mjs`, `lib/check-cooldown.mjs`, `lib/check-cost.mjs`, `app/api/businesses/[id]/check/route.js`, `components/RunCheckButton.jsx`
- [x] **Dashboard**: category tabs, table with rank, trend and size of move, "Not in top 20", year in timestamps, stale-data banner, chart with unique x-axis labels (first and last always shown), friendly error on non-JSON responses. `components/Dashboard.jsx`, `BusinessTable.jsx`, `RankChart.jsx`, `lib/fetch-json.mjs`
- [x] **Competitor panel with review growth and rating change** over 7 days from stored responses. `lib/review-growth.mjs`, `lib/competitors.mjs`, `components/CompetitorPanel.jsx`
- [x] **Alerts**: rank drop (3+), fell out of top 20, and **overtaken** (names the competitor, max 2 per business per check, only when the business's new position is #10 or better); Telegram text escapes Markdown characters. `lib/overtake.mjs`, `lib/alerts.mjs`, `lib/alert-rule.mjs`, `components/AlertsPanel.jsx`
- [x] **Share of Voice**: Map Pack rank next to organic rank, with a visibility-gap sentence; organic uses each query's own saved place name (the hardcoded Vellore location is gone). `lib/share-of-voice.mjs`, `lib/rank-matcher.mjs`, `components/ShareOfVoice.jsx`
- [x] **AI competitor teardown**: benchmark vs the top 3, listing-health checklist, Gemini client, prompt, and answer checks (exactly 2 sentences, no markdown, no numbers outside the data); any failure falls back to the rule-based text. `lib/benchmark.mjs`, `lib/llm.mjs`, `lib/teardown.mjs`, `lib/insight.mjs`, `components/BenchmarkPanel.jsx`, `components/InsightCard.jsx`
- [x] **Hinglish option** (Roman script, cache keyed by language, rule-based fallback stays English). `lib/teardown.mjs`, `lib/insight.mjs`, `app/api/businesses/[id]/insight/route.js`
- [x] **Share on WhatsApp** (`wa.me` link, sample data labeled). `lib/share-text.mjs`, `components/WhatsAppShare.jsx`
- [x] **Judge mode**: deterministic 30-day fictional dataset, seed script with `--dry-run` and unseed, labels everywhere, never searched live. `lib/demo-data.mjs`, `lib/demo.mjs`, `db/seed-demo.mjs`, `components/DemoBadge.jsx`
- [x] **Schema**: 10 additive, re-runnable migrations, linted by a test. `db/migrations/0001..0010`, `test/migrations.test.mjs`
- [x] **Tests**: 341, offline, no database, network or keys; clean-clone safe (lazy DB connection). `test/`
- [x] **Docs**: README with problem, features, SerpApi usage, credit table, track fit, setup, env vars, judge mode. `.env.local.example` lists every variable.

## 3. Done but not verified against the real thing

I could not exercise these here (no DB writes, no SerpApi credits, no real LLM were allowed). All are covered by offline
tests or fakes, but none has run live:

- **Migrations 0006 to 0010 have not been applied** to your Neon database. Until they are, the dashboard's categories,
  businesses and alerts routes error (they read `queries.is_demo`, `alerts.competitor_name`, and others) and the cron
  would fail. **Run `npm run db:migrate` before using the app.**
- **New SQL is untested on Postgres**: the businesses query (a `LEFT JOIN LATERAL` for the newest organic check), the
  review-growth history query (`jsonb_agg` over `jsonb_array_elements`), the check route's target lookup, and the
  seed's batched inserts. No Postgres was available locally to even syntax-check them.
- **A live organic search.** SerpApi's `location` parameter accepts the free-text place name a user typed; if it rejects
  one, the check keeps the map result and logs a warning (the failure is non-fatal), but I haven't seen that happen.
- **The Gemini call.** The endpoint (`v1beta/models/{model}:generateContent`), the `x-goog-api-key` header and the default
  model `gemini-3.5-flash-lite` come from Google's current docs, not from a live call. The answer checks are strict
  (exactly 2 sentences, numbers only from the data), so a real model may be rejected more often than expected, in which
  case users simply see the rule-based text.
- **Telegram** delivery of the new alert type and the escaping change.
- **Real-browser behavior beyond screenshots**: I rendered the dashboard in headless Chrome (light, dark, 390px wide)
  against fake API data, and saw no console errors or horizontal overflow, but never against your real database.

## 4. Known gaps and risks

- **Adding queries has no login (your decision).** Every added query is searched by the daily cron (1 credit a day), so
  the credit budget is open to whoever can reach the site.
- **"Run check now" is public** (bounded by the 1-hour per-business cooldown, which only the same server instance
  enforces for simultaneous clicks).
- **A map rank past 20 reads as "Not in top 20"**, and a business sliding from #19 to #21 fires a "fell out" alert.
- **Telegram volume**: one check can send up to 3 messages for a business (a rank drop plus 2 overtakes).
- **Scale**: the scheduled run is sequential with 3s gaps under a 60s function limit, so roughly 10+ queries would time
  out mid-run; a reclaimed run restarts every query.
- **A business tracked on two queries** breaks the table and history (the code assumes one query per business).
- **Organic matching is name-based**, so a business listed only under an aggregator page (Justdial, Swiggy) with a
  different name will read "not ranking organically".
- Several routes still read `params.id` synchronously (works on Next 15, breaks on Next 16): history, competitors.
- `npm audit` reports 4 vulnerabilities (sharp, source-map-js fixable with `npm audit fix`; postcss via next needs Next 16).
- `explore-serpapi.mjs` (a stray exploration script) prints the first 6 and last 4 characters of the API key.
- The `ai_insight*` column names are historical (the card is no longer purely AI, and no longer purely rule-based).

## 5. Not started

- [ ] Deployment (no Vercel project, no live URL, production DB not migrated)
- [ ] Screenshots and a demo video; live URL in the README
- [ ] Pushing to GitHub (commits exist locally; nothing is pushed)
- [ ] Editing or deleting a business or query from the UI
- [ ] Multi-location grid tracking, CSV export, per-user accounts

## 6. Next steps (priority order)

| # | Task | Size | Files |
| --- | --- | --- | --- |
| 1 | **Prove it on a Neon branch.** `npm run db:migrate`, `npm run db:seed:demo`, then click through the dashboard. This is what verifies every SQL statement and migration listed in section 3. | S | `db/migrate.mjs`, `db/seed-demo.mjs` |
| 2 | **Deploy to Vercel.** Set `DATABASE_URL`, `SERPAPI_API_KEY`, `SERPAPI_API_KEY_2`, `CRON_SECRET`, `GEMINI_API_KEY`, Telegram vars; migrate and seed the production DB; confirm the 03:00 UTC cron writes a run. | M | `vercel.json`, `README.md` |
| 3 | **One live pass of each paid call.** One "Run check now" on a real business (2 credits) and one "Get insight" with a Gemini key, to confirm the organic search, the model name and that real answers pass the checks. | S | `lib/run-check.mjs`, `lib/llm.mjs`, `lib/teardown.mjs` |
| 4 | **Screenshots and a 60 to 90 second demo video**; add the live URL and images to the README. Seed demo data right before recording so dates are current. | M | `README.md` |
| 5 | **Push to GitHub**, then tidy: `await params` in the remaining routes, drop the key fragment print in `explore-serpapi.mjs`, run `npm audit fix`. | S | `app/api/businesses/[id]/history/route.js`, `.../competitors/route.js`, `explore-serpapi.mjs` |

## 7. Last worked on

All of today (2026-10-07), in this order (see `git log`):
1. Initial commit, then dashboard polish (stale banner, "Not in top 20", trend size, chart labels).
2. Friendly non-JSON errors, lazy database connection (tests run without `DATABASE_URL`), the Run-check button.
3. Spare SerpApi key fallback.
4. Judge-mode demo data, then the AI teardown (benchmark, listing health, Gemini with fallback), overtake alerts and
   review growth, Share of Voice with per-query location, and the WhatsApp and Hinglish polish.
5. This README and STATUS update.
