-- Step 4: Share of Voice. queries.location_text is the place name sent to SerpApi as the
-- organic search's location (NULL means skip the organic search for that query).
-- snapshots.organic_position is the business's rank in the regular Google results
-- (NULL = not in them, or the organic search wasn't run).
ALTER TABLE queries ADD COLUMN IF NOT EXISTS location_text TEXT;
ALTER TABLE snapshots ADD COLUMN IF NOT EXISTS organic_position INTEGER;

-- Backfill only the original seeded Vellore queries (the old code hardcoded this place
-- for every organic search). Demo queries and anything else stay NULL.
UPDATE queries SET location_text = 'Vellore, Tamil Nadu, India'
WHERE lat = 12.968 AND lng = 79.1503 AND is_demo = false AND location_text IS NULL;
