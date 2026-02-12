-- Migration: Convert measurement columns to JSONB array
-- Run this SQL in your Supabase SQL Editor if the table already exists with separate measurement columns

-- Step 1: Add new measurements JSONB column (if not exists)
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

-- Step 2: Migrate existing data from separate columns to JSONB array
-- Only migrate if measurements column is empty and old columns have data
UPDATE catalog_items
SET measurements = jsonb_build_array(
    jsonb_build_object(
        'hy', NULLIF(measurement_am, ''),
        'en', NULLIF(measurement_en, ''),
        'ru', NULLIF(measurement_ru, '')
    )
)
WHERE (measurement_am IS NOT NULL OR measurement_en IS NOT NULL OR measurement_ru IS NOT NULL)
  AND (measurements IS NULL OR measurements = '[]'::jsonb);

-- Step 3: Clean up null-only measurement objects in arrays
UPDATE catalog_items
SET measurements = (
    SELECT jsonb_agg(meas)
    FROM jsonb_array_elements(measurements) AS meas
    WHERE meas != '{"hy": null, "en": null, "ru": null}'::jsonb
       AND meas != '{}'::jsonb
)
WHERE measurements IS NOT NULL;

-- Step 4: Set measurements to NULL if array becomes empty after cleanup
UPDATE catalog_items
SET measurements = NULL
WHERE measurements = '[]'::jsonb;

-- Step 5: Drop old measurement columns (if they exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'catalog_items' AND column_name = 'measurement_am'
    ) THEN
        ALTER TABLE catalog_items DROP COLUMN measurement_am;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'catalog_items' AND column_name = 'measurement_en'
    ) THEN
        ALTER TABLE catalog_items DROP COLUMN measurement_en;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'catalog_items' AND column_name = 'measurement_ru'
    ) THEN
        ALTER TABLE catalog_items DROP COLUMN measurement_ru;
    END IF;
END $$;

-- Step 6: Create GIN index for JSONB measurements column (if not exists)
CREATE INDEX IF NOT EXISTS idx_catalog_items_measurements 
ON catalog_items USING GIN(measurements);

-- Add comment
COMMENT ON COLUMN catalog_items.measurements IS 'Array of measurement units as JSONB: [{"hy": "կգ", "en": "kg", "ru": "кг"}, ...]';

