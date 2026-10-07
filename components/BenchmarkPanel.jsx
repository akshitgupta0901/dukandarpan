"use client";

const RUPEES = ["", "₹", "₹₹", "₹₹₹", "₹₹₹₹"];

// One comparison: your value against the top-3 average, as two bars on a shared scale.
const METRICS = [
  { key: "rating", label: "Rating", max: () => 5, own: (b) => b.own.rating, avg: (b) => b.averages.rating, format: (v) => v.toFixed(1) },
  {
    key: "reviews",
    label: "Reviews",
    max: (you, avg) => Math.max(you ?? 0, avg ?? 0, 1),
    own: (b) => b.own.reviews,
    avg: (b) => b.averages.reviews,
    format: (v) => String(Math.round(v)),
  },
  {
    key: "priceLevel",
    label: "Price level",
    max: () => 4,
    own: (b) => b.own.priceLevel,
    avg: (b) => b.averages.priceLevel,
    format: (v) => RUPEES[Math.round(v)] || "—",
  },
];

function Bar({ value, max, kind, text }) {
  const pct = value == null ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  return (
    <div className="bench-bar">
      <span className="bench-bar-label">{kind === "you" ? "You" : "Top 3 average"}</span>
      <div className="bench-track" aria-hidden="true">
        <div className={`bench-fill bench-fill-${kind}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="bench-value">{value == null ? "—" : text}</span>
    </div>
  );
}

/**
 * "How you compare": bars for rating, reviews and price level against the top 3
 * listings, then the listing-health checklist. Everything comes from
 * /api/businesses/:id/benchmark (the stored search response, no credits).
 */
export default function BenchmarkPanel({ data }) {
  if (!data) return null;
  const { benchmark, note } = data;

  if (!benchmark) {
    return <p className="empty-state bench-empty">{note ?? "No comparison data yet."}</p>;
  }
  if (!benchmark.found) {
    return (
      <p className="empty-state bench-empty">
        This listing isn't in the top 20 for this search, so there is nothing to compare yet.
      </p>
    );
  }

  return (
    <div className="bench">
      <div className="bench-section">
        <h3 className="bench-title">How you compare</h3>
        {METRICS.map((m) => {
          const you = m.own(benchmark);
          const avg = m.avg(benchmark);
          const max = m.max(you, avg);
          return (
            <div className="bench-metric" key={m.key}>
              <div className="bench-metric-name">{m.label}</div>
              <Bar kind="you" value={you} max={max} text={you == null ? "—" : m.format(you)} />
              <Bar kind="top" value={avg} max={max} text={avg == null ? "—" : m.format(avg)} />
            </div>
          );
        })}
      </div>

      <div className="bench-section">
        <h3 className="bench-title">Your listing health</h3>
        <ul className="health-list">
          {benchmark.checklist.map((c) => (
            <li key={c.key} className={c.you ? "health-ok" : "health-miss"}>
              <span className="health-icon" aria-label={c.you ? "Yes" : "Missing"}>
                {c.you ? "✓" : "✕"}
              </span>
              <span className="health-label">{c.label}</span>
              <span className="health-note">
                {c.topCount} of the top {c.topOf} {c.topCount === 1 ? "has" : "have"} it
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
