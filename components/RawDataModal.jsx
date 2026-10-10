"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "./Modal";
import { fetchJson } from "../lib/fetch-json.mjs";
import { formatJson, truncateLines, tokenizeLine, DEFAULT_COLLAPSE_LINES } from "../lib/json-view.mjs";
import { nextTabIndex } from "../lib/tabs.mjs";

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
 * The latest STORED SerpApi responses for a business's query, as syntax-highlighted JSON in two
 * tabs: "Maps" (every check) and "Organic" (saved on manual checks for queries with a place name).
 * Loaded from /api/businesses/:id/raw (no SerpApi call). Long responses are collapsed to the first
 * lines with a "Show all" button so the modal never has to render thousands of lines at once.
 */
export default function RawDataModal({ businessId, businessName, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [active, setActive] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const tabRefs = useRef([]);

  useEffect(() => {
    let cancelled = false;
    fetchJson(`/api/businesses/${businessId}/raw`, undefined, "Couldn't load the SerpApi data, try again")
      .then((json) => !cancelled && setData(json))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  const tab = data ? data.tabs[active] : null;
  const text = useMemo(() => (tab?.available ? formatJson(tab.payload) : ""), [tab]);
  const view = useMemo(() => truncateLines(text, showAll ? Infinity : DEFAULT_COLLAPSE_LINES), [text, showAll]);
  const rows = useMemo(() => view.lines.map((line) => tokenizeLine(line)), [view]);

  function selectTab(index) {
    setActive(index);
    setShowAll(false);
    setCopyStatus("");
  }

  // Roving tabindex, per the WAI-ARIA tabs pattern: arrows/Home/End move between tabs.
  function onTabKeyDown(e) {
    const next = nextTabIndex(data.tabs.length, active, e.key);
    if (next === null) return;
    e.preventDefault();
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

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
            {data.notice && (
              <p className="raw-notice raw-notice-demo" role="note">
                {data.notice}
              </p>
            )}

            <div className="raw-tabs" role="tablist" aria-label="SerpApi response" onKeyDown={onTabKeyDown}>
              {data.tabs.map((t, i) => (
                <button
                  key={t.engine}
                  ref={(el) => (tabRefs.current[i] = el)}
                  type="button"
                  role="tab"
                  id={`raw-tab-${i}`}
                  aria-selected={i === active}
                  aria-controls="raw-tabpanel"
                  tabIndex={i === active ? 0 : -1}
                  className={`raw-tab ${i === active ? "active" : ""} ${t.available ? "" : "raw-tab-empty"}`}
                  onClick={() => selectTab(i)}
                >
                  {t.label}
                  {!t.available && <span className="raw-tab-flag"> (none yet)</span>}
                </button>
              ))}
            </div>

            <div id="raw-tabpanel" role="tabpanel" aria-labelledby={`raw-tab-${active}`} className="raw-panel">
              {tab.available ? (
                <>
                  <p className="raw-meta">
                    Fetched {formatFetched(tab.checkedAt)} · engine={tab.engine} · query: {data.queryText}
                  </p>
                  {tab.note && <p className="raw-notice">{tab.note}</p>}

                  <div className="raw-actions">
                    <button type="button" className="btn btn-subtle" onClick={handleCopy}>
                      Copy JSON
                    </button>
                    <span className="raw-copy-status" role="status" aria-live="polite">
                      {copyStatus}
                    </span>
                  </div>

                  <pre className="json-view" tabIndex={0} aria-label={`${tab.label} JSON response`}>
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
              ) : (
                <p className="raw-empty">{tab.emptyMessage}</p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
