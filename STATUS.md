# DukanDarpan: Project Status

Final status for the SerpApi India Hackathon 2026 submission (Commerce & Market Intelligence track), updated 2026-10-10.

**What it is:** a local-search rank tracker for small shops. It tracks where businesses rank on Google Maps (and regular
Google) through SerpApi, stores every check in Postgres (Neon), and turns the history into charts, competitor
intelligence, alerts and plain-language advice, on a web dashboard and through Telegram alerts.

**Stack:** Next.js 15 (App Router), React 18, Recharts, `@neondatabase/serverless`, `node-cron`, Node's built-in test runner.
**No external AI service:** the competitor teardown is deterministic code over stored SerpApi results.
External services: SerpApi (data), Neon (database), Telegram (optional alerts), OpenStreetMap Nominatim (turns a typed
place name into coordinates when a query is added; no key).

## Working

- Rank tracking on Google Maps and regular Google results through SerpApi, with a spare-key fallback. `lib/serpapi.mjs`, `lib/run-check.mjs`
- Daily scheduled check plus a "Run check now" button (1-hour cooldown per business). `lib/run-all-checks.mjs`, `lib/check-business.mjs`
- Dashboard: rank history chart, trend and size of move, "Not in top 20", stale-data banner. `components/`
- Competitor panel with review growth, benchmark against the top 3, and listing-health checklist. `lib/competitors.mjs`, `lib/benchmark.mjs`
- Alerts for rank drops, falling out of the top 20, and being overtaken by a named competitor, shown on the dashboard and sent to Telegram. `lib/alerts.mjs`, `lib/telegram.mjs`
- Share of Voice: Map Pack rank next to organic rank. `lib/share-of-voice.mjs`
- Deterministic competitor teardown in English and Hinglish. `lib/teardown.mjs`
- Share on WhatsApp (`wa.me` link, no backend). `lib/share-text.mjs`
- Judge mode: a clearly labeled sample category with 30 days of generated history, never searched live. `lib/demo-data.mjs`
- Offline test suite: 504 tests, no database, network or API keys needed (`npm test`).

## Known limits

- Adding queries has no login, by choice. Each added query is searched by the daily cron (1 credit a day), so the monthly credit budget is open to anyone who can reach a deployed site.
- "Run check now" is public, bounded by the 1-hour per-business cooldown.
- A map rank past 20 reads as "Not in top 20", so a move from #19 to #21 fires a "fell out" alert.
- The scheduled run is sequential with 3-second gaps, so it suits a handful of queries, not hundreds.
- A business tracked on two queries is not supported (the code assumes one query per business).
- Organic matching is name-based, so a business listed only under an aggregator page with a different name reads "not ranking organically".
- The Telegram bot only sends alerts; it has no commands.
- The `ai_insight*` database column names are historical. Nothing about them involves an AI.

## Not built

- Hosted deployment: the project is run locally and shown in the demo video.
- Editing or deleting a business or query from the UI.
- Multi-location grid tracking, CSV export, per-user accounts.
