-- Fix ALL CHECK constraints in existing database
-- Remove all individual constraints and create ONE comprehensive constraint
-- Run this if you're getting "violates check constraint" errors

-- Drop ALL existing CHECK constraints (PostgreSQL auto-names them check1, check2, etc.)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'announcements'::regclass
        AND contype = 'c'
    ) LOOP
        EXECUTE 'ALTER TABLE announcements DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Drop named constraints if they exist
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_date_from_check;
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_date_to_check;
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS check_date_range;
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS check_dates;
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_data_check;

-- Add SINGLE comprehensive constraint for ALL validations
ALTER TABLE announcements ADD CONSTRAINT announcements_data_check CHECK (
    -- Price must be >= 0
    price >= 0
    -- Count validation: required for goods, NULL for others
    AND (
        (category = 'goods' AND count > 0 AND count <= 999999)
        OR (category != 'goods' AND count IS NULL)
    )
    -- Daily limit validation: if provided, must be > 0 and <= count
    AND (
        daily_limit IS NULL
        OR (
            daily_limit > 0
            AND CASE
                WHEN count IS NULL THEN TRUE
                ELSE daily_limit <= count
            END
        )
    )
    -- Date validation: required for rent, NULL for others
    AND (
        (category = 'rent' AND date_from IS NOT NULL AND date_to IS NOT NULL AND date_from < date_to)
        OR (category != 'rent' AND date_from IS NULL AND date_to IS NULL)
    )
    -- Min area validation: if provided, must be > 0
    AND (min_area IS NULL OR min_area > 0)
);

-- Verify the constraint
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'announcements'::regclass 
-- AND contype = 'c';

