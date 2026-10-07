# DukanDarpan

Local-pack rank tracking for the SerpApi India Hackathon. Tracks a set of
local businesses against SerpApi's `google_maps` (and, optionally, `google`
organic) engine on a schedule, stores every check, charts rank over time,
flags competitors ranking above a business, alerts you on Telegram when a
business drops, and shows a short rule-based recommendation card for any
business's current situation (no external API or LLM involved).

## Setup

```bash
npm install
npm run db:migrate   # applies every db/migrations/*.sql that hasn't run yet
npm run db:seed       # optional: seed data
npm run dev
```

## Environment variables

Create `.env.local` in the project root (never committed — see
`.gitignore`) with:

| Variable | Required for | Where to get it |
| --- | --- | --- |
| `DATABASE_URL` | everything (the app fails to even start without it) | A [Neon](https://neon.tech) Postgres connection string (`postgres://...`). Free tier is enough. |
| `SERPAPI_API_KEY` | running rank checks (`npm run check`, `npm run check:all`, the cron routes) | Sign up at [serpapi.com](https://serpapi.com/) → your [dashboard](https://serpapi.com/dashboard) has the key. |
| `SERPAPI_API_KEY_2` (optional) | a spare key, used only when the first account runs out of searches | A teammate's key, with their permission. Put it in `.env.local` / your host's env settings only. |
| `CRON_SECRET` | protecting `/api/cron` and `/api/run-now` once deployed | Any random string you pick yourself (e.g. `openssl rand -hex 32`). Optional locally — those routes skip the auth check when it's unset. |
| `TELEGRAM_BOT_TOKEN` | Phase 6 alert delivery | Message [@BotFather](https://t.me/BotFather) on Telegram, `/newbot`, follow the prompts — it gives you the token. |
| `TELEGRAM_CHAT_ID` | Phase 6 alert delivery | Message your new bot once (anything), then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser — your chat id is in the JSON response (`message.chat.id`). |

`SERPAPI_API_KEY` and `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are each only
required by the specific feature they power — the app runs fine without
Telegram configured, that feature just errors (visibly, in the UI) if used
without its keys set. The recommendation card needs no extra key.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | standard Next.js dev/build/start |
| `npm test` | runs the offline test suite (`test/*.test.mjs`) |
| `npm run db:migrate` | applies pending migrations from `db/migrations/` |
| `npm run db:seed` | seeds sample data |
| `npm run db:seed:demo` / `db:unseed-demo` | adds / removes the labeled judge-mode demo data (see below) |
| `npm run check` | runs one rank-check for a single query, no alerts (see `scripts/run-check-cli.mjs`) |
| `npm run check:all` | runs every tracked query, same as the scheduler — evaluates and sends alerts |
| `npm run cron:daemon` | local/self-hosted fallback scheduler (use this OR Vercel Cron, not both) |
| `npm run test:alert` | sends one real Telegram message using your real credentials, without touching the database (see `scripts/test-alert.mjs`) |

## Judge mode (demo data)

A fresh database has no history, which makes a dashboard look empty. Judge mode
fills a **"demo cafe"** category with 30 days of generated, clearly fictional
data: a hero business ("Brew & Bloom Cafe") that climbs from about #12 to #3,
two more tracked businesses, 19 fictional competitors, rank-drop alerts and a
pre-filled recommendation. It opens on the Demo tab, and everything generated
is labeled "Demo data" in the UI.

```bash
npm run db:migrate                       # adds queries.is_demo (migration 0006)
npm run db:seed:demo -- --dry-run        # preview only: prints a summary, needs no database
npm run db:seed:demo                     # replace any earlier demo data and insert fresh
npm run db:unseed-demo                   # remove the demo data (real data is never touched)
```

- **Safe by design:** demo queries are skipped by the cron and by "Run check now"
  (a live check on sample data is refused with a message), so they never cost a
  SerpApi credit. The seed makes no SerpApi calls and sends no Telegram messages.
- **Timestamps are relative to when you run the seed** (newest check = now). Re-run
  `npm run db:seed:demo` before a demo to refresh the dates. It first deletes the
  previous demo data, so it is safe to repeat.
- The generator is deterministic (`lib/demo-data.mjs`), so the story is the same
  every time. To try it without touching your main database, point
  `DATABASE_URL` at a [Neon branch](https://neon.tech/docs/introduction/branching).

## Deploying

`vercel.json` has a daily cron entry hitting `/api/cron`. Set the same
environment variables above in your Vercel project settings, and either
rely on Vercel Cron or run `npm run cron:daemon` yourself — not both (see
the comment in `scripts/cron-daemon.mjs`).
