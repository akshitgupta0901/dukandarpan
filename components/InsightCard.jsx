"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "../lib/fetch-json.mjs";
import BenchmarkPanel from "./BenchmarkPanel";

function formatGeneratedAt(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hinglish", label: "Hinglish" },
];

/**
 * Competitor teardown card, written from the SerpApi results already stored for
 * this business. On mount (and whenever the selected business or the language
 * changes) this only ever GETs the cached text -- recomputing it (POST) happens
 * strictly on the button click below, never automatically. The cache holds one
 * language at a time, so switching language shows an empty card until
 * "Get insight" is clicked. When there is nothing to compare (the business isn't
 * in the top 20, or no other listing was found) the text is the older rule-based
 * advice, which is English only. `onInsightChange` lets the parent use the
 * current text (the WhatsApp summary).
 */

const SOURCE_LABELS = {
  teardown: { label: "Teardown", title: "Written from your SerpApi results: your listing compared with the top listings" },
  rules: { label: "Rule-based", title: "Written by built-in rules from your rank history" },
};
export default function InsightCard({ businessId, onInsightChange }) {
  const [insight, setInsight] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [source, setSource] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [language, setLanguage] = useState("en"); // what the owner asked for
  const [textLanguage, setTextLanguage] = useState("en"); // what the shown text is actually in
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function applyInsight(json) {
    setInsight(json.insight);
    setSource(json.source ?? null);
    setGeneratedAt(json.generatedAt);
    setFresh(json.fresh);
    setTextLanguage(json.language ?? "en");
  }

  useEffect(() => {
    let cancelled = false;
    setInsight(null);
    setGeneratedAt(null);
    setSource(null);
    setFresh(false);
    setError(null);
    fetchJson(`/api/businesses/${businessId}/insight?lang=${language}`)
      .then((json) => !cancelled && applyInsight(json))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [businessId, language]);

  useEffect(() => {
    let cancelled = false;
    setBenchmark(null);
    // The comparison reads the stored search response (no credits), so it loads with the card.
    fetchJson(`/api/businesses/${businessId}/benchmark`)
      .then((json) => !cancelled && setBenchmark(json))
      .catch(() => {}); // optional extra: the recommendation still works without it
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  useEffect(() => {
    onInsightChange?.(insight);
  }, [insight]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const json = await fetchJson(`/api/businesses/${businessId}/insight?lang=${language}`, { method: "POST" });
      applyInsight(json);
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
        <h2 className="card-title">Competitor teardown, based on your SerpApi results</h2>
        <div className="card-actions">
          <div className="lang-toggle" role="group" aria-label="Recommendation language">
            {LANGUAGES.map((l) => (
              <button
                key={l.value}
                type="button"
                className={`lang-option ${language === l.value ? "active" : ""}`}
                aria-pressed={language === l.value}
                disabled={loading}
                onClick={() => setLanguage(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <button className="btn" onClick={handleGenerate} disabled={loading}>
            {loading ? "Working…" : buttonLabel}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <p className="loading">Working…</p>
      ) : insight ? (
        <div>
          <p className="insight-text">
            {insight}
            {SOURCE_LABELS[source] && (
              <span className="source-tag" title={SOURCE_LABELS[source].title}>
                {SOURCE_LABELS[source].label}
              </span>
            )}
          </p>
          <p className="alert-meta">
            Updated {formatGeneratedAt(generatedAt)}
            {!fresh && " · more than 24h old"}
            {language === "hinglish" && textLanguage !== "hinglish" && " · Hinglish isn't available right now, so this is in English"}
          </p>
        </div>
      ) : (
        <p className="empty-state">
          {language === "hinglish"
            ? 'No Hinglish recommendation yet — click "Get insight" to write one.'
            : 'No recommendation yet — click "Get insight" to get one based on this business\'s rank history and competitors.'}
        </p>
      )}

      <BenchmarkPanel data={benchmark} />
    </div>
  );
}
