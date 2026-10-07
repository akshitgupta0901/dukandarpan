"use client";

import { describeGrowth } from "../lib/review-growth.mjs";

function details(c) {
  const parts = [];
  if (c.reviews != null) parts.push(`${c.reviews.toLocaleString()} reviews`);
  if (c.rating != null) parts.push(`${c.rating.toFixed(1)}★`);
  return parts.join(" · ");
}

export default function CompetitorPanel({ data }) {
  if (!data) return <p className="empty-state">Select a business to see who's ranking above it.</p>;

  const { myPosition, competitors, note } = data;

  return (
    <div>
      {note && <p className="note">{note}</p>}
      {competitors.length === 0 ? (
        <p className="empty-state">
          {myPosition ? "Nothing ranks above this business right now." : "No listings to show."}
        </p>
      ) : (
        <ul className="competitor-list">
          {competitors.map((c, i) => {
            const growth = describeGrowth({ reviewsGained: c.reviewsGained, ratingChange: c.ratingChange, days: c.growthDays });
            return (
              <li key={`${c.position}-${i}`}>
                <span className="competitor-position">#{c.position}</span>
                <span className="competitor-main">
                  <span>{c.title}</span>
                  {(details(c) || growth.length > 0) && (
                    <span className="competitor-meta">
                      {details(c)}
                      {growth.length > 0 && (
                        <span className="competitor-growth"> · {growth.join(" · ")}</span>
                      )}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
