"use client";

import DemoBadge from "./DemoBadge";

function formatAlertTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function AlertBadge({ type }) {
  const label = type === "fell_out" ? "Fell out" : type === "overtaken" ? "Overtaken" : "Rank drop";
  return <span className="alert-badge">{label}</span>;
}

/**
 * Phase 6: a simple, always-visible record of alerts that fired, so a demo
 * doesn't depend on anyone having Telegram open. Purely a read of
 * /api/alerts (the `alerts` table lib/alerts.mjs writes to) -- no
 * evaluation happens here.
 */
export default function AlertsPanel({ alerts, loading, error, onRefresh }) {
  return (
    <div className="card">
      <div className="alerts-header">
        <h2 className="card-title">Recent alerts</h2>
        <button className="btn" onClick={onRefresh} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading && alerts.length === 0 ? (
        <p className="loading">Loading…</p>
      ) : alerts.length === 0 ? (
        <p className="empty-state">
          No alerts yet — they'll show up here after a check finds a 3+ position drop, a business
          falling out of the local pack, or a competitor overtaking you.
        </p>
      ) : (
        <ul className="alert-list">
          {alerts.map((a) => (
            <li key={a.id} className="alert-item">
              <AlertBadge type={a.alertType} />
              <div className="alert-body">
                <div className="alert-headline">
                  <span className="business-name">{a.businessName}</span>
                  {/* An overtake message starts with the competitor's name ("X just outranked you"), so set it off. */}
                  {a.alertType === "overtaken" ? " — " : " "}
                  {a.message}
                  {a.isDemo && <DemoBadge label="Demo" />}
                </div>
                <div className="alert-meta">
                  "{a.queryText}" ({a.category}) · {formatAlertTime(a.createdAt)} ·{" "}
                  {a.isDemo ? (
                    <span>Sample alert, nothing was sent</span>
                  ) : (
                    <span className={a.telegramSent ? "alert-delivery-ok" : "alert-delivery-fail"}>
                      {a.telegramSent ? "Telegram sent" : "Telegram not sent"}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
