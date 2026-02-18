-- Optional: faster announcement search (ILIKE on description and item/group names).
-- Run: psql -f database/migrations_announcements_search_index.sql

-- Enable trigram extension for fast ILIKE (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index for search on announcement description
CREATE INDEX IF NOT EXISTS idx_announcements_description_trgm
  ON announcements USING gin (description gin_trgm_ops)
  WHERE status = 'published';

-- Indexes for search on catalog item names (used in JOIN + ILIKE)
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_en_trgm ON catalog_items USING gin (name_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_am_trgm ON catalog_items USING gin (name_am gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_items_name_ru_trgm ON catalog_items USING gin (name_ru gin_trgm_ops);

-- Indexes for search on catalog category/group names
CREATE INDEX IF NOT EXISTS idx_catalog_categories_name_en_trgm ON catalog_categories USING gin (name_en gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_name_am_trgm ON catalog_categories USING gin (name_am gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_name_ru_trgm ON catalog_categories USING gin (name_ru gin_trgm_ops);
