"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "./Modal";
import { fetchJson } from "../lib/fetch-json.mjs";
import { formatJson, truncateLines, tokenizeLine, DEFAULT_COLLAPSE_LINES } from "../lib/json-view.mjs";

function formatFetched(iso) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers or a blocked clipboard: fall back to a hidden textarea.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * The latest STORED SerpApi response for a business's query, as syntax-highlighted JSON.
 * Loaded from /api/businesses/:id/raw (no SerpApi call). Long responses are collapsed to the
 * first lines with a "Show all" button so the modal never has to render thousands of lines at once.
 */
export default function RawDataModal({ businessId, businessName, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchJson(`/api/businesses/${businessId}/raw`, undefined, "Couldn't load the SerpApi data, try again")
      .then((json) => !cancelled && setData(json))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const text = useMemo(() => (data ? formatJson(data.payload) : ""), [data]);
  const view = useMemo(() => truncateLines(text, showAll ? Infinity : DEFAULT_COLLAPSE_LINES), [text, showAll]);
  const rows = useMemo(() => view.lines.map((line) => tokenizeLine(line)), [view]);

  async function handleCopy() {
    setCopyStatus((await copyText(text)) ? "Copied" : "Couldn't copy");
    setTimeout(() => setCopyStatus(""), 2500);
  }

  return (
    <Modal title={`SerpApi data — ${businessName}`} titleId="raw-data-title" onClose={onClose}>
      <div className="modal-body">
        {!data && !error && <p className="loading">Loading…</p>}
        {error && <div className="error-banner">{error}</div>}

        {data && (
          <>
            <p className="raw-meta">
              Fetched {formatFetched(data.checkedAt)} · engine={data.engine} · query: {data.queryText}
            </p>
            <p className={`raw-notice ${data.isDemo ? "raw-notice-demo" : ""}`} role={data.isDemo ? "note" : undefined}>
              {data.note}
            </p>

            <div className="raw-actions">
              <button type="button" className="btn btn-subtle" onClick={handleCopy}>
                Copy JSON
              </button>
              <span className="raw-copy-status" role="status" aria-live="polite">
                {copyStatus}
              </span>
            </div>

            <pre className="json-view" tabIndex={0} aria-label="SerpApi JSON response">
              <code>
                {rows.map((tokens, i) => (
                  <span className="json-line" key={i}>
                    {tokens.map((t, j) => (
                      <span key={j} className={`json-${t.type}`}>
                        {t.text}
                      </span>
                    ))}
                    {"\n"}
                  </span>
                ))}
              </code>
            </pre>

            {view.truncated && (
              <button type="button" className="btn btn-subtle raw-show-all" onClick={() => setShowAll(true)}>
                Show all {view.totalLines.toLocaleString()} lines
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
