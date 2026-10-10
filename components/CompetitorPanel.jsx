"use client";

import { describeGrowth } from "../lib/review-growth.mjs";
import { reviewGap, describeReviewGap, formatSharePercent } from "../lib/review-gap.mjs";
import ViewRawButton from "./ViewRawButton";

const fmt = (n) => n.toLocaleString();

/**
 * Who ranks above the business. Each competitor shows its review count, how far apart the two of
 * you are ("you are behind by 513", or ahead), a thin bar for your reviews as a share of theirs,
 * and its rating and one-week growth. If either review count is missing, the gap is simply not shown.
 */
export default function CompetitorPanel({ data, business = null }) {
  if (!data) return <p className="empty-state">Select a business to see who's ranking above it.</p>;

  const { myPosition, competitors, note, myReviews = null } = data;

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
            const gap = reviewGap(myReviews, c.reviews);
            const phrase = describeReviewGap(gap, fmt);
            const percent = formatSharePercent(gap, myReviews);
            const ratingGrowth = [c.rating != null ? `${c.rating.toFixed(1)}★` : null, ...growth].filter(Boolean);
            // A sliver of bar for "some reviews, tiny share", so it never looks like zero.
            const barWidth = gap.share === null ? 0 : Math.max(gap.share * 100, myReviews > 0 ? 2 : 0);

            return (
              <li key={`${c.position}-${i}`}>
                <span className="competitor-position">#{c.position}</span>
                <span className="competitor-main">
                  <span>{c.title}</span>

                  {c.reviews != null && (
                    <span className="competitor-meta">
                      {fmt(c.reviews)} reviews
                      {phrase && (
                        <>
                          {" · "}
                          <span className={`gap-text gap-text-${gap.state}`}>{phrase}</span>
                        </>
                      )}
                    </span>
                  )}

                  {gap.share !== null && (
                    <>
                      <span
                        className="gap-bar"
                        role="img"
                        aria-label={
                          gap.state === "behind"
                            ? `Your ${fmt(myReviews)} reviews are ${percent} of their ${fmt(c.reviews)}`
                            : `Your ${fmt(myReviews)} reviews are at least as many as their ${fmt(c.reviews)}`
                        }
                      >
                        <span className={`gap-bar-fill gap-bar-fill-${gap.state}`} style={{ width: `${barWidth}%` }} />
                      </span>
                      <span className="competitor-meta">
                        You: {fmt(myReviews)}
                        {gap.state === "behind" && ` · ${percent} of theirs`}
                      </span>
                    </>
                  )}

                  {ratingGrowth.length > 0 && <span className="competitor-meta">{ratingGrowth.join(" · ")}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {business && (
        <div className="panel-footer">
          <ViewRawButton business={business} />
        </div>
      )}
    </div>
  );
}
