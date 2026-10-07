"use client";

import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MAPS_RESULTS_LIMIT } from "../lib/rank-limit.mjs";

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
};
const DARK = {
  surface: "#1a1a19",
  gridline: "#2c2c2a",
  muted: "#898781",
  textPrimary: "#ffffff",
  series1: "#3987e5",
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

function CustomTooltip({ active, payload, label, colors, formatLabel }) {
  if (!active || !payload || payload.length === 0) return null;
  const position = payload[0].value;
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.gridline}`,
        borderRadius: 6,
        padding: "8px 10px",
        fontSize: 12,
        color: colors.textPrimary,
      }}
    >
      <div style={{ color: colors.muted, marginBottom: 2 }}>{formatLabel(label)}</div>
      <div style={{ fontWeight: 600 }}>{position == null ? `Not in top ${MAPS_RESULTS_LIMIT}` : `#${position}`}</div>
    </div>
  );
}

export default function RankChart({ history, businessName }) {
  const colors = useThemeColors();

  const points = history.map((h) => ({ checkedAt: h.checkedAt, position: h.position }));
  const formatTick = makeTickFormatter(points);
  const observedPositions = points.map((p) => p.position).filter((p) => p != null);
  const maxPosition = observedPositions.length ? Math.max(...observedPositions) : 20;
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
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.gridline} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="checkedAt"
            tickFormatter={formatTick}
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
          <Tooltip content={<CustomTooltip colors={colors} formatLabel={formatTick} />} cursor={{ stroke: colors.gridline }} />
          <Line
            type="linear"
            dataKey="position"
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
  );
}
