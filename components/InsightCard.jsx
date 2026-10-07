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
 * Recommendation card. On mount (and whenever the selected business or the
 * language changes) this only ever GETs the cached recommendation -- recomputing
 * it (POST, which may call the AI) happens strictly on the button click below,
 * never automatically. The cache holds one language at a time, so switching
 * language shows an empty card until "Get insight" is clicked. The language
 * toggle only appears when the server has an AI key (Hinglish needs the AI; the
 * rule-based fallback is English only). `onInsightChange` lets the parent use
 * the current text (the WhatsApp summary).
 */
export default function InsightCard({ businessId, onInsightChange }) {
  const [insight, setInsight] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [source, setSource] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [fresh, setFresh] = useState(false);
  const [language, setLanguage] = useState("en"); // what the owner asked for
  const [textLanguage, setTextLanguage] = useState("en"); // what the shown text is actually in
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function applyInsight(json) {
    setInsight(json.insight);
    setSource(json.source ?? null);
    setGeneratedAt(json.generatedAt);
    setFresh(json.fresh);
    setTextLanguage(json.language ?? "en");
    setAiAvailable(Boolean(json.aiAvailable));
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
    // The comparison reads the stored search response (no credits, no AI call), so it loads with the card.
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
        <h2 className="card-title">Recommendation</h2>
        <div className="card-actions">
          {aiAvailable && (
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
          )}
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
            {source && (
              <span
                className="source-tag"
                title={source === "ai" ? "Written by an AI model from the numbers below" : "Written by built-in rules from your rank history"}
              >
                {source === "ai" ? "AI" : "Rule-based"}
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
