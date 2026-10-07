-- Phase 7: cached insight/recommendation per business (rule-based, see
-- lib/insight.mjs). Recomputed only on an explicit "Get insight" / "Refresh
-- insight" click -- never automatically on page load. Column names keep the
-- "ai_" prefix from when this was first written; renaming would need a new
-- migration. Both columns are NULL until the first click.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS ai_insight TEXT,
  ADD COLUMN IF NOT EXISTS ai_insight_generated_at TIMESTAMPTZ;
