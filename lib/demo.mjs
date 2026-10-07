/**
 * Judge mode: generated sample data, kept clearly apart from real data.
 *
 * Demo queries are flagged queries.is_demo (migration 0006). They exist so a
 * visitor sees a populated dashboard with no setup (see db/seed-demo.mjs and
 * lib/demo-data.mjs). Everything that could spend SerpApi credits or present
 * data as live goes through the helpers here so demo queries are never
 * searched, and the UI can label them.
 */
export const DEMO_CATEGORY = "demo cafe";
export const DEMO_QUERY_TEXT = "cafe near Katpadi (demo)";
export const DEMO_LIVE_CHECK_MESSAGE = "This is sample data, so live checks are turned off.";

/** Queries a live search is allowed to run for: everything except demo queries. */
export function excludeDemoQueries(queries) {
  return queries.filter((q) => !q.is_demo);
}

/** Backstop for any code path that is about to call SerpApi for a query row. */
export function assertLiveQuery(query) {
  if (query?.is_demo) throw new Error(DEMO_LIVE_CHECK_MESSAGE);
  return query;
}
