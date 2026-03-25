-- Migration: create messages table
-- Users send messages to the platform/admins.
-- Admins can see all messages; users can only see their own.

CREATE TABLE IF NOT EXISTS messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject    VARCHAR(255),
  body       TEXT        NOT NULL,
  is_seen    BOOLEAN     NOT NULL DEFAULT FALSE,
  seen_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_messages_user_id    ON messages (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_seen    ON messages (is_seen);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at DESC);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_updated_at ON messages;
CREATE TRIGGER trg_messages_updated_at
  BEFORE UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION update_messages_updated_at();
