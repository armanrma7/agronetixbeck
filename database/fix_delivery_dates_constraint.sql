-- Fix: applications_delivery_dates_check uses CURRENT_DATE, which causes any UPDATE
-- on rows whose delivery_dates are now in the past to fail — including legitimate
-- status transitions like PENDING → CANCELED by the system job.
--
-- Application-level validation (validateStoredDeliveryDatesForApproval) already
-- prevents approving applications with past dates, so the DB constraint is redundant
-- and harmful. Drop it entirely.

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_delivery_dates_check;
