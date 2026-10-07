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
| `npm run check` | runs one rank-check for a single query, no alerts (see `scripts/run-check-cli.mjs`) |
| `npm run check:all` | runs every tracked query, same as the scheduler — evaluates and sends alerts |
| `npm run cron:daemon` | local/self-hosted fallback scheduler (use this OR Vercel Cron, not both) |
| `npm run test:alert` | sends one real Telegram message using your real credentials, without touching the database (see `scripts/test-alert.mjs`) |

## Deploying

`vercel.json` has a daily cron entry hitting `/api/cron`. Set the same
environment variables above in your Vercel project settings, and either
rely on Vercel Cron or run `npm run cron:daemon` yourself — not both (see
the comment in `scripts/cron-daemon.mjs`).
