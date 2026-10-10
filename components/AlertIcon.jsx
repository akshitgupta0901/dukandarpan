"use client";

import { alertSeverity } from "../lib/alert-focus.mjs";

// Inline SVG (Lucide-style strokes), no icon library. The icon is decoration: every alert also has a text badge.
const PATHS = {
  "trend-down": (
    <>
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </>
  ),
  warning: (
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </>
  ),
};

/** Red down-trending arrow for drops, orange warning for being overtaken. Renders nothing for an unknown type. */
export default function AlertIcon({ type }) {
  const { icon, tone } = alertSeverity(type);
  if (!icon) return null;
  return (
    <svg
      className={`alert-icon alert-icon-${tone}`}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[icon]}
    </svg>
  );
}
