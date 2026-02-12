-- Migration: Add type column to catalog_categories table
-- Run this SQL in your Supabase SQL Editor if the table already exists

-- Create enum type for category type (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'category_type_enum') THEN
        CREATE TYPE category_type_enum AS ENUM ('goods', 'service', 'rent');
    END IF;
END $$;

-- Add type column to catalog_categories table (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'catalog_categories' AND column_name = 'type'
    ) THEN
        ALTER TABLE catalog_categories 
        ADD COLUMN type category_type_enum NOT NULL DEFAULT 'goods';
    END IF;
END $$;

-- Create index for type column (if not exists)
CREATE INDEX IF NOT EXISTS idx_catalog_categories_type ON catalog_categories(type);

-- Add comment
COMMENT ON COLUMN catalog_categories.type IS 'Category type: goods, service, or rent';

