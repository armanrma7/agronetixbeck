-- Add rent_measurements to catalog_items (optional; for rent category items)
-- Same structure as measurements: JSONB array of { hy, en, ru }.
-- Run once: psql $DATABASE_URL -f database/migrations_catalog_items_rent_measurements.sql

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS rent_measurements JSONB NULL;

COMMENT ON COLUMN catalog_items.rent_measurements IS 'Rent-specific measurement options (e.g. per day, per month). Array of { hy, en, ru }.';
