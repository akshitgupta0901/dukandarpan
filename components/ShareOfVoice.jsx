"use client";

import { describeShareOfVoice } from "../lib/share-of-voice.mjs";
import { mapRankBadge, organicRankBadge } from "../lib/rank-badge.mjs";
import DemoBadge from "./DemoBadge";
import RankBadge from "./RankBadge";

function formatDay(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/**
 * "Map Pack: #2 | Organic: #12" for the selected business, plus a short visibility-gap
 * sentence when the map rank is good and the regular-results rank is poor or missing.
 * Organic ranks come from the newest check that ran the organic search (the daily cron
 * is maps-only), so the date is shown.
 */
export default function ShareOfVoice({ business, action = null }) {
  const sov = describeShareOfVoice({
    found: business.found,
    position: business.position,
    organicChecked: business.organicChecked,
    organicPosition: business.organicPosition,
  });

  return (
    <div className="card">
      <div className="alerts-header">
        <h2 className="card-title">
          Share of voice — {business.name}
          {business.isDemo && <DemoBadge />}
        </h2>
        {action}
      </div>
      <div className="sov-row" aria-label={`Map Pack: ${sov.mapText}. Organic: ${sov.organicText}.`}>
        <div className="sov-stat">
          <span className="sov-label">Map Pack</span>
          <RankBadge size="lg" badge={mapRankBadge({ found: business.found, position: business.position })} />
        </div>
        <div className="sov-divider" aria-hidden="true" />
        <div className="sov-stat">
          <span className="sov-label">Organic</span>
          <RankBadge
            size="lg"
            badge={organicRankBadge({ checked: business.organicChecked, position: business.organicPosition })}
          />
        </div>
      </div>
      {business.organicChecked && (
        <p className="note sov-note">Regular Google results as of {formatDay(business.organicCheckedAt)}.</p>
      )}
      {!business.organicChecked && (
        <p className="note sov-note">
          {business.organicEnabled
            ? 'Run a check to see where you rank in the regular Google results.'
            : "This search tracks the map only. Add it again with a place name to track regular Google results too."}
        </p>
      )}
      {sov.gap && <p className="sov-gap">{sov.gap}</p>}
    </div>
  );
}
