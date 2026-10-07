"use client";

import { useEffect, useState } from "react";

const initialForm = { queryText: "", category: "", location: "", businessNames: "" };

export default function AddQueryForm({ onAdded }) {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { type: 'error'|'success', text }
  const [existingQueries, setExistingQueries] = useState([]);
  const [loadingQueries, setLoadingQueries] = useState(true);

  async function loadQueries() {
    setLoadingQueries(true);
    try {
      const res = await fetch("/api/queries");
      const json = await res.json();
      if (res.ok) setExistingQueries(json.queries);
    } catch {
      // non-fatal -- the "existing queries" list is a convenience, not load-bearing
    } finally {
      setLoadingQueries(false);
    }
  }

  useEffect(() => {
    loadQueries();
  }, []);

  function updateField(name, value) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    const businessNames = form.businessNames
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryText: form.queryText,
          category: form.category,
          location: form.location,
          businessNames,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: json.error || "Something went wrong" });
        return;
      }
      setMessage({
        type: "success",
        text: `Added "${json.query.queryText}" (${json.query.category}) at ${json.query.lat.toFixed(4)}, ${json.query.lng.toFixed(4)}${
          json.businessesAdded.length ? ` with ${json.businessesAdded.length} business(es)` : ""
        }.`,
      });
      setForm(initialForm);
      loadQueries();
      onAdded?.();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <h2 className="card-title">Add a tracked query</h2>
      <p className="card-subtitle">
        Location can be a city/place name (geocoded automatically) or exact "lat,lng".
      </p>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="queryText">Query text</label>
            <input
              id="queryText"
              required
              placeholder="e.g. coffee shop in Koramangala"
              value={form.queryText}
              onChange={(e) => updateField("queryText", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="category">Category</label>
            <input
              id="category"
              required
              placeholder="e.g. cafe"
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
            />
          </div>
          <div className="field field-span-2">
            <label htmlFor="location">Location</label>
            <input
              id="location"
              required
              placeholder='e.g. "Koramangala, Bangalore" or "12.9352,77.6146"'
              value={form.location}
              onChange={(e) => updateField("location", e.target.value)}
            />
          </div>
          <div className="field field-span-2">
            <label htmlFor="businessNames">Businesses to track (one per line, optional)</label>
            <textarea
              id="businessNames"
              rows={3}
              placeholder={"Third Wave Coffee\nBlue Tokai"}
              value={form.businessNames}
              onChange={(e) => updateField("businessNames", e.target.value)}
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Adding…" : "Add query"}
          </button>
          {message && <span className={`form-message ${message.type}`}>{message.text}</span>}
        </div>
      </form>

      <div className="existing-queries">
        {loadingQueries ? (
          "Loading existing queries…"
        ) : existingQueries.length === 0 ? (
          "No queries yet."
        ) : (
          <table className="mini-table">
            <thead>
              <tr>
                <th>Query</th>
                <th>Category</th>
                <th>Lat</th>
                <th>Lng</th>
              </tr>
            </thead>
            <tbody>
              {existingQueries.map((q) => (
                <tr key={q.id}>
                  <td>{q.queryText}</td>
                  <td>{q.category}</td>
                  <td>{Number(q.lat).toFixed(4)}</td>
                  <td>{Number(q.lng).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
