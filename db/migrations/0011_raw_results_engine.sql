-- Which SerpApi engine produced a stored response: 'google_maps' (every check) or 'google'
-- (the regular results, saved on manual checks that run the organic search). Existing rows are
-- all maps responses, so they keep the default. Every reader that wants the maps response
-- (competitors, review growth, benchmark, history, overtakes) filters on engine = 'google_maps'.
ALTER TABLE raw_results ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL DEFAULT 'google_maps';

-- "Latest response per engine for a query" is the shape of every read.
CREATE INDEX IF NOT EXISTS idx_raw_results_query_engine_checked ON raw_results (query_id, engine, checked_at DESC);
