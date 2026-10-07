"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetch-json.mjs";

function formatGeneratedAt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Phase 7: rule-based recommendation card. On mount (and whenever the
 * selected business changes) this only ever GETs the cached recommendation
 * -- recomputing it (POST) happens strictly on the button click below,
 * never automatically.
 */
export default function InsightCard({ businessId }) {
  const [insight, setInsight] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setInsight(null);
    setGeneratedAt(null);
    setFresh(false);
    setError(null);
    fetchJson(`/api/businesses/${businessId}/insight`)
      .then((json) => {
        if (cancelled) return;
        setInsight(json.insight);
        setGeneratedAt(json.generatedAt);
        setFresh(json.fresh);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson(`/api/businesses/${businessId}/insight`, { method: "POST" });
      setInsight(json.insight);
      setGeneratedAt(json.generatedAt);
      setFresh(json.fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const buttonLabel = insight && fresh ? "Refresh insight" : "Get insight";

  return (
    <div className="card">
      <div className="alerts-header">
        <h2 className="card-title">Recommendation</h2>
        <button className="btn" onClick={handleGenerate} disabled={loading}>
          {loading ? "Working…" : buttonLabel}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="loading">Working…</p>
      ) : insight ? (
        <div>
          <p className="insight-text">{insight}</p>
          <p className="alert-meta">
            Updated {formatGeneratedAt(generatedAt)}
            {!fresh && " · more than 24h old"}
          </p>
        </div>
      ) : (
        <p className="empty-state">
          No recommendation yet — click "Get insight" to get one based on this business's rank history and competitors.
        </p>
      )}
    </div>
  );
}
