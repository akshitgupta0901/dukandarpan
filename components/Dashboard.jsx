"use client";

import { useEffect, useState } from "react";
import BusinessTable from "./BusinessTable";
import RankChart from "./RankChart";
import CompetitorPanel from "./CompetitorPanel";
import AddQueryForm from "./AddQueryForm";
import AlertsPanel from "./AlertsPanel";
import InsightCard from "./InsightCard";
import { fetchJson } from "../lib/fetch-json.mjs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
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
  const [activeCategory, setActiveCategory] = useState(null);
  const [categoriesError, setCategoriesError] = useState(null);

  const [businesses, setBusinesses] = useState([]);
  const [businessesLoading, setBusinessesLoading] = useState(false);
  const [businessesError, setBusinessesError] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [competitors, setCompetitors] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState(null);

  async function loadCategories() {
    try {
      const json = await fetchJson("/api/categories");
      setCategories(json.categories);
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
        setSelectedId(json.businesses[0]?.id ?? null);
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
        setCompetitors(competitorsJson);
      })
      .catch((err) => !cancelled && setBusinessesError(err.message))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  function handleQueryAdded() {
    loadCategories();
    if (activeCategory) {
      fetchJson(`/api/businesses?category=${encodeURIComponent(activeCategory)}`)
        .then((json) => {
          setBusinesses(json.businesses);
          if (!json.businesses.find((b) => b.id === selectedId)) {
            setSelectedId(json.businesses[0]?.id ?? null);
          }
        })
        .catch(() => {});
    }
  }

  const selectedBusiness = businesses.find((b) => b.id === selectedId) ?? null;
  const staleDays = businessesLoading ? null : staleDaysAgo(businesses);

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
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="card-title">Tracked businesses</h2>
        {businessesError && <div className="error-banner">{businessesError}</div>}
        {businessesLoading ? (
          <p className="loading">Loading…</p>
        ) : (
          <BusinessTable businesses={businesses} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </div>

      {selectedBusiness && (
        <div className="split">
          <div className="card">
            <h2 className="card-title">Rank history — {selectedBusiness.name}</h2>
            {detailLoading ? <p className="loading">Loading…</p> : <RankChart history={history} businessName={selectedBusiness.name} />}
          </div>
          <div className="card">
            <h2 className="card-title">Ranking above {selectedBusiness.name}</h2>
            {detailLoading ? <p className="loading">Loading…</p> : <CompetitorPanel data={competitors} />}
          </div>
        </div>
      )}

      {selectedBusiness && (
        <div style={{ marginTop: 16 }}>
          <InsightCard businessId={selectedBusiness.id} />
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <AlertsPanel alerts={alerts} loading={alertsLoading} error={alertsError} onRefresh={loadAlerts} />
      </div>

      <div style={{ marginTop: 16 }}>
        <AddQueryForm onAdded={handleQueryAdded} />
      </div>
    </div>
  );
}
