"use client";

import { buildShareText, pickTopCompetitor, whatsAppUrl } from "../lib/share-text.mjs";

/**
 * "Share on WhatsApp" for the selected business. A plain wa.me link with the summary
 * in the URL (see lib/share-text.mjs), so there is no backend: the owner chooses the
 * chat and taps Send inside WhatsApp.
 */
export default function WhatsAppShare({ business, competitors, insight }) {
  const text = buildShareText({
    businessName: business.name,
    queryText: business.queryText,
    found: business.found,
    position: business.position,
    trend: business.trend,
    trendChange: business.trendChange,
    topCompetitor: pickTopCompetitor(competitors?.competitors),
    insight,
    isDemo: business.isDemo,
  });

  return (
    <a className="btn" href={whatsAppUrl(text)} target="_blank" rel="noopener noreferrer">
      Share on WhatsApp
    </a>
  );
}
