"use client";

import { useEffect, useRef, useState } from "react";
import BusinessTable from "./BusinessTable";
import RankChart from "./RankChart";
import CompetitorPanel from "./CompetitorPanel";
import AddQueryForm from "./AddQueryForm";
import AlertsPanel from "./AlertsPanel";
import InsightCard from "./InsightCard";
import RunCheckButton from "./RunCheckButton";
import DemoBadge from "./DemoBadge";
import ShareOfVoice from "./ShareOfVoice";
import WhatsAppShare from "./WhatsAppShare";
import ViewRawButton from "./ViewRawButton";
import { fetchJson } from "../lib/fetch-json.mjs";
import { findPointForAlert } from "../lib/alert-focus.mjs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const HIGHLIGHT_MS = 4000; // how long a chart point stays highlighted after an alert is clicked
const STALE_AFTER_DAYS = 2;

/** Whole days since the newest check in `businesses`, or null if it's fresh (or nothing was ever checked). */
function staleDaysAgo(businesses) {
  const times = businesses.map((b) => b.checkedAt).filter(Boolean).map((iso) => new Date(iso).getTime());
  if (times.length === 0) return null;
  const ageMs = Date.now() - Math.max(...times);
  return ageMs > STALE_AFTER_DAYS * MS_PER_DAY ? Math.floor(ageMs / MS_PER_DAY) : null;
}

export default function Dashboard() {
  const [categories, setCategories] = useState([]);
  const [demoCategories, setDemoCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoriesError, setCategoriesError] = useState(null);

  const [businesses, setBusinesses] = useState([]);
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const [businessesError, setBusinessesError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [competitors, setCompetitors] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [insightText, setInsightText] = useState(null); // the card's current recommendation, for the WhatsApp summary
  const [detailRefreshKey, setDetailRefreshKey] = useState(0); // bumped after a check to re-fetch history/competitors
  const [historyFor, setHistoryFor] = useState(null); // which business `history` belongs to (it lags selectedId while loading)

  // Clicking an alert: { businessId, at } waits here until that business's history has loaded,
  // then the chart is scrolled into view and the matching point highlighted for a few seconds.
  const [focusRequest, setFocusRequest] = useState(null);
  const [highlightAt, setHighlightAt] = useState(null);
  const focusRef = useRef(null);
  focusRef.current = focusRequest;
  const highlightTimer = useRef(null);
  const scrollTimer = useRef(null);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(null);

  async function loadCategories() {
    try {
      const json = await fetchJson("/api/categories");
      setCategories(json.categories);
      setDemoCategories(json.demoCategories ?? []);
      setActiveCategory((current) => current ?? json.categories[0] ?? null);
    } catch (err) {
      setCategoriesError(err.message);
    }
  }

  async function loadAlerts() {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      const json = await fetchJson("/api/alerts");
      setAlerts(json.alerts);
    } catch (err) {
      setAlertsError(err.message);
    } finally {
      setAlertsLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
    loadAlerts();
  }, []);

  useEffect(() => {
    if (!activeCategory) return;
    let cancelled = false;
    setBusinessesLoading(true);
    setBusinessesError(null);
    fetchJson(`/api/businesses?category=${encodeURIComponent(activeCategory)}`)
      .then((json) => {
        if (cancelled) return;
        setBusinesses(json.businesses);
        // An alert click may have asked for a specific business in this category.
        const wanted = focusRef.current?.businessId;
        const wantedHere = json.businesses.some((b) => b.id === wanted);
        setSelectedId(wantedHere ? wanted : json.businesses[0]?.id ?? null);
        if (focusRef.current && !wantedHere) setFocusRequest(null);
      })
      .catch((err) => !cancelled && setBusinessesError(err.message))
      .finally(() => !cancelled && setBusinessesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  useEffect(() => {
    if (!selectedId) {
      setHistory([]);
      setHistoryFor(null);
      setCompetitors(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    Promise.all([
      fetchJson(`/api/businesses/${selectedId}/history`),
      fetchJson(`/api/businesses/${selectedId}/competitors`),
    ])
      .then(([historyJson, competitorsJson]) => {
        if (cancelled) return;
        setHistory(historyJson.history);
        setHistoryFor(selectedId);
        setCompetitors(competitorsJson);
      })
      .catch((err) => !cancelled && setBusinessesError(err.message))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId, detailRefreshKey]);

  // Once the clicked alert's business is selected AND its history has loaded: find the chart point the
  // alert came from, scroll to the chart and highlight it. If no point is close enough in time, it only scrolls.
  useEffect(() => {
    if (!focusRequest || detailLoading || historyFor !== focusRequest.businessId || selectedId !== focusRequest.businessId) return;

    setHighlightAt(findPointForAlert(history, focusRequest.at));
    setFocusRequest(null);

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // The timers live in refs, not in this effect's cleanup: setFocusRequest(null) above re-runs the effect,
    // and a cleanup would cancel them straight away.
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      document.getElementById("rank-history-card")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }, 60);

    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightAt(null), HIGHLIGHT_MS);
  }, [focusRequest, detailLoading, historyFor, selectedId, history]);

  useEffect(
    () => () => {
      clearTimeout(highlightTimer.current);
      clearTimeout(scrollTimer.current);
    },
    []
  );

  function selectBusiness(id) {
    setHighlightAt(null);
    setSelectedId(id);
  }

  function handleAlertClick(alert) {
    setHighlightAt(null);
    setFocusRequest({ businessId: alert.businessId, at: alert.createdAt });
    if (alert.category !== activeCategory && categories.includes(alert.category)) {
      setActiveCategory(alert.category); // the business is picked when this category's list loads
    } else {
      setSelectedId(alert.businessId);
    }
  }

  // Re-fetch the table without touching the loading state or resetting the selection.
  async function refreshBusinesses() {
    if (!activeCategory) return;
    try {
      const json = await fetchJson(`/api/businesses?category=${encodeURIComponent(activeCategory)}`);
      setBusinesses(json.businesses);
      if (!json.businesses.find((b) => b.id === selectedId)) {
        setSelectedId(json.businesses[0]?.id ?? null);
      }
    } catch {
      // keep showing what we have; the next full load surfaces any real problem
    }
  }

  function handleQueryAdded() {
    loadCategories();
    refreshBusinesses();
  }

  // After "Run check now": new snapshots exist, so refresh the table (and with it
  // the stale-data banner), the chart/competitors, and the alerts list.
  async function handleChecked() {
    setDetailRefreshKey((k) => k + 1);
    await Promise.all([refreshBusinesses(), loadAlerts()]);
  }

  const selectedBusiness = businesses.find((b) => b.id === selectedId) ?? null;
  // Sample data has no real "last checked", so it never counts toward the stale-data banner.
  const staleDays = businessesLoading ? null : staleDaysAgo(businesses.filter((b) => !b.isDemo));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">DukanDarpan</h1>
          <p className="page-subtitle">See where your shop shows up on Google Maps</p>
        </div>
      </div>

      {staleDays !== null && <div className="stale-banner">Last checked {staleDays} days ago</div>}

      {categoriesError && <div className="error-banner">Couldn't load categories: {categoriesError}</div>}

      {categories.length > 0 && (
        <div className="tabs">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`tab ${cat === activeCategory ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
              {demoCategories.includes(cat) && <span className="tab-chip">Demo</span>}
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <div className="alerts-header">
          <h2 className="card-title">Tracked businesses</h2>
          {selectedBusiness &&
            (selectedBusiness.isDemo ? (
              <p className="note run-check-note">Sample data. Live checks are turned off for this business.</p>
            ) : (
              <RunCheckButton key={selectedBusiness.id} business={selectedBusiness} onChecked={handleChecked} />
            ))}
        </div>
        {businessesError && <div className="error-banner">{businessesError}</div>}
        {businessesLoading ? (
          <p className="loading">Loading…</p>
        ) : (
          <BusinessTable businesses={businesses} selectedId={selectedId} onSelect={selectBusiness} />
        )}
      </div>

      {selectedBusiness && (
        <div style={{ marginTop: 16 }}>
          <ShareOfVoice
            business={selectedBusiness}
            action={
              <div className="card-actions">
                <ViewRawButton business={selectedBusiness} />
                <WhatsAppShare business={selectedBusiness} competitors={competitors} insight={insightText} />
              </div>
            }
          />
        </div>
      )}

      {selectedBusiness && (
        <div className="split">
          <div className="card" id="rank-history-card">
            <h2 className="card-title">
              Rank history — {selectedBusiness.name}
              {selectedBusiness.isDemo && <DemoBadge />}
            </h2>
            {detailLoading ? <p className="loading">Loading…</p> : <RankChart history={history} businessName={selectedBusiness.name} highlightAt={highlightAt} />}
          </div>
          <div className="card">
            <h2 className="card-title">Ranking above {selectedBusiness.name}</h2>
            {detailLoading ? <p className="loading">Loading…</p> : <CompetitorPanel data={competitors} business={selectedBusiness} />}
          </div>
        </div>
      )}

      {selectedBusiness && (
        <div style={{ marginTop: 16 }}>
          <InsightCard businessId={selectedBusiness.id} onInsightChange={setInsightText} />
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <AlertsPanel alerts={alerts} loading={alertsLoading} error={alertsError} onRefresh={loadAlerts} onSelectAlert={handleAlertClick} />
      </div>

      <div style={{ marginTop: 16 }}>
        <AddQueryForm onAdded={handleQueryAdded} />
      </div>
    </div>
  );
}
