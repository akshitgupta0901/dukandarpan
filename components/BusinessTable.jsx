"use client";

import { mapRankBadge } from "../lib/rank-badge.mjs";
import DemoBadge from "./DemoBadge";
import RankBadge from "./RankBadge";

function formatCheckedAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Trend({ trend, change }) {
  if (trend === "up") {
    return (
      <span className="trend trend-up" title="Rank improved since the last check">
        ▲{change != null && ` ${change}`}
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="trend trend-down" title="Rank dropped since the last check">
        ▼{change != null && ` ${change}`}
      </span>
    );
  }
  if (trend === "flat") {
    return (
      <span className="trend trend-flat" title="No change since the last check">
        —
      </span>
    );
  }
  return (
    <span className="trend trend-flat" title="Not enough history yet">
      —
    </span>
  );
}

export default function BusinessTable({ businesses, selectedId, onSelect }) {
  if (businesses.length === 0) {
    return <p className="empty-state">No businesses tracked in this category yet. Add one below.</p>;
  }

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Business</th>
          <th>Rank</th>
          <th>Trend</th>
          <th>Last checked</th>
        </tr>
      </thead>
      <tbody>
        {businesses.map((b) => (
          <tr
            key={b.id}
            className={b.id === selectedId ? "selected" : ""}
            onClick={() => onSelect(b.id)}
          >
            <td className="business-name">
              {b.name}
              {b.isDemo && <DemoBadge />}
            </td>
            <td>
              <RankBadge badge={mapRankBadge({ found: b.found, position: b.position })} />
            </td>
            <td>
              <Trend trend={b.trend} change={b.trendChange} />
            </td>
            <td>{formatCheckedAt(b.checkedAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
