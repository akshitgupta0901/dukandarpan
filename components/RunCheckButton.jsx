"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetch-json.mjs";
import { cooldownRemainingMs, formatWait } from "../lib/check-cooldown.mjs";
import { manualCheckCredits } from "../lib/check-cost.mjs";

/**
 * "Run check now" for one business. Posts to /api/businesses/:id/check, a
 * server-side route that needs no secret from the browser (see
 * lib/check-business.mjs). The parent keys this component by business id, so
 * messages and the running state reset when another business is selected.
 *
 * `business.checkedAt` drives the cooldown display; the server enforces the
 * same 1-hour rule, so this is only a courtesy to avoid a pointless click.
 */
export default function RunCheckButton({ business, onChecked }) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const waitMs = cooldownRemainingMs(business.checkedAt, now);

  async function handleClick() {
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fetchJson(
        `/api/businesses/${business.id}/check`,
        { method: "POST" },
        "Couldn't run the check, try again"
      );
      setNow(Date.now());
      const used = result.serpApiCallsMade;
      const alertText = result.alertsFired > 0 ? ` · ${result.alertsFired} alert${result.alertsFired === 1 ? "" : "s"} fired` : "";
      setNotice(`Checked just now · used ${used} search credit${used === 1 ? "" : "s"}${alertText}`);
      await onChecked?.(result);
    } catch (err) {
      setNow(Date.now());
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  const credits = manualCheckCredits(business.organicEnabled);
  let note =
    credits === 2
      ? "Uses 2 search credits: the map and regular Google results. Updates every business on this search."
      : "Uses 1 search credit (map only). Updates every business on this search.";
  if (running) note = `Checking Google Maps for ${business.name}… this can take up to 30 seconds.`;
  else if (waitMs > 0) note = `Checked recently. Next check available in ${formatWait(waitMs)}.`;

  return (
    <div className="run-check">
      <button className="btn" onClick={handleClick} disabled={running || waitMs > 0}>
        {running ? "Checking…" : "Run check now"}
      </button>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="note run-check-note">
          {notice && !running && waitMs > 0 ? `${notice}. Next check in ${formatWait(waitMs)}.` : note}
        </p>
      )}
    </div>
  );
}
