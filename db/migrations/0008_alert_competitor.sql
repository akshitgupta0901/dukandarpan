-- Step 3: "overtaken" alerts name the competitor that just passed the business.
-- NULL for the older rank_drop and fell_out alerts.
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS competitor_name TEXT;
