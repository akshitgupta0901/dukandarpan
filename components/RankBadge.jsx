"use client";

/**
 * A colour-coded rank badge (see lib/rank-badge.mjs for the rules). The text label is always
 * shown, so colour is never the only signal; the icon is decoration for assistive tech.
 */
export default function RankBadge({ badge, size = "md" }) {
  return (
    <span className={`rank-badge rank-badge-${badge.tone} rank-badge-${size}`}>
      {badge.icon && (
        <span className="rank-badge-icon" aria-hidden="true">
          {badge.icon}
        </span>
      )}
      {badge.label}
    </span>
  );
}
