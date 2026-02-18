-- Migration: Create notifications system
-- Stores notifications sent to users via Firebase and allows tracking seen/unseen status

-- Create notification type enum
DO $$ BEGIN
    CREATE TYPE notification_type_enum AS ENUM (
        'application_created',
        'application_approved',
        'application_rejected',
        'application_closed',
        'announcement_published',
        'announcement_closed',
        'announcement_blocked',
        'announcement_canceled',
        'account_status_changed',
        'general'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type_enum NOT NULL DEFAULT 'general',
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_seen BOOLEAN DEFAULT false,
    seen_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_seen ON notifications(is_seen);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_seen ON notifications(user_id, is_seen);
CREATE INDEX IF NOT EXISTS idx_notifications_user_type ON notifications(user_id, type);

-- Add comments
COMMENT ON TABLE notifications IS 'Stores notifications sent to users via Firebase Cloud Messaging';
COMMENT ON COLUMN notifications.user_id IS 'User who receives the notification';
COMMENT ON COLUMN notifications.type IS 'Type of notification (application_created, announcement_published, etc.)';
COMMENT ON COLUMN notifications.title IS 'Notification title';
COMMENT ON COLUMN notifications.body IS 'Notification body/message';
COMMENT ON COLUMN notifications.data IS 'Additional data payload (JSON)';
COMMENT ON COLUMN notifications.is_seen IS 'Whether the user has seen this notification';
COMMENT ON COLUMN notifications.seen_at IS 'Timestamp when notification was marked as seen';
