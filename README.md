# DukanDarpan

*A mirror for your shop: see where it shows up on Google Maps, who is beating it, and what to fix.*

Built for the **SerpApi India Hackathon 2026**, Commerce & Market Intelligence track.

## The problem

A small shop's customers search "cafe near me", "salon in Katpadi", "gym near VIT". Whoever shows up in the top few
Google Maps results gets the walk-ins, and the owner has no way to see where they stand, whether they are slipping,
or why a competitor is ahead. Rank trackers exist, but they are priced and built for agencies, not for a shop owner.

## What DukanDarpan does

It tracks a set of businesses against real Google Maps (and regular Google) results through
[SerpApi](https://serpapi.com/), once a day and on demand, and turns the history into things an owner can act on:

- **Rank over time.** Every check is stored; a chart shows each business's rank, with a trend arrow and the size of the move.
- **Who is beating you.** The competitors ranked above a business, with their review counts, ratings, and how many
  reviews they gained this week (read from stored results, so it costs nothing extra).
- **Overtake alerts.** When a competitor that was behind you passes you and you are still ranked #10 or better, you get an alert naming them
  ("Kettle & Crumb just outranked you (you are now #3, they are #2)"), plus the usual alerts for a drop of 3+ places or
  falling out of the top 20. Alerts go to Telegram and show on the dashboard.
- **Share of voice.** "Map Pack: #3 | Organic: not ranking organically", with a plain-language note when you are
  strong on the map but invisible in regular Google results.
- **Competitor teardown, based on your SerpApi results.** Two plain sentences on what your listing is missing compared
  with the top 3, quoting the exact numbers (reviews vs their average, rating, website, claimed listing, phone, closing
  time, online ordering), and the one thing to fix first by a fixed priority. It is written by deterministic code from
  the search results already stored, so the same data always gives the same text, with no external service involved.
  Available in English and Hinglish (Roman script). It sits beside a benchmark (rating, reviews, price level) and a
  listing-health checklist. When there is nothing to compare, it falls back to built-in rule-based advice.
- **Run check now.** A button that checks the selected business immediately (with a 1-hour cooldown per business).
- **Share on WhatsApp.** A one-tap summary (rank, change, top competitor, advice) as a `wa.me` link, no backend.
- **Judge mode.** A clearly labeled sample category with 30 days of generated history, so the dashboard is full the
  moment it opens (see below).

Everything the dashboard shows comes from SerpApi responses stored in Postgres, so reading it never spends a credit.

## How SerpApi is used

| Call | Engine and key parameters | When | Cost |
| --- | --- | --- | --- |
| Map results | `engine=google_maps`, `type=search`, `q=<query>`, `ll=@lat,lng,14z` | every check | 1 credit |
| Regular results | `engine=google`, `q=<query>`, `location=<place name saved with the query>`, `gl=in`, `hl=en` | manual checks only, and only for queries saved with a place name | 1 credit |

- **Matching.** A business is matched to a result by name (accent- and punctuation-insensitive, ignoring words like
  "cafe" or "pvt"): token matching for map listings, whole-word matching in the title and link for regular results.
  Only the first 20 map results are visible, so a rank past 20 is shown as "Not in top 20".
- **Raw responses are kept** (`raw_results`), which is what powers competitor lists, review growth, overtake
  detection and the benchmark with no further credits.
- **Spare key.** If the first account reports it has run out of searches, an optional second key
  (`SERPAPI_API_KEY_2`) is used automatically, and a key seen out is skipped for an hour. Keys never appear in logs or errors.
- **Retries.** The scheduled run retries a failed query once, with a 3-second gap between searches.

### Credit usage

| Action | SerpApi credits |
| --- | --- |
| Daily cron (`/api/cron`) | **1 per tracked query**, maps only (about `queries x 30` a month) |
| "Run check now" | **2** (map + regular results), or **1** if the query was added with coordinates instead of a place name |
| `/api/run-now` (needs `CRON_SECRET`) | up to 2 for **every** query |
| Competitor panel, review growth, overtake alerts, benchmark, share of voice, WhatsApp text | 0 (stored data) |
| Competitor teardown card | 0 (written from stored results by plain code; cached 24 hours, regenerated on a click) |
| Judge-mode demo data | 0 (demo queries are never searched) |

## Track fit: Commerce & Market Intelligence

DukanDarpan is market intelligence for the smallest commercial players: it measures a shop's visibility against its
local competitors on the channel that drives walk-in commerce, watches those competitors (rank moves, review velocity,
rating changes, listing quality), and says what to do about it in plain language.

## Setup

```bash
npm install
npm run db:migrate   # applies every db/migrations/*.sql that hasn't run yet (idempotent)
npm run db:seed      # optional: the original Vellore sample businesses
npm run dev
```

## Environment variables

Create `.env.local` in the project root (never committed, see `.gitignore`). `.env.local.example` lists every variable.

| Variable | Required for | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | everything (the app fails to even start without it) | A [Neon](https://neon.tech) Postgres connection string (`postgres://...`). Free tier is enough. |
| `SERPAPI_API_KEY` | running rank checks (`npm run check`, `npm run check:all`, the cron routes, the button) | Sign up at [serpapi.com](https://serpapi.com/) → your [dashboard](https://serpapi.com/dashboard) has the key. |
| `SERPAPI_API_KEY_2` (optional) | a spare key, used only when the first account runs out of searches | A teammate's key, with their permission. Put it in `.env.local` / your host's env settings only. |
| `CRON_SECRET` | protecting `/api/cron` and `/api/run-now` once deployed | Any random string you pick yourself (e.g. `openssl rand -hex 32`). Optional locally: those routes skip the auth check when it's unset. |
| `TELEGRAM_BOT_TOKEN` | alert delivery to Telegram | Message [@BotFather](https://t.me/BotFather) on Telegram, `/newbot`, follow the prompts. |
| `TELEGRAM_CHAT_ID` | alert delivery to Telegram | Message your new bot once, then open `https://api.telegram.org/bot<TOKEN>/getUpdates`; your chat id is `message.chat.id`. |

Each key is only needed by the feature it powers. **SerpApi is the only service key the app needs for its data and
analysis.** It runs without Telegram too: alerts still appear on the dashboard.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | standard Next.js dev/build/start (don't run `build` while `dev` is running: they share `.next`) |
| `npm test` | runs the offline test suite (`test/*.test.mjs`): no database, network or API keys needed |
| `npm run db:migrate` | applies pending migrations from `db/migrations/` |
| `npm run db:seed` | seeds the original Vellore sample businesses |
| `npm run db:seed:demo` / `db:unseed-demo` | adds / removes the labeled judge-mode demo data (see below) |
| `npm run check` | runs one rank-check for a single query, no alerts (see `scripts/run-check-cli.mjs`) |
| `npm run check:all` | runs every tracked query, same as the scheduler: evaluates and sends alerts |
| `npm run cron:daemon` | local/self-hosted fallback scheduler (use this OR Vercel Cron, not both) |
| `npm run test:alert` | sends one real Telegram message using your real credentials, without touching the database |

## Judge mode (demo data)

A fresh database has no history, which makes a dashboard look empty. Judge mode fills a **"demo cafe"** category with
30 days of generated, clearly fictional data: a hero business ("Brew & Bloom Cafe") that climbs from about #12 to #3
but has far fewer reviews than the top three, no website and an unclaimed listing; two more tracked businesses; 19
fictional competitors; rank-drop, fell-out and overtake alerts; review growth; Share of Voice; and a pre-filled
competitor teardown. The dashboard opens on the Demo tab, and everything generated is labeled "Demo data".

```bash
npm run db:migrate                       # adds queries.is_demo and the other columns (migrations 0006 to 0010)
npm run db:seed:demo -- --dry-run        # preview only: prints a summary, needs no database
npm run db:seed:demo                     # replace any earlier demo data and insert fresh
npm run db:unseed-demo                   # remove the demo data (real data is never touched)
```

- **Safe by design:** demo queries are skipped by the cron and by "Run check now" (a live check on sample data is
  refused with a message), so they never cost a SerpApi credit. The seed makes no SerpApi calls and sends no Telegram messages.
- The seed pre-fills the hero's competitor teardown from the generated results (no external call, no credit), so the
  card opens with a real sentence: about 14 growing to 30 reviews against a top-3 average in the hundreds, no website,
  an unclaimed listing.
- **Timestamps are relative to when you run the seed** (newest check = now). Re-run `npm run db:seed:demo` before a demo
  to refresh the dates, and **re-run it after any migration that adds columns** so the demo rows carry the new fields.
  It first deletes the previous demo data, so it is safe to repeat.
- The generator is deterministic (`lib/demo-data.mjs`), so the story is the same every time. To try it without touching
  your main database, point `DATABASE_URL` at a [Neon branch](https://neon.tech/docs/introduction/branching).

## Protections

- `/api/cron` and `/api/run-now` require `Authorization: Bearer <CRON_SECRET>` when it is set.
- "Run check now" (`POST /api/businesses/:id/check`) needs no secret in the browser: a business can't be re-checked
  within an hour, only one check per query runs at a time, and demo data is refused.
- The competitor teardown is cached for 24 hours and only regenerated on an explicit click.
- Adding queries (`POST /api/queries`) has no login, by choice. Each query that is added is searched by the daily cron
  (1 credit a day), so that is where the monthly credit budget goes.

## Deploying

`vercel.json` has a daily cron entry hitting `/api/cron`. Set the same environment variables above in your Vercel
project settings, run `npm run db:migrate` against the production database, and either rely on Vercel Cron or run
`npm run cron:daemon` yourself, not both (see the comment in `scripts/cron-daemon.mjs`).
