-- Migration: Add key and measurement fields to catalog_items table
-- Run this SQL in your Supabase SQL Editor if the table already exists

-- Add key column to catalog_items table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'catalog_items' AND column_name = 'key'
    ) THEN
        ALTER TABLE catalog_items 
        ADD COLUMN key VARCHAR(255);
        
        -- Generate keys for existing items based on name_en
        UPDATE catalog_items 
        SET key = LOWER(REGEXP_REPLACE(name_en, '[^a-z0-9]', '_', 'g'))
        WHERE key IS NULL;
        
        -- Make key NOT NULL after populating
        ALTER TABLE catalog_items 
        ALTER COLUMN key SET NOT NULL;
    END IF;
END $$;

-- Add measurements JSONB column (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'catalog_items' AND column_name = 'measurements'
    ) THEN
        ALTER TABLE catalog_items 
        ADD COLUMN measurements JSONB;
    END IF;
END $$;

-- Add unique constraint for (subcategory_id, key) if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'catalog_items_subcategory_id_key_key'
    ) THEN
        ALTER TABLE catalog_items 
        ADD CONSTRAINT catalog_items_subcategory_id_key_key 
        UNIQUE (subcategory_id, key);
    END IF;
END $$;

-- Create indexes (if not exists)
CREATE INDEX IF NOT EXISTS idx_catalog_items_key ON catalog_items(key);
CREATE INDEX IF NOT EXISTS idx_catalog_items_measurements ON catalog_items USING GIN(measurements);

-- Add comments
COMMENT ON COLUMN catalog_items.key IS 'Unique key for the item within subcategory';
COMMENT ON COLUMN catalog_items.measurements IS 'Array of measurement units as JSONB: [{"hy": "կգ", "en": "kg", "ru": "кг"}, ...]';

