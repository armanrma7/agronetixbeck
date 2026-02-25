-- Migration: add resend_count to otp_codes
-- Run this once against your database before deploying the new OTP service.

ALTER TABLE otp_codes
  ADD COLUMN IF NOT EXISTS resend_count INTEGER NOT NULL DEFAULT 0;
