-- Allow users to apply again when their previous application is not pending.
-- Drop the unique index that prevented multiple applications per (announcement_id, applicant_id).
-- Run: psql -f database/migrations_applications_allow_reapply.sql

DROP INDEX IF EXISTS idx_applications_unique_per_user;

-- Optional: partial unique index so only one PENDING per (announcement_id, applicant_id)
-- This enforces in DB: same user cannot have two pending applications for same announcement
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_pending_per_user
  ON applications (announcement_id, applicant_id)
  WHERE status = 'pending';
