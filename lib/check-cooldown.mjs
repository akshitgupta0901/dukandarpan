// Shared by the "Run check now" API route (enforcement) and the dashboard
// (disabling the button), so both agree on the rule.
export const CHECK_COOLDOWN_MS = 60 * 60 * 1000; // a business can't be re-checked within 1 hour

/**
 * Milliseconds until `lastCheckedAt` is more than an hour old; 0 if never checked or already past.
 * Capped at the cooldown length: a timestamp slightly ahead of this machine's clock (browser vs
 * server vs database) must not produce "wait 61 minutes".
 */
export function cooldownRemainingMs(lastCheckedAt, now = Date.now()) {
  if (!lastCheckedAt) return 0;
  const remaining = new Date(lastCheckedAt).getTime() + CHECK_COOLDOWN_MS - now;
  return remaining > 0 ? Math.min(remaining, CHECK_COOLDOWN_MS) : 0;
}

/** "48 minutes", "1 minute", or "under a minute". Rounds up so it never promises less than the real wait. */
export function formatWait(ms) {
  const minutes = Math.ceil(ms / 60000);
  if (minutes <= 0) return "under a minute";
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
