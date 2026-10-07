-- Step 5: which language the cached recommendation is written in ('en' or 'hinglish'),
-- so asking for the other language regenerates it instead of showing the wrong one.
-- NULL (rows cached before this) is treated as English.
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS ai_insight_lang TEXT;
