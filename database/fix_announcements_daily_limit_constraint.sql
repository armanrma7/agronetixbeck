-- Fix daily_limit CHECK constraint in existing database
-- Run this if you're getting "violates check constraint" errors

-- First, find the constraint name
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'announcements'::regclass 
-- AND contype = 'c';

-- Drop the existing constraint (adjust name if different)
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_daily_limit_check;
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_check1;
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_check2;

-- Recreate with correct logic
ALTER TABLE announcements ADD CONSTRAINT announcements_daily_limit_check CHECK (
    daily_limit IS NULL 
    OR (
        daily_limit > 0 
        AND CASE 
            WHEN count IS NULL THEN TRUE
            ELSE daily_limit <= count
        END
    )
);

-- Verify the constraint
-- SELECT conname, pg_get_constraintdef(oid) 
-- FROM pg_constraint 
-- WHERE conrelid = 'announcements'::regclass 
-- AND contype = 'c' 
-- AND conname LIKE '%daily_limit%';

