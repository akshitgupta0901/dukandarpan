
CREATE TABLE IF NOT EXISTS businesses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, category)
);

CREATE TABLE IF NOT EXISTS queries (
  id SERIAL PRIMARY KEY,
  query_text TEXT NOT NULL,
  category TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  UNIQUE (query_text)
);

CREATE TABLE IF NOT EXISTS tracking (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  query_id INTEGER NOT NULL REFERENCES queries (id) ON DELETE CASCADE,
  UNIQUE (business_id, query_id)
);

CREATE TABLE IF NOT EXISTS raw_results (
  id SERIAL PRIMARY KEY,
  query_id INTEGER NOT NULL REFERENCES queries (id) ON DELETE CASCADE,
  payload_json JSONB NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS snapshots (
  id SERIAL PRIMARY KEY,
  query_id INTEGER NOT NULL REFERENCES queries (id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  position INTEGER, -- NULL when not_found; NULL is the valid "not found" state, not an error
  found BOOLEAN NOT NULL,
  in_organic_map_pack BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_business_id ON tracking (business_id);
CREATE INDEX IF NOT EXISTS idx_tracking_query_id ON tracking (query_id);
CREATE INDEX IF NOT EXISTS idx_raw_results_query_id ON raw_results (query_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_business_id ON snapshots (business_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_query_id ON snapshots (query_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_checked_at ON snapshots (checked_at);
