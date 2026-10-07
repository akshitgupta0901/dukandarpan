

CREATE TABLE IF NOT EXISTS cron_runs (
  id SERIAL PRIMARY KEY,
  run_date DATE NOT NULL,
  triggered_by TEXT NOT NULL DEFAULT 'cron', -- 'cron' or 'manual'
  status TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  results_json JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cron_runs_one_cron_per_day
  ON cron_runs (run_date)
  WHERE triggered_by = 'cron';

CREATE INDEX IF NOT EXISTS idx_cron_runs_run_date ON cron_runs (run_date);
