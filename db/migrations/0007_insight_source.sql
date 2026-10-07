-- Step 2: records whether a cached recommendation was written by the AI or by
-- the built-in rules, so the card can label it. NULL for rows cached earlier.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_insight_source TEXT;
