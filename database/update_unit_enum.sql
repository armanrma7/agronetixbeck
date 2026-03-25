-- ============================================================
-- Migration: replace unit_enum with new set of values
-- New values: kg, t, lt, un, pk, bdl, box, m2, m3, ha,
--             day, hour, month, year, tree, bed
-- ============================================================

BEGIN;

-- 1. Temporarily convert the column to plain text so we can drop the old type
ALTER TABLE announcements ALTER COLUMN unit TYPE text;

-- 2. Drop old enum type
DROP TYPE IF EXISTS unit_enum;

-- 3. Create new enum type with updated values
CREATE TYPE unit_enum AS ENUM (
  'kg', 't', 'lt', 'un', 'pk', 'bdl', 'box',
  'm2', 'm3', 'ha',
  'day', 'hour', 'month', 'year',
  'tree', 'bed'
);

-- 4. Map any old values that changed name, nullify anything unrecognisable
UPDATE announcements
SET unit = CASE unit
  WHEN 'ton'   THEN 't'
  WHEN 'liter' THEN 'lt'
  WHEN 'pcs'   THEN 'un'
  WHEN 'bag'   THEN 'pk'
  WHEN 'week'  THEN NULL   -- no direct equivalent, clear it
  ELSE unit                -- keep if already valid (kg, m2, ha, day, hour, month, year)
END
WHERE unit IS NOT NULL;

-- 5. Nullify any remaining values that are not in the new enum
UPDATE announcements
SET unit = NULL
WHERE unit IS NOT NULL
  AND unit NOT IN (
    'kg', 't', 'lt', 'un', 'pk', 'bdl', 'box',
    'm2', 'm3', 'ha',
    'day', 'hour', 'month', 'year',
    'tree', 'bed'
  );

-- 6. Cast column back to the new enum type
ALTER TABLE announcements
  ALTER COLUMN unit TYPE unit_enum
  USING unit::unit_enum;

COMMIT;
