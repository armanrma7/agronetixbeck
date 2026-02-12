-- Migration: Create regions and villages tables
-- Run this SQL in your Supabase SQL Editor

-- Regions table
CREATE TABLE IF NOT EXISTS regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_am VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(name_am, name_en, name_ru)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_regions_name_am ON regions(name_am);
CREATE INDEX IF NOT EXISTS idx_regions_name_en ON regions(name_en);
CREATE INDEX IF NOT EXISTS idx_regions_name_ru ON regions(name_ru);

-- Villages table
CREATE TABLE IF NOT EXISTS villages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    name_am VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(region_id, name_am, name_en, name_ru)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_villages_region_id ON villages(region_id);
CREATE INDEX IF NOT EXISTS idx_villages_name_am ON villages(name_am);
CREATE INDEX IF NOT EXISTS idx_villages_name_en ON villages(name_en);
CREATE INDEX IF NOT EXISTS idx_villages_name_ru ON villages(name_ru);

-- Function to update updated_at timestamp for regions
CREATE OR REPLACE FUNCTION update_regions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to update updated_at timestamp for villages
CREATE OR REPLACE FUNCTION update_villages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_regions_updated_at 
BEFORE UPDATE ON regions 
FOR EACH ROW 
EXECUTE FUNCTION update_regions_updated_at();

CREATE TRIGGER update_villages_updated_at 
BEFORE UPDATE ON villages 
FOR EACH ROW 
EXECUTE FUNCTION update_villages_updated_at();

-- Add comments
COMMENT ON TABLE regions IS 'Armenian provinces/regions in multiple languages';
COMMENT ON TABLE villages IS 'Villages/cities in Armenian provinces';
COMMENT ON COLUMN regions.name_am IS 'Region name in Armenian';
COMMENT ON COLUMN regions.name_en IS 'Region name in English';
COMMENT ON COLUMN regions.name_ru IS 'Region name in Russian';
COMMENT ON COLUMN villages.name_am IS 'Village name in Armenian';
COMMENT ON COLUMN villages.name_en IS 'Village name in English';
COMMENT ON COLUMN villages.name_ru IS 'Village name in Russian';

