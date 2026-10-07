

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES businesses (id) ON DELETE CASCADE,
  query_id INTEGER NOT NULL REFERENCES queries (id) ON DELETE CASCADE,
  snapshot_id INTEGER NOT NULL REFERENCES snapshots (id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL, -- 'rank_drop' | 'fell_out'
  previous_position INTEGER,
  previous_found BOOLEAN NOT NULL,
  new_position INTEGER,
  new_found BOOLEAN NOT NULL,
  message TEXT NOT NULL,
  telegram_sent BOOLEAN NOT NULL DEFAULT false,
  telegram_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_business_id ON alerts (business_id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts (created_at);
