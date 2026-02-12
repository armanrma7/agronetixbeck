-- Remove the announcements_data_check constraint
-- All validation is now done server-side in NestJS

-- Drop the constraint
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_data_check;

-- Also drop any auto-named constraints (check1, check2, check3, etc.)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'announcements'::regclass
        AND contype = 'c'
        AND conname LIKE 'announcements_check%'
    ) LOOP
        EXECUTE 'ALTER TABLE announcements DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Verify constraint is removed
SELECT 
    conname AS constraint_name,
    pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'announcements'::regclass
AND contype = 'c'
AND conname = 'announcements_data_check';

-- Should return 0 rows (constraint removed)

