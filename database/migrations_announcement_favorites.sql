-- Migration: Create announcement favorites system
-- Users can save announcements as favorites and retrieve them
-- Only published announcements can be favorited

-- Create announcement_favorites junction table
CREATE TABLE IF NOT EXISTS announcement_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one user can only favorite an announcement once
    UNIQUE(announcement_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_announcement_favorites_announcement_id ON announcement_favorites(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_favorites_user_id ON announcement_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_favorites_created_at ON announcement_favorites(created_at);

-- Add comment to table
COMMENT ON TABLE announcement_favorites IS 'Tracks user favorites for announcements. Only published announcements should be shown in favorites.';
COMMENT ON COLUMN announcement_favorites.announcement_id IS 'Foreign key to announcements table';
COMMENT ON COLUMN announcement_favorites.user_id IS 'Foreign key to users table';
COMMENT ON COLUMN announcement_favorites.created_at IS 'Timestamp when the announcement was favorited';

