-- Migration: Add region_id and village_id foreign keys to users table
-- Run this if you already have the users table
-- For new installations, use migrations.sql which includes these fields

-- Add region_id column (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'region_id'
    ) THEN
        ALTER TABLE users ADD COLUMN region_id UUID;
    END IF;
END $$;

-- Add village_id column (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'village_id'
    ) THEN
        ALTER TABLE users ADD COLUMN village_id UUID;
    END IF;
END $$;

-- Add foreign key constraint for region_id (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_users_region_id'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT fk_users_region_id 
        FOREIGN KEY (region_id) 
        REFERENCES regions(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Add foreign key constraint for village_id (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_users_village_id'
    ) THEN
        ALTER TABLE users 
        ADD CONSTRAINT fk_users_village_id 
        FOREIGN KEY (village_id) 
        REFERENCES villages(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_region_id ON users(region_id);
CREATE INDEX IF NOT EXISTS idx_users_village_id ON users(village_id);

-- Drop old region and village string columns if they exist (optional - comment out if you want to keep them)
-- ALTER TABLE users DROP COLUMN IF EXISTS region;
-- ALTER TABLE users DROP COLUMN IF EXISTS village;

-- Add comments
COMMENT ON COLUMN users.region_id IS 'Foreign key to regions table';
COMMENT ON COLUMN users.village_id IS 'Foreign key to villages table';

