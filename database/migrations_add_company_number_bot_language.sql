-- Add company_number and language columns to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_number VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS language VARCHAR(10) NOT NULL DEFAULT 'en';
