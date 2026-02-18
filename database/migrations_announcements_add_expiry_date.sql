-- Add expiry_date column to announcements table
-- Run: psql -f database/migrations_announcements_add_expiry_date.sql

ALTER TABLE announcements 
ADD COLUMN IF NOT EXISTS expiry_date DATE;

CREATE INDEX IF NOT EXISTS idx_announcements_expiry_date 
ON announcements(expiry_date) 
WHERE expiry_date IS NOT NULL AND status = 'published';
