-- System-level (DB) enforcement for application status rules.
--
-- Mappings (backend enum mapping):
--   TO_BE_VERIFIED -> announcements.status = 'pending'
--   ACTIVE         -> announcements.status = 'published'
--
-- Rules implemented:
-- 1) If announcement is pending, application STATUS changes are not allowed.
-- 2) If announcement moves published -> closed: applications pending -> canceled.
-- 3) If announcement moves published -> canceled: applications pending/approved -> canceled.
--
-- Run in Supabase / Postgres SQL editor.

-- =========================================================
-- A) Block application status changes while announcement pending
-- =========================================================
CREATE OR REPLACE FUNCTION block_application_status_change_when_announcement_pending()
RETURNS TRIGGER AS $$
DECLARE
  ann_status text;
BEGIN
  -- Only enforce when status changes
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT status INTO ann_status FROM announcements WHERE id = NEW.announcement_id;
    IF ann_status = 'pending' THEN
      RAISE EXCEPTION 'Application status cannot be changed while announcement is pending verification';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_app_status_when_ann_pending ON applications;
CREATE TRIGGER trg_block_app_status_when_ann_pending
BEFORE UPDATE OF status ON applications
FOR EACH ROW
EXECUTE FUNCTION block_application_status_change_when_announcement_pending();

-- =========================================================
-- B) Automatically map application statuses on announcement status change
-- =========================================================
CREATE OR REPLACE FUNCTION map_application_statuses_on_announcement_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only handle transitions from ACTIVE (published)
  IF OLD.status = 'published' AND NEW.status = 'closed' THEN
    -- PENDING -> CANCELED
    UPDATE applications
    SET status = 'canceled'
    WHERE announcement_id = NEW.id
      AND status = 'pending'
      AND deleted_at IS NULL;
  ELSIF OLD.status = 'published' AND NEW.status = 'canceled' THEN
    -- PENDING/APPROVED -> CANCELED
    UPDATE applications
    SET status = 'canceled'
    WHERE announcement_id = NEW.id
      AND status IN ('pending', 'approved')
      AND deleted_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_map_app_status_on_announcement_status ON announcements;
CREATE TRIGGER trg_map_app_status_on_announcement_status
AFTER UPDATE OF status ON announcements
FOR EACH ROW
EXECUTE FUNCTION map_application_statuses_on_announcement_status_change();

