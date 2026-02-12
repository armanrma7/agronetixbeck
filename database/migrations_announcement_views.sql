-- Migration: Create announcement views tracking system
-- This ensures one user can only count as one view per announcement

-- Create announcement_views junction table
CREATE TABLE IF NOT EXISTS announcement_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one user can only view an announcement once
    UNIQUE(announcement_id, user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_announcement_views_announcement_id ON announcement_views(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_views_user_id ON announcement_views(user_id);
CREATE INDEX IF NOT EXISTS idx_announcement_views_viewed_at ON announcement_views(viewed_at);

-- Add views_count column to announcements table (calculated field)
-- This will be updated via a trigger or calculated on-the-fly
ALTER TABLE announcements 
ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;

-- Create index for views_count for sorting/filtering
CREATE INDEX IF NOT EXISTS idx_announcements_views_count ON announcements(views_count);

-- Function to update views_count when a view is added
CREATE OR REPLACE FUNCTION update_announcement_views_count()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE announcements
    SET views_count = (
        SELECT COUNT(*) 
        FROM announcement_views 
        WHERE announcement_id = NEW.announcement_id
    )
    WHERE id = NEW.announcement_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update views_count when a view is added
DROP TRIGGER IF EXISTS trigger_update_views_count ON announcement_views;
CREATE TRIGGER trigger_update_views_count
AFTER INSERT ON announcement_views
FOR EACH ROW
EXECUTE FUNCTION update_announcement_views_count();

-- Function to update views_count when a view is deleted (for cleanup)
CREATE OR REPLACE FUNCTION update_announcement_views_count_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE announcements
    SET views_count = (
        SELECT COUNT(*) 
        FROM announcement_views 
        WHERE announcement_id = OLD.announcement_id
    )
    WHERE id = OLD.announcement_id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update views_count when a view is deleted
DROP TRIGGER IF EXISTS trigger_update_views_count_on_delete ON announcement_views;
CREATE TRIGGER trigger_update_views_count_on_delete
AFTER DELETE ON announcement_views
FOR EACH ROW
EXECUTE FUNCTION update_announcement_views_count_on_delete();

-- Initialize views_count for existing announcements
UPDATE announcements
SET views_count = (
    SELECT COUNT(*) 
    FROM announcement_views 
    WHERE announcement_views.announcement_id = announcements.id
);

-- Add helpful comments
COMMENT ON TABLE announcement_views IS 'Tracks which users have viewed which announcements (one view per user per announcement)';
COMMENT ON COLUMN announcement_views.announcement_id IS 'Foreign key to announcements table';
COMMENT ON COLUMN announcement_views.user_id IS 'Foreign key to users table - the user who viewed the announcement';
COMMENT ON COLUMN announcement_views.viewed_at IS 'Timestamp when the user viewed the announcement';
COMMENT ON COLUMN announcements.views_count IS 'Total number of unique users who viewed this announcement';

