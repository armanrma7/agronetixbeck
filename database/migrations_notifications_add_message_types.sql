-- Add new notification type enum values for centralized message system
-- Run after migrations_notifications.sql. Safe to run multiple times (duplicate_object ignored).
DO $$
DECLARE
    new_vals TEXT[] := ARRAY[
        'application_canceled',
        'announcement_created',
        'announcement_edited',
        'announcement_expiring_soon',
        'announcement_auto_closed'
    ];
    v TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type_enum') THEN
        FOREACH v IN ARRAY new_vals
        LOOP
            BEGIN
                EXECUTE format('ALTER TYPE notification_type_enum ADD VALUE %L', v);
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END;
        END LOOP;
    END IF;
END $$;
