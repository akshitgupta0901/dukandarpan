# DukanDarpan: Project Status Audit

Audited 2026-10-07. Nothing in the project was modified except this file.

**What it is:** a local-pack rank tracker for small businesses, built for the SerpApi India Hackathon 2026 (Commerce & Market Intelligence track).
- It tracks where named businesses rank in Google Maps results for "near me" style queries, using SerpApi's `google_maps` engine (and optionally `google` organic).
- It stores every check in Postgres (Neon), charts rank over time, and lists competitors ranking above a business.
- It sends Telegram alerts on rank drops and shows a rule-based recommendation card.
- **Stack:** Next.js 15.5 (App Router, JS/JSX, no TypeScript), React 18, Recharts 3, `@neondatabase/serverless`, `node-cron`, Node's built-in test runner. No lint config.
- **Layout:** `lib/` holds the logic, `app/api/` the routes, `components/` the UI, `db/` the migrations and seed, `scripts/` the CLIs and cron daemon.

## What I ran, and what I did not

| Check | Result |
| --- | --- |
| `npm ls` / `npm ci --dry-run` | Deps installed. Lockfile consistent, with 2 extraneous packages. |
| `npm test` (with `.env.local`) | **93/93 pass.** |
| `npm test` (simulated clean clone, no `.env.local`) | **2 suites fail** (see Blockers). |
| `next build` | Compiles. All 9 API routes plus `/` build. No type or lint step exists. |
| `next start` and API probes (GETs) | All endpoints return correct data and status codes (200/400/404/401). |
| Live DB (read-only queries) | Schema migrated, real data present (see Summary). |
| SerpApi account endpoint (does not use search credits) | Key valid. Free plan, **29/250 used, 221 left**. |
| Secrets scan | The real SerpApi key, Telegram token and DB password appear in **no file except `.env.local`** (gitignored). |

**Not verified:**
- **UI:** I have no browser here. The UI was verified by code reading only. The page serves HTTP 200, but I did not look at it rendered or on a phone.
- **Live SerpApi search and Telegram:** I did not spend a search credit and did not send a Telegram message. Stored `raw_results` rows prove real SerpApi calls worked on Sep 18–19 (`search_metadata.status = Success`, 20 results each).
- **Cron:** `/api/cron` was never executed here. No cron-triggered run exists in the DB.

---

## 1. Summary

**Overall completion: about 65%.**
- **Backend and data pipeline: about 90%.** Rank fetching, matching, storage, retry, alerts and insights all exist.
- **UI: about 75%.** The dashboard is complete for viewing. It cannot trigger a check.
- **Deployment: about 5%.** `vercel.json` exists and nothing is deployed.
- **Submission packaging: about 15%.** There are no commits, no repo remote, no demo or screenshots, and a thin README.

**Verdict:** the engine is solid and the SerpApi integration is real (not mocked), with sensible retry, quota-aware design and 93 passing tests. The project is not submittable yet, for three reasons:
- **The repo has zero commits.** Every file is untracked, so the whole project exists only on this disk.
- **The core flow cannot be completed from the UI.** You can add a business and query, but there is no way to fetch a rank except the CLI or a manual authenticated `curl`.
- **Nothing is deployed,** and the live data is thin. It spans 2 days (Sep 18–19), is almost all flat ranks, has never fired a single alert, and is now 17 days stale.

All of this is fixable in a few focused sessions. The riskiest item is the missing first commit.

**Live DB snapshot:**
- 13 businesses, 5 queries, 50 snapshots, 20 raw results, 4 manual runs, **0 cron runs, 0 alerts**.
- 2 cached insights, both generated Sep 19.

**Track fit:** reasonable, since it is competitor and market visibility for small businesses. It is shallow on "market intelligence", because only competitor names are shown. SerpApi returns ratings and review counts and the project stores them but never displays them.

---

## 2. Done and working

- [x] **Business and query data model**, 5 migrations that applied cleanly to Neon, tracked in `schema_migrations`. `db/migrations/0001..0005`, `db/migrate.mjs`
- [x] **Seed script** with Vellore demo data (11 businesses, 4 queries). `db/seed.mjs`
- [x] **Real SerpApi integration** (`google_maps` with `ll=@lat,lng,14z`, optional `google` organic). Missing key, HTTP errors and `json.error` all throw clear errors. `lib/run-check.mjs:11-26`
- [x] **Rank matching:** accent and punctuation normalization, filler-word stripping, token containment, tightest-match tiebreak, ambiguity flag. Tested against 8 real fixtures. `lib/rank-matcher.mjs`, `test/rank-matcher.test.mjs`
- [x] **Atomic snapshot storage** (`sql.transaction`), raw payload kept for every check. `lib/run-check.mjs:81-112`
- [x] **Batch runner:** sequential, 3s spacing, one retry per query, per-query failure isolation, credit accounting. `lib/run-all-checks.mjs`
- [x] **Durable run log and cron-slot guard:** one cron run per UTC day, stale-run reclaim after 20 minutes. `lib/run-all-checks.mjs:99-158`, `db/migrations/0002`
- [x] **Cron entry points:** Vercel daily 03:00 UTC (`vercel.json`), `/api/cron` and `/api/run-now` Bearer-protected by `CRON_SECRET` (401 confirmed), local `cron:daemon` fallback. `app/api/cron/route.js`, `app/api/run-now/route.js`, `scripts/cron-daemon.mjs`
- [x] **Credit conservation:** cron runs are maps-only (1 call per query), manual runs add organic (2 calls). `lib/run-all-checks.mjs:187`
- [x] **Geocoding** of place names (Nominatim) or direct `lat,lng`, with range validation. `lib/geocode.mjs`
- [x] **Add query and businesses** API plus form. Validation returns 400 (confirmed). `app/api/queries/route.js`, `components/AddQueryForm.jsx`
- [x] **Dashboard:** category tabs, business table with rank and trend arrows, "Not found" vs "Not yet checked" distinguished. `components/Dashboard.jsx`, `components/BusinessTable.jsx`, `app/api/businesses/route.js`, `app/api/categories/route.js`
- [x] **Rank-history chart:** inverted Y axis, gaps for not-found, light/dark theme, empty and all-not-found states. `components/RankChart.jsx`, `app/api/businesses/[id]/history/route.js`
- [x] **Competitors panel,** read from the stored raw response, so it includes untracked rivals. `lib/competitors.mjs`, `components/CompetitorPanel.jsx`
- [x] **Alert rule** (3+ position drop, or fell out of the pack), Telegram sender, alerts table, alerts panel in the UI. `lib/alert-rule.mjs`, `lib/alerts.mjs`, `lib/telegram.mjs`, `components/AlertsPanel.jsx`, `db/migrations/0004`. Logic is unit-tested with mocks only. See below.
- [x] **Rule-based recommendation card,** cached 24h, generated only on click. `lib/insight.mjs`, `lib/insight-context.mjs`, `components/InsightCard.jsx`, `app/api/businesses/[id]/insight/route.js`
- [x] **CLIs:** `check`, `check:all`, `test:alert`. `scripts/`
- [x] **Offline test suite,** 93 tests across 5 files. `test/`
- [x] **Secrets hygiene:** `.env.local` is gitignored, and no key appears anywhere else, including `.next`.
- [x] **Error, loading and empty states** exist in most components.
- [x] **Viewport meta** present, with responsive breakpoints at 720px and 560px. `app/globals.css:269`, `:393`, `:431`

## 3. Done but buggy or incomplete

1. **Core flow is not completable in the UI.** There is no "Run check" button, and `Dashboard.jsx` never calls `/api/run-now`. Adding a query or business leaves it at "Not yet checked" until the next cron. `/api/run-now` needs a Bearer secret the browser doesn't have. Files: `components/Dashboard.jsx`, `components/AddQueryForm.jsx`, `app/api/run-now/route.js`.
2. **Organic check uses a hardcoded location.** `ORGANIC_LOCATION = "Vellore, Tamil Nadu, India"` (`lib/run-check.mjs:9`, used at `:73`) is applied to every query. The Rohtak query's organic flag is computed against Vellore, so it is wrong. `in_organic_map_pack` is also never read by any API route or component, so manual runs pay double the credits for data that is never shown.
3. **`npm test` fails on a clean clone.** `lib/db.mjs:6-11` throws at import when `DATABASE_URL` is missing, which breaks `test/alerts.test.mjs` and `test/run-all-checks.test.mjs` even though they use mocks. Anyone cloning the repo (judges) and running tests sees failures.
4. **Unauthenticated write endpoints.** `POST /api/queries` and `POST /api/businesses/:id/insight` have no auth. On a public deploy, anyone can add queries, and each tracked query costs 1 credit per day on the 250/month free plan (5 queries use about 150/month already). If `CRON_SECRET` is unset in production, `/api/run-now` and `/api/cron` are also open (`app/api/cron/route.js:15-17` only logs a warning).
5. **Multi-query businesses break.** The code assumes one query per business (documented at `app/api/businesses/route.js:36-37`). The form upserts by (name, category), so adding the same business under a second query yields duplicate table rows and mixed history. No such rows exist yet (checked).
6. **Re-submitting a query with a different category** silently rewrites the query's category (`ON CONFLICT ... DO UPDATE`, `app/api/queries/route.js`), leaving its businesses in the old category. Categories are case-sensitive free text, so "Cafe" and "cafe" become separate tabs.
7. **False "fell out" alerts are possible.** `google_maps` returns about 20 results, and anything past the top 20 counts as `found: false`. A business sliding from #19 to #21 fires "fell out of the local pack". The alert logic is in `lib/alert-rule.mjs`, and the match runs over the 20 stored results.
8. **Long-run risk on Vercel.** The batch is sequential with 3s gaps and `maxDuration = 60` (`app/api/cron/route.js:6`). 5 queries take roughly 35s, but about 10 or more would time out mid-run. A reclaimed run restarts every query, creating duplicate snapshots and spending credits twice (`lib/run-all-checks.mjs:120-141`).
9. **Telegram sends with legacy `parse_mode: "Markdown"`** (`lib/telegram.mjs:23`). Business names containing `_` or `*` can fail with a parse error. The failure is recorded as `telegram_sent=false` and never retried.
10. **Alerts have never fired against real data** (0 rows in `alerts`). The Telegram path is verified only through mocks. `scripts/test-alert.mjs` exists, and I don't know whether you ever ran it.
11. **Next 15 sync `params` access** (`Number(params.id)`) in `app/api/businesses/[id]/{history,competitors,insight}/route.js`. It works today and is deprecated, and it breaks on Next 16.
12. **UI polish gaps:**
    - The insight card has no loading state for its initial GET, so it flashes "No recommendation yet".
    - Detail-fetch errors reuse the businesses error banner (`Dashboard.jsx`).
    - There is no `overflow-x` handling for the table on narrow screens.
    - None of this is visually verified.
13. **Recommendation feature is thin.** It has three canned strings plus a drop message. DB columns are still named `ai_insight*` (misleading, though the README is honest that no LLM is used).
14. **Dependency vulnerabilities:** `npm audit` reports 4 (1 moderate, 3 high). `sharp` and `source-map-js` are fixable with `npm audit fix`. The `postcss` via `next` issue needs a Next 16 major upgrade.
15. **Contact email hardcoded** in the Nominatim User-Agent (`lib/geocode.mjs:3`). It is harmless, but it will be public once the repo is pushed.
16. **Stray root file:** `explore-serpapi.mjs` (274 lines) is an exploration script that isn't mentioned in the README. It contains no secrets.
17. **Data is stale and uninteresting for a demo.** Snapshots span Sep 18–19 only, ranks are flat, and the newest is 17 days old.

## 4. Not started

- [ ] **First git commit**, remote, and public repo (**zero commits exist**)
- [ ] **`.env.local.example`.** `.gitignore:5` whitelists it, but the file doesn't exist. The README env table partly compensates.
- [ ] **Deployment:** no `.vercel/`, no live URL, and no evidence the Vercel cron or env vars are configured
- [ ] **Demo video / screenshots / submission write-up**
- [ ] README sections: problem statement, target user, solution overview, architecture, how SerpApi is used (engines, params, credit budget), hackathon-track statement, live link
- [ ] "Run check now" button and auto-check on add
- [ ] Edit/delete for businesses and queries
- [ ] Rating/review/price competitor intelligence from the stored `local_results`
- [ ] Auth or rate limiting on write endpoints, and a cap on tracked queries
- [ ] API-route, geocode, DB and UI tests, CI, and a lint config
- [ ] SerpApi quota display or warning in the UI
- [ ] Recovery alerts (not_found → found is silent by design, `lib/alert-rule.mjs:27-29`)

## 5. Blockers and errors (exact output)

```
fatal: your current branch 'main' does not have any commits yet
```
(`git log --oneline` on this repo)

Clean-clone `npm test` (no `.env.local`):
```
Error: DATABASE_URL is not set. Add it to .env.local (Neon connection string, as already saved there) or set it in your environment / deploy platform.
✖ test/alerts.test.mjs (105.660166ms)
✖ test/run-all-checks.test.mjs (103.728417ms)
ℹ tests 77
ℹ pass 75
ℹ fail 2
```

`next build` / `next start` warning:
```
Warning: Next.js inferred your workspace root, but it may not be correct.
We detected multiple lockfiles and selected the directory of /Users/akshitgupta/package-lock.json as the root directory.
```
A stray `/Users/akshitgupta/package-lock.json` (Mar 27) sits in your home directory. It is harmless locally. Remove it, or set `outputFileTracingRoot`.

`npm audit --omit=dev`:
```
4 vulnerabilities (1 moderate, 3 high)
sharp  <0.35.5  (GHSA-wq5f-xc86-pv6w)
source-map-js  1.0.0 - 1.2.1  (GHSA-68fv-2mgg-jv7q)
next -> postcss  (fix requires next@16.4.0, a breaking change)
```

`npm ls --depth=0`: `@emnapi/runtime@1.11.3 extraneous`, `@img/sharp-wasm32@0.35.4 extraneous`.

Everything else ran with no errors: the full `npm test` with `.env.local` (93/93), `next build`, and the server start.

## 6. Next steps (priority order)

| # | Task | Size | Files |
| --- | --- | --- | --- |
| 1 | **Make the first commit, create a GitHub repo, push.** Add `.env.local.example` with placeholder values only. Do this before anything else, since the project is currently one disk failure from gone. | S | `.gitignore`, new `.env.local.example`, whole tree |
| 2 | **Fix the two correctness issues.** (a) Pass the query's own location to the organic call, or drop the organic call, since nothing reads `in_organic_map_pack`. (b) Make `lib/db.mjs` lazy so `npm test` passes without `DATABASE_URL`. | S | `lib/run-check.mjs:9,73`, `lib/db.mjs:6-13`, `test/alerts.test.mjs`, `test/run-all-checks.test.mjs` |
| 3 | **Close the core flow in the UI and protect it.** Add a "Run check now" button, or auto-check on add. Route it through a server-side action so the secret never reaches the browser. Also gate or cap `POST /api/queries` so strangers can't burn your 250 credits. | M | `components/Dashboard.jsx`, `components/AddQueryForm.jsx`, `app/api/queries/route.js`, `app/api/run-now/route.js` |
| 4 | **Deploy to Vercel.** Set all 5 env vars including `CRON_SECRET`, run migrations against Neon, and confirm the 03:00 UTC cron writes a `cron_runs` row. Then you get fresh daily data. If you won't have 10+ queries, the 60s limit is fine. | M | `vercel.json`, `app/api/cron/route.js`, `README.md` (add live URL) |
| 5 | **Rewrite the README and capture the demo assets.** Cover problem, target user, solution, how SerpApi is used (engines, params, credit budget), the track statement, and the live link. Add screenshots, and record a short demo video once there are a few days of real data. If time allows, show rating and review counts in the competitor panel to strengthen the "market intelligence" angle (M, `lib/competitors.mjs`, `components/CompetitorPanel.jsx`). | M | `README.md`, `lib/competitors.mjs`, `components/CompetitorPanel.jsx` |

I don't know the hackathon deadline, so check it. It decides whether item 4 (data accumulation) is feasible.

Smaller follow-ups once the above are done: items 5–11 and 14 in section 3, then `npm audit fix`.

## 7. Last worked on

There is no git history, so this is from file modification times.
- **Sep 18, 12:27–13:41:** project scaffold, fixtures (the real SerpApi responses), migrations 0001–0003, seed, and `npm install`. The first real checks hit SerpApi at 07:24 UTC that day.
- **Sep 19, 15:39–16:10:** the cron, alerts and API layer (`app/api/*`, `scripts/*`, `lib/run-all-checks.mjs`) and `explore-serpapi.mjs`. The last real SerpApi run was at 10:08 UTC (15:38 local).
- **Sep 19, 19:31:** `components/Dashboard.jsx`.
- **Sep 19, 19:46, the most recent edits:** Phase 7, the rule-based insight feature. That covers `lib/insight.mjs`, `lib/insight-context.mjs`, `lib/competitors.mjs`, `components/InsightCard.jsx`, the `insight` and `competitors` routes, migration `0005`, `app/globals.css`, `package.json`/lockfile, and `README.md`. The last insight was cached at 20:48 UTC that day.

Nothing has been touched for 18 days. The project was last worked on as the insight card and README were being finalized. The git repo itself was only initialized today (`.git` modified Oct 7, 11:42).

*Housekeeping from this audit:* I ran `next build`, which regenerated the gitignored `.next/` folder. I ran read-only SQL against your Neon DB, called SerpApi's free account endpoint (no search credit used), and left scratch files under the session scratchpad directory, not the project.
