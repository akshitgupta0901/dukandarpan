-- Judge mode: flags queries whose data is generated sample data (see
-- db/seed-demo.mjs and lib/demo-data.mjs). The cron and live checks skip these
-- queries, and the UI labels them as demo data. Additive and re-runnable.
ALTER TABLE queries ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
