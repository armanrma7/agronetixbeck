-- Migration: Update Applications Table
-- Creates applications table if it doesn't exist, adds delivery_dates (array), changes status enum to include 'closed', adds soft delete, adds count field
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- 1. CREATE APPLICATION STATUS ENUM (if not exists)
-- ============================================

-- Create application status enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE application_status_enum AS ENUM ('pending', 'approved', 'rejected', 'canceled', 'closed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add 'closed' to the enum if it doesn't exist (for existing enums)
DO $$ 
BEGIN
    -- Check if enum type exists and 'closed' doesn't exist
    IF EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'application_status_enum'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'closed' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status_enum')
    ) THEN
        -- Add 'closed' to the enum
        ALTER TYPE application_status_enum ADD VALUE 'closed';
    END IF;
END $$;

-- ============================================
-- 2. CREATE VALIDATION FUNCTION FOR DELIVERY DATES
-- ============================================

-- Function to validate that all delivery dates are not in the past
CREATE OR REPLACE FUNCTION validate_delivery_dates_not_past(dates DATE[])
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if array is empty
    IF array_length(dates, 1) IS NULL OR array_length(dates, 1) = 0 THEN
        RETURN FALSE;
    END IF;
    
    -- Check if any date is in the past
    RETURN NOT EXISTS (
        SELECT 1 FROM unnest(dates) AS d
        WHERE d < CURRENT_DATE
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================
-- 3. CREATE APPLICATIONS TABLE (if not exists)
-- ============================================

CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    count DECIMAL(10, 2) NULL CHECK (count IS NULL OR count > 0),
    delivery_dates DATE[] NOT NULL DEFAULT '{}' CHECK (array_length(delivery_dates, 1) > 0 AND validate_delivery_dates_not_past(delivery_dates)),
    notes TEXT,
    status application_status_enum DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- ============================================
-- 4. CREATE BASIC INDEXES (if not exists)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_applications_announcement_id ON applications(announcement_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_id ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);

-- Create partial unique index to prevent duplicate pending/approved applications
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_pending_approved 
ON applications(announcement_id, applicant_id) 
WHERE status IN ('pending', 'approved') AND deleted_at IS NULL;

-- ============================================
-- 5. CREATE TRIGGER FOR UPDATED_AT (if not exists)
-- ============================================

-- Create trigger function if not exists
CREATE OR REPLACE FUNCTION update_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists, then create new one
DROP TRIGGER IF EXISTS trigger_update_applications_updated_at ON applications;
CREATE TRIGGER trigger_update_applications_updated_at 
BEFORE UPDATE ON applications 
FOR EACH ROW 
EXECUTE FUNCTION update_applications_updated_at();

-- ============================================
-- 6. ADD MISSING COLUMNS (if table already existed)
-- ============================================

-- Add 'closed' to the enum (if not exists)
DO $$ 
BEGIN
    -- Check if 'closed' already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'closed' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'application_status_enum')
    ) THEN
        -- Add 'closed' to the enum
        ALTER TYPE application_status_enum ADD VALUE 'closed';
    END IF;
END $$;

-- Note: We cannot remove 'canceled' from the enum without recreating it
-- Existing 'canceled' records will remain, but new records should use 'closed'

-- Remove quantity column if it exists (no longer needed)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'quantity'
    ) THEN
        -- Drop constraint first if it exists
        ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_quantity_check;
        -- Drop the column
        ALTER TABLE applications DROP COLUMN quantity;
    END IF;
END $$;

-- Add count column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'count'
    ) THEN
        ALTER TABLE applications ADD COLUMN count DECIMAL(10, 2) NULL;
        ALTER TABLE applications ADD CONSTRAINT check_applications_count_positive 
        CHECK (count IS NULL OR count > 0);
    END IF;
END $$;

-- Rename delivery_date to delivery_dates and convert to array if column exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'delivery_date'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'delivery_dates'
    ) THEN
        -- Convert single date to array
        ALTER TABLE applications 
        ADD COLUMN delivery_dates DATE[] DEFAULT '{}';
        
        -- Migrate existing data: convert single date to array
        UPDATE applications 
        SET delivery_dates = CASE 
            WHEN delivery_date IS NOT NULL THEN ARRAY[delivery_date]
            ELSE '{}'
        END;
        
        -- Drop old column
        ALTER TABLE applications DROP COLUMN delivery_date;
        
        -- Add constraint for array dates (using function)
        ALTER TABLE applications 
        ADD CONSTRAINT check_applications_delivery_dates_not_past 
        CHECK (
            array_length(delivery_dates, 1) > 0 
            AND validate_delivery_dates_not_past(delivery_dates)
        );
    END IF;
END $$;

-- Add delivery_dates column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'delivery_dates'
    ) THEN
        ALTER TABLE applications ADD COLUMN delivery_dates DATE[] NOT NULL DEFAULT '{}';
        ALTER TABLE applications ADD CONSTRAINT check_applications_delivery_dates_not_past 
        CHECK (
            array_length(delivery_dates, 1) > 0 
            AND validate_delivery_dates_not_past(delivery_dates)
        );
    END IF;
END $$;

-- Rename note to notes if column exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'note'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'notes'
    ) THEN
        ALTER TABLE applications RENAME COLUMN note TO notes;
    END IF;
END $$;

-- Add notes column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'notes'
    ) THEN
        ALTER TABLE applications ADD COLUMN notes TEXT NULL;
    END IF;
END $$;

-- Remove contact_info column if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'contact_info'
    ) THEN
        ALTER TABLE applications DROP COLUMN contact_info;
    END IF;
END $$;

-- Add deleted_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'applications' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE applications ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE NULL;
    END IF;
END $$;

-- ============================================
-- 7. ADD NEW INDEXES
-- ============================================

-- Index on delivery_dates array (GIN index for array contains queries)
CREATE INDEX IF NOT EXISTS idx_applications_delivery_dates 
ON applications USING GIN(delivery_dates) 
WHERE deleted_at IS NULL;

-- Index on deleted_at (for soft delete queries)
CREATE INDEX IF NOT EXISTS idx_applications_deleted_at 
ON applications(deleted_at) 
WHERE deleted_at IS NULL;

-- Note: Composite index with array column is less efficient, so we keep separate indexes

-- ============================================
-- 8. ADD ADDITIONAL INDEXES (for soft delete)
-- ============================================

-- Status index excluding soft-deleted records
CREATE INDEX IF NOT EXISTS idx_applications_status_active 
ON applications(status) 
WHERE deleted_at IS NULL;

-- Applicant_id index excluding soft-deleted records
CREATE INDEX IF NOT EXISTS idx_applications_applicant_id_active 
ON applications(applicant_id) 
WHERE deleted_at IS NULL;

-- ============================================
-- 9. ADD COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN applications.count IS 'Count/quantity (required if announcement category is goods)';
COMMENT ON COLUMN applications.delivery_dates IS 'Required array of delivery dates (can send multiple dates for daily deliveries, cannot be in the past)';
COMMENT ON COLUMN applications.notes IS 'Optional notes or comments';
COMMENT ON COLUMN applications.deleted_at IS 'Soft delete timestamp (NULL = not deleted)';
COMMENT ON COLUMN applications.status IS 'pending, approved, rejected, closed, or canceled (legacy)';
COMMENT ON TABLE applications IS 'Applications to announcements';

-- ============================================
-- END OF MIGRATION
-- ============================================
