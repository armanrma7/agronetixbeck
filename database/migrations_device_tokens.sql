-- Device Tokens Table for FCM (Firebase Cloud Messaging)
-- Run this SQL in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_id VARCHAR(100),
    device_type VARCHAR(50),
    device_model VARCHAR(100),
    os_version VARCHAR(50),
    app_version VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_fcm_token ON device_tokens(fcm_token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_device_id ON device_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_is_active ON device_tokens(is_active);

-- Create unique index for user + fcm_token combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_user_fcm 
ON device_tokens(user_id, fcm_token);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_device_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_device_tokens_updated_at 
BEFORE UPDATE ON device_tokens 
FOR EACH ROW 
EXECUTE FUNCTION update_device_tokens_updated_at();

-- Add comments
COMMENT ON TABLE device_tokens IS 'FCM tokens and device information for push notifications';
COMMENT ON COLUMN device_tokens.fcm_token IS 'Firebase Cloud Messaging token';
COMMENT ON COLUMN device_tokens.device_id IS 'Unique device identifier';
COMMENT ON COLUMN device_tokens.is_active IS 'Whether this token is still active';

