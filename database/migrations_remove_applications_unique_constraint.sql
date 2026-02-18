-- Remove unique constraint so one user can apply multiple times to the same announcement
-- Drop the partial unique index that prevented duplicate pending/approved applications per (announcement_id, applicant_id)

DROP INDEX IF EXISTS idx_applications_unique_pending_approved;
