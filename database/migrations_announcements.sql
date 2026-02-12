-- Announcements and Applications Schema
-- Run this SQL in your Supabase SQL Editor

-- ============================================
-- 1. CREATE ENUM TYPES (IF NOT EXISTS)
-- ============================================

-- Type enum (sell or buy)
DO $$ BEGIN
    CREATE TYPE announcement_type_enum AS ENUM ('sell', 'buy');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Category enum
DO $$ BEGIN
    CREATE TYPE announcement_category_enum AS ENUM ('goods', 'rent', 'service');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Status enum
DO $$ BEGIN
    CREATE TYPE announcement_status_enum AS ENUM ('pending', 'published', 'closed', 'canceled', 'blocked');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Unit enum (optional field)
DO $$ BEGIN
    CREATE TYPE unit_enum AS ENUM ('kg', 'ton', 'pcs', 'liter', 'bag', 'm2', 'ha');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Application status enum
DO $$ BEGIN
    CREATE TYPE application_status_enum AS ENUM ('pending', 'approved', 'rejected', 'canceled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- 2. CREATE ANNOUNCEMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS announcements (
    -- Primary key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Required fields
    type announcement_type_enum NOT NULL,
    category announcement_category_enum NOT NULL,
    
    -- Foreign keys to catalog
    group_id UUID NOT NULL REFERENCES catalog_categories(id) ON DELETE RESTRICT,
    item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE RESTRICT,
    
    -- Price and description
    price DECIMAL(12, 2) NOT NULL,
    description TEXT,
    
    -- Owner reference
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Status
    status announcement_status_enum NOT NULL DEFAULT 'pending',
    
    -- Closed by (nullable - only set when status changes to closed)
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    
    -- ====================================
    -- CONDITIONAL FIELDS (category-specific)
    -- ====================================
    
    -- For category = 'goods': count is required
    count DECIMAL(10, 2),
    
    -- For category = 'goods': daily_limit is optional
    daily_limit DECIMAL(10, 2),
    
    -- Available quantity (calculated field for goods)
    available_quantity DECIMAL(10, 2) DEFAULT 0,
    
    -- Unit is optional for all categories
    unit unit_enum,
    
    -- Images optional for all categories
    images TEXT[] DEFAULT '{}',
    
    -- For category = 'rent': date_from and date_to are required
    date_from DATE,
    date_to DATE,
    
    -- min_area is optional (typically for rent category)
    min_area DECIMAL(10, 2),
    
    -- ====================================
    -- SINGLE COMPREHENSIVE CHECK CONSTRAINT
    -- ====================================
    CONSTRAINT announcements_data_check CHECK (
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
    ),
    
    -- ====================================
    -- LOCATION FIELDS
    -- ====================================
    
    -- Array of region IDs (optional)
    regions UUID[] DEFAULT '{}',
    
    -- Array of village IDs (optional)
    villages UUID[] DEFAULT '{}',
    
    -- ====================================
    -- TIMESTAMPS
    -- ====================================
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ============================================
-- 3. CREATE INDEXES FOR ANNOUNCEMENTS
-- ============================================

-- Owner lookup
CREATE INDEX IF NOT EXISTS idx_announcements_owner_id ON announcements(owner_id);

-- Status filtering
CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status);

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_announcements_category ON announcements(category);

-- Type filtering
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(type);

-- Catalog relationships
CREATE INDEX IF NOT EXISTS idx_announcements_group_id ON announcements(group_id);
CREATE INDEX IF NOT EXISTS idx_announcements_item_id ON announcements(item_id);

-- Recent announcements
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements(created_at DESC);

-- Location filtering (GIN indexes for array contains queries)
CREATE INDEX IF NOT EXISTS idx_announcements_regions ON announcements USING GIN(regions);
CREATE INDEX IF NOT EXISTS idx_announcements_villages ON announcements USING GIN(villages);

-- Composite index for published announcements (common query)
CREATE INDEX IF NOT EXISTS idx_announcements_published_recent 
ON announcements(status, created_at DESC) 
WHERE status = 'published';

-- Index for rent date range queries
CREATE INDEX IF NOT EXISTS idx_announcements_rent_dates 
ON announcements(date_from, date_to) 
WHERE category = 'rent';

-- ============================================
-- 4. CREATE APPLICATIONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    quantity DECIMAL(10, 2) NOT NULL CHECK (quantity > 0),
    note TEXT,
    contact_info VARCHAR(255),
    status application_status_enum DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- ============================================
-- 5. CREATE INDEXES FOR APPLICATIONS
-- ============================================

CREATE INDEX IF NOT EXISTS idx_applications_announcement_id ON applications(announcement_id);
CREATE INDEX IF NOT EXISTS idx_applications_applicant_id ON applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);

-- Create partial unique index to prevent duplicate pending/approved applications
-- This ensures a user can only have one pending or approved application per announcement
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_pending_approved 
ON applications(announcement_id, applicant_id) 
WHERE status IN ('pending', 'approved');

-- ============================================
-- 6. CREATE TRIGGERS FOR UPDATED_AT
-- ============================================

CREATE OR REPLACE FUNCTION update_announcements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS trigger_update_announcements_updated_at ON announcements;
CREATE TRIGGER trigger_update_announcements_updated_at 
BEFORE UPDATE ON announcements 
FOR EACH ROW 
EXECUTE FUNCTION update_announcements_updated_at();

CREATE OR REPLACE FUNCTION update_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS trigger_update_applications_updated_at ON applications;
CREATE TRIGGER trigger_update_applications_updated_at 
BEFORE UPDATE ON applications 
FOR EACH ROW 
EXECUTE FUNCTION update_applications_updated_at();

-- ============================================
-- 7. CREATE FUNCTION FOR AVAILABLE QUANTITY
-- ============================================

-- Function to calculate available quantity (for goods category only)
CREATE OR REPLACE FUNCTION calculate_announcement_available_quantity(announcement_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
    total_count DECIMAL;
    approved_total DECIMAL;
    available DECIMAL;
    ann_category announcement_category_enum;
BEGIN
    -- Get announcement count and category
    SELECT count, category INTO total_count, ann_category
    FROM announcements
    WHERE id = announcement_uuid;
    
    -- Only calculate for goods category
    IF ann_category != 'goods' THEN
        RETURN 0;
    END IF;

    -- Get sum of approved applications
    SELECT COALESCE(SUM(quantity), 0) INTO approved_total
    FROM applications
    WHERE announcement_id = announcement_uuid
    AND status = 'approved';

    -- Calculate available
    available := total_count - approved_total;

    -- Update available_quantity
    UPDATE announcements
    SET available_quantity = GREATEST(0, available)
    WHERE id = announcement_uuid;

    RETURN GREATEST(0, available);
END;
$$ LANGUAGE plpgsql;

-- Trigger to recalculate available quantity when application status changes
CREATE OR REPLACE FUNCTION trigger_calculate_available_quantity()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM calculate_announcement_available_quantity(NEW.announcement_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists, then create new one
DROP TRIGGER IF EXISTS calculate_available_quantity_on_application_change ON applications;
CREATE TRIGGER calculate_available_quantity_on_application_change
AFTER INSERT OR UPDATE OF status, quantity ON applications
FOR EACH ROW
EXECUTE FUNCTION trigger_calculate_available_quantity();

-- ============================================
-- 8. ADD HELPFUL COMMENTS
-- ============================================

COMMENT ON TABLE announcements IS 'Marketplace announcements for goods, services, and rent with catalog integration';
COMMENT ON COLUMN announcements.type IS 'Type of announcement: sell or rent';
COMMENT ON COLUMN announcements.category IS 'Category: goods, rent, or service';
COMMENT ON COLUMN announcements.group_id IS 'Foreign key to catalog_categories';
COMMENT ON COLUMN announcements.item_id IS 'Foreign key to catalog_items';
COMMENT ON COLUMN announcements.price IS 'Price in base currency';
COMMENT ON COLUMN announcements.owner_id IS 'User who created the announcement';
COMMENT ON COLUMN announcements.closed_by IS 'User who closed the announcement (admin or owner)';
COMMENT ON COLUMN announcements.count IS 'Required for goods category: available quantity';
COMMENT ON COLUMN announcements.daily_limit IS 'Optional: max daily sales (must be <= count if provided)';
COMMENT ON COLUMN announcements.available_quantity IS 'Calculated: count - sum of approved applications (goods only)';
COMMENT ON COLUMN announcements.images IS 'Array of image URLs - optional';
COMMENT ON COLUMN announcements.date_from IS 'Required for rent category: rental start date';
COMMENT ON COLUMN announcements.date_to IS 'Required for rent category: rental end date';
COMMENT ON COLUMN announcements.min_area IS 'Optional: minimum area (typically for rent)';
COMMENT ON COLUMN announcements.regions IS 'Optional: array of region UUIDs where announcement is available';
COMMENT ON COLUMN announcements.villages IS 'Optional: array of village UUIDs where announcement is available';
COMMENT ON TABLE applications IS 'Applications to announcements';
COMMENT ON COLUMN applications.status IS 'pending, approved, rejected, or canceled';

-- ============================================
-- END OF MIGRATION
-- ============================================

