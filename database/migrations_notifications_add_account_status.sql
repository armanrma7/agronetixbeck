-- Add account_status_changed to notification_type_enum
-- Run migrations_notifications.sql first if the notifications table does not exist.
-- This block only runs when the enum already exists (e.g. after initial notifications migration).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum') THEN
        BEGIN
            ALTER TYPE notification_type_enum ADD VALUE 'account_status_changed';
        EXCEPTION
            WHEN duplicate_object THEN NULL;  -- value already exists, ignore
        END;
    END IF;
END $$;
