-- Catalog Schema: Categories → Subcategories → Items
-- Run this SQL in your Supabase SQL Editor

-- Create enum type for category type
CREATE TYPE category_type_enum AS ENUM ('goods', 'service', 'rent');

-- Catalog Categories table
CREATE TABLE IF NOT EXISTS catalog_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    type category_type_enum NOT NULL,
    name_am VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Catalog Subcategories table
CREATE TABLE IF NOT EXISTS catalog_subcategories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES catalog_categories(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    name_am VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(category_id, key)
);

-- Catalog Items table
CREATE TABLE IF NOT EXISTS catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subcategory_id UUID NOT NULL REFERENCES catalog_subcategories(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    name_am VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) NOT NULL,
    measurements JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(subcategory_id, key)
);

-- Indexes for catalog_categories
CREATE INDEX IF NOT EXISTS idx_catalog_categories_key ON catalog_categories(key);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_type ON catalog_categories(type);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_name_am ON catalog_categories(name_am);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_name_en ON catalog_categories(name_en);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_name_ru ON catalog_categories(name_ru);

-- Indexes for catalog_subcategories
CREATE INDEX IF NOT EXISTS idx_catalog_subcategories_category_id ON catalog_subcategories(category_id);
CREATE INDEX IF NOT EXISTS idx_catalog_subcategories_key ON catalog_subcategories(key);
CREATE INDEX IF NOT EXISTS idx_catalog_subcategories_name_am ON catalog_subcategories(name_am);
CREATE INDEX IF NOT EXISTS idx_catalog_subcategories_name_en ON catalog_subcategories(name_en);
CREATE INDEX IF NOT EXISTS idx_catalog_subcategories_name_ru ON catalog_subcategories(name_ru);

-- Indexes for catalog_items
CREATE INDEX IF NOT EXISTS idx_catalog_items_subcategory_id ON catalog_items(subcategory_id);
CREATE INDEX IF NOT EXISTS idx_catalog_items_key ON catalog_items(key);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_am ON catalog_items(name_am);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_en ON catalog_items(name_en);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_ru ON catalog_items(name_ru);
CREATE INDEX IF NOT EXISTS idx_catalog_items_measurements ON catalog_items USING GIN(measurements);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_catalog_categories_updated_at 
BEFORE UPDATE ON catalog_categories 
FOR EACH ROW 
EXECUTE FUNCTION update_catalog_updated_at();

CREATE TRIGGER update_catalog_subcategories_updated_at 
BEFORE UPDATE ON catalog_subcategories 
FOR EACH ROW 
EXECUTE FUNCTION update_catalog_updated_at();

CREATE TRIGGER update_catalog_items_updated_at 
BEFORE UPDATE ON catalog_items 
FOR EACH ROW 
EXECUTE FUNCTION update_catalog_updated_at();

-- Add comments
COMMENT ON TABLE catalog_categories IS 'Catalog categories';
COMMENT ON COLUMN catalog_categories.type IS 'Category type: goods, service, or rent';
COMMENT ON COLUMN catalog_categories.name_am IS 'Armenian name';
COMMENT ON COLUMN catalog_categories.name_en IS 'English name';
COMMENT ON COLUMN catalog_categories.name_ru IS 'Russian name';
COMMENT ON TABLE catalog_subcategories IS 'Catalog subcategories';
COMMENT ON COLUMN catalog_subcategories.name_am IS 'Armenian name';
COMMENT ON COLUMN catalog_subcategories.name_en IS 'English name';
COMMENT ON COLUMN catalog_subcategories.name_ru IS 'Russian name';
COMMENT ON TABLE catalog_items IS 'Catalog items';
COMMENT ON COLUMN catalog_items.key IS 'Unique key for the item within subcategory';
COMMENT ON COLUMN catalog_items.name_am IS 'Armenian name';
COMMENT ON COLUMN catalog_items.name_en IS 'English name';
COMMENT ON COLUMN catalog_items.name_ru IS 'Russian name';
COMMENT ON COLUMN catalog_items.measurements IS 'Array of measurement units as JSONB: [{"hy": "կգ", "en": "kg", "ru": "кг"}, ...]';

