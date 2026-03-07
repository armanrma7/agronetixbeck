-- Add rent_unit column to announcements (optional; for rent: price per hour/day/week/month/year)
-- Run once: psql ... -f database/migrations_announcements_add_rent_unit.sql

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rent_unit_enum') THEN
    CREATE TYPE rent_unit_enum AS ENUM ('hour', 'day', 'week', 'month', 'year');
  END IF;
END$$;

ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS rent_unit rent_unit_enum NULL;
