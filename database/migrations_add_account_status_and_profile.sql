-- Migration: Add account_status and profile_picture to users table
-- Run this if you already have the initial migration applied
-- For new installations, use migrations.sql which includes these fields

-- Create account_status enum type (if not exists)
DO $$ BEGIN
    CREATE TYPE account_status_enum AS ENUM ('pending', 'active', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add profile_picture column (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'profile_picture'
    ) THEN
        ALTER TABLE users ADD COLUMN profile_picture VARCHAR(500);
    END IF;
END $$;

-- Add account_status column (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'account_status'
    ) THEN
        ALTER TABLE users ADD COLUMN account_status account_status_enum DEFAULT 'pending';
        
        -- Set existing companies to pending, others to active
        UPDATE users 
        SET account_status = CASE 
            WHEN user_type = 'company' THEN 'pending'::account_status_enum
            ELSE 'active'::account_status_enum
        END;
    END IF;
END $$;

-- Add refresh_token column (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'refresh_token'
    ) THEN
        ALTER TABLE users ADD COLUMN refresh_token TEXT;
    END IF;
END $$;

-- Add region column (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'region'
    ) THEN
        ALTER TABLE users ADD COLUMN region VARCHAR(255);
    END IF;
END $$;

-- Add village column (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'village'
    ) THEN
        ALTER TABLE users ADD COLUMN village VARCHAR(255);
    END IF;
END $$;

-- Create index for account_status (if not exists)
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

-- Add comment to columns
COMMENT ON COLUMN users.profile_picture IS 'URL or path to profile picture';
COMMENT ON COLUMN users.account_status IS 'Account status: pending (for companies awaiting review), active, or blocked';

