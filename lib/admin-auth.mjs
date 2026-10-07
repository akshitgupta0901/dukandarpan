import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared-admin-key gate for routes that change what gets tracked (and so what
 * the daily cron spends SerpApi credits on). The key is typed by the admin
 * into the dashboard form and sent as the `x-admin-key` header; it is never
 * baked into the page or the JS bundle.
 *
 * Unset key: open in local development (so `npm run dev` works with no
 * setup), but CLOSED in production, so forgetting to configure it on a deploy
 * can't leave the route open to strangers.
 *
 * Pure (inputs in, decision out) so it's testable without a server.
 *
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function authorizeAdmin({ provided, expected, nodeEnv }) {
  if (!expected) {
    if (nodeEnv === "production") {
      return { ok: false, status: 503, error: "Adding queries is disabled: ADMIN_KEY isn't set on the server." };
    }
    return { ok: true };
  }
  if (!provided) {
    return { ok: false, status: 401, error: "Admin key required to add queries." };
  }
  // Hash both sides so the comparison is constant-time even when lengths differ.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Wrong admin key." };
  }
  return { ok: true };
}
