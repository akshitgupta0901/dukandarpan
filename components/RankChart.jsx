"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartPoints, describeCheck } from "../lib/history-top.mjs";

// Chart chrome, from the dataviz skill's reference palette (references/palette.md).
// Read at runtime rather than via CSS var() on SVG attributes, which doesn't
// resolve reliably across browsers/exports -- so this is the one place light
// vs dark is picked in JS instead of CSS.
const LIGHT = {
  surface: "#fcfcfb",
  gridline: "#e1e0d9",
  muted: "#898781",
  textPrimary: "#0b0b0b",
  series1: "#2a78d6",
  rival: "#8a8982", // the faded dashed "top-ranked business" line
};
const DARK = {
  surface: "#1a1a19",
  gridline: "#2c2c2a",
  muted: "#898781",
  textPrimary: "#ffffff",
  series1: "#3987e5",
  rival: "#8f8e86",
};

function useThemeColors() {
  const [colors, setColors] = useState(LIGHT);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setColors(mq.matches ? DARK : LIGHT);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return colors;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Calendar day in the viewer's timezone, used to spot days with several checks.
function dayKey(iso) {
  return new Date(iso).toLocaleDateString();
}

// Date-only labels repeat when a day has several checks, so those days get the time too.
function makeTickFormatter(points) {
  const counts = new Map();
  for (const p of points) counts.set(dayKey(p.checkedAt), (counts.get(dayKey(p.checkedAt)) ?? 0) + 1);
  return (iso) => (counts.get(dayKey(iso)) > 1 ? formatDateTime(iso) : formatDate(iso));
}

// One sentence per check, e.g. "Oct 7: Rank #4. Mocha Meadow Cafe was #1." (see lib/history-top.mjs).
// The datum is looked up by its x value rather than read from `payload`, because Recharts leaves a
// null series out of `payload`, and a "Not in top 20" check must still get a tooltip.
function CustomTooltip({ active, label, colors, formatLabel, points }) {
  if (!active) return null;
  const point = points.find((p) => p.checkedAt === label);
  if (!point) return null;
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.gridline}`,
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        maxWidth: 240,
        lineHeight: 1.4,
        color: colors.textPrimary,
      }}
    >
      {describeCheck({
        label: formatLabel(label),
        position: point.position,
        topName: point.topName,
        topPosition: point.topPosition,
        ownIsFirst: point.ownIsFirst,
      })}
    </div>
  );
}

export default function RankChart({ history, businessName }) {
  const colors = useThemeColors();

  const points = chartPoints(history);
  const formatTick = makeTickFormatter(points);
  const observedPositions = points.map((p) => p.position).filter((p) => p != null);
  const hasRival = points.some((p) => p.topPosition != null);
  // The scale must fit both lines, but an all-"not found" history is still reported as such below.
  const allPositions = [...observedPositions, ...points.map((p) => p.topPosition).filter((p) => p != null)];
  const maxPosition = allPositions.length ? Math.max(...allPositions) : 20;
  const domainMax = Math.max(maxPosition, 5);

  if (points.length === 0) {
    return <p className="empty-state">No history yet for {businessName}.</p>;
  }

  // Every check so far came back not_found (position: null everywhere) --
  // rendering the chart in this state would just be empty axes with no
  // line or dots, which reads as broken rather than as a real result.
  if (observedPositions.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p className="empty-state" style={{ padding: 0, textAlign: "center", maxWidth: 320 }}>
          Not currently ranking for this query
          <br />
          {businessName} hasn't appeared in the local pack in {points.length === 1 ? "the last check" : `any of the last ${points.length} checks`}.
        </p>
      </div>
    );
  }

  return (
    <div className="rank-chart">
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={colors.gridline} strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="checkedAt"
              tickFormatter={formatTick}
              // Recharts drops any tick label that doesn't fit inside the axis range, and the
              // first/last labels are centered on the plot edges. Insetting those points keeps
              // them (otherwise the first point silently loses its label).
              padding={{ left: 44, right: 44 }}
              // With many checks Recharts thins the labels; always keep the first and last date.
              interval="preserveStartEnd"
              stroke={colors.muted}
              tick={{ fill: colors.muted, fontSize: 11 }}
              axisLine={{ stroke: colors.gridline }}
              tickLine={false}
            />
            <YAxis
              reversed
              allowDecimals={false}
              domain={[1, domainMax]}
              stroke={colors.muted}
              tick={{ fill: colors.muted, fontSize: 11 }}
              axisLine={{ stroke: colors.gridline }}
              tickLine={false}
              width={28}
            />
            <Tooltip
              content={<CustomTooltip colors={colors} formatLabel={formatTick} points={points} />}
              cursor={{ stroke: colors.gridline }}
            />
            {/* Drawn first so the business's own line sits on top. A gap (a check with no stored
                response) breaks the line; the small dots keep an isolated point visible. */}
            {hasRival && (
              <Line
                type="linear"
                dataKey="topPosition"
                name="Top-ranked business at that check"
                stroke={colors.rival}
                strokeOpacity={0.75}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={{ r: 2.5, fill: colors.rival, fillOpacity: 0.8, stroke: "none" }}
                activeDot={{ r: 4, fill: colors.rival, stroke: colors.surface, strokeWidth: 1 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="linear"
              dataKey="position"
              name="Your rank"
              stroke={colors.series1}
              strokeWidth={2}
              dot={{ r: 4, fill: colors.series1, stroke: colors.surface, strokeWidth: 2 }}
              activeDot={{ r: 5, fill: colors.series1, stroke: colors.surface, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="chart-legend" aria-label="Chart legend">
        <li>
          <svg width="24" height="8" aria-hidden="true">
            <line x1="1" y1="4" x2="23" y2="4" stroke={colors.series1} strokeWidth="2" />
          </svg>
          Your rank
        </li>
        {hasRival && (
          <li>
            <svg width="24" height="8" aria-hidden="true">
              <line x1="1" y1="4" x2="23" y2="4" stroke={colors.rival} strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="5 4" />
            </svg>
            Top-ranked business at that check (can be a different business each time)
          </li>
        )}
      </ul>
    </div>
  );
}
