-- AcronetXBeck Database Schema
-- Supabase Postgres Database (NOT using Supabase Auth)
-- Run this SQL in your Supabase SQL Editor

-- Create enum types
CREATE TYPE user_type_enum AS ENUM ('farmer', 'company', 'admin');
CREATE TYPE otp_channel_enum AS ENUM ('sms', 'viber', 'whatsapp', 'telegram');
CREATE TYPE account_status_enum AS ENUM ('pending', 'active', 'blocked');

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type user_type_enum NOT NULL DEFAULT 'farmer',
    phones TEXT[] DEFAULT '{}',
    emails TEXT[] DEFAULT '{}',
    profile_picture VARCHAR(500),
    region_id UUID,
    village_id UUID,
    account_status account_status_enum DEFAULT 'pending',
    verified BOOLEAN DEFAULT false,
    is_locked BOOLEAN DEFAULT false,
    terms_accepted BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP,
    last_active_at TIMESTAMP,
    refresh_token TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_user_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_users_verified ON users(verified);
CREATE INDEX IF NOT EXISTS idx_users_is_locked ON users(is_locked);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status);

-- Unique constraint for company names
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_company_name 
ON users(full_name) 
WHERE user_type = 'company';

-- OTP codes table
CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) NOT NULL,
    hashed_code VARCHAR(255) NOT NULL,
    channel otp_channel_enum NOT NULL DEFAULT 'sms',
    expires_at TIMESTAMP NOT NULL,
    attempts INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT false,
    purpose VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for OTP table
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at ON otp_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_otp_codes_verified ON otp_codes(verified);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_users_updated_at 
BEFORE UPDATE ON users 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- Optional: Create a function to clean up expired OTPs (can be called via cron)
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
    DELETE FROM otp_codes 
    WHERE expires_at < NOW() 
    AND verified = false;
END;
$$ language 'plpgsql';

