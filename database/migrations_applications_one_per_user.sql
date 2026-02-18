-- One application per user per announcement: unique on (announcement_id, applicant_id)
-- Run: psql -f database/migrations_applications_one_per_user.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_unique_per_user
  ON applications (announcement_id, applicant_id);
