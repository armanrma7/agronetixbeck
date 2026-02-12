# Database Migration Guide

## Running Migrations in Supabase

Since we're using Supabase Postgres (database only, NOT Supabase Auth), you need to run the SQL migration script directly in Supabase.

### Method 1: Using Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Select your project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar
   - Click "New query"

3. **Run the Migration Script**
   - Open the file `database/migrations.sql` from this project
   - Copy the entire contents
   - Paste into the Supabase SQL Editor
   - Click "Run" (or press Cmd/Ctrl + Enter)

4. **Verify Tables Created**
   - Go to "Table Editor" in the left sidebar
   - You should see two new tables:
     - `users`
     - `otp_codes`

### Method 2: Using Supabase CLI (Alternative)

If you have Supabase CLI installed:

```bash
# Install Supabase CLI (if not installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Run migration
supabase db push
```

Then copy the contents of `database/migrations.sql` and run it via CLI or SQL Editor.

### Method 3: Using psql (Direct Postgres Connection)

If you have direct database access:

```bash
# Connect to Supabase Postgres
psql -h db.your-project.supabase.co \
     -U postgres \
     -d postgres \
     -f database/migrations.sql
```

You'll be prompted for the database password (found in Supabase project settings).

## What the Migration Does

The migration script:

1. **Creates Enum Types**
   - `user_type_enum`: farmer, company, admin
   - `otp_channel_enum`: sms, viber, whatsapp, telegram

2. **Creates Tables**
   - `users`: User accounts with all required fields
   - `otp_codes`: OTP verification codes

3. **Creates Indexes**
   - Performance indexes on frequently queried columns
   - Unique constraints for phone and company names

4. **Creates Functions**
   - `update_updated_at_column()`: Auto-update timestamp
   - `cleanup_expired_otps()`: Cleanup function for expired OTPs

5. **Creates Triggers**
   - Auto-update `updated_at` timestamp on user updates

## Verification

After running the migration, verify by running this query in SQL Editor:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'otp_codes');

-- Check if enums exist
SELECT typname 
FROM pg_type 
WHERE typname IN ('user_type_enum', 'otp_channel_enum');

-- Check table structure
\d users
\d otp_codes
```

## Troubleshooting

### Error: "relation already exists"
- Tables might already exist
- Drop existing tables first (if safe to do so):
  ```sql
  DROP TABLE IF EXISTS otp_codes CASCADE;
  DROP TABLE IF EXISTS users CASCADE;
  DROP TYPE IF EXISTS otp_channel_enum CASCADE;
  DROP TYPE IF EXISTS user_type_enum CASCADE;
  ```
- Then re-run the migration

### Error: "permission denied"
- Ensure you're using the correct database user
- Check that you have CREATE TABLE permissions
- Use the service role key if needed

### Error: "type already exists"
- Enums might already exist
- The script uses `CREATE TYPE IF NOT EXISTS` but some versions might not support it
- Drop and recreate if needed:
  ```sql
  DROP TYPE IF EXISTS otp_channel_enum CASCADE;
  DROP TYPE IF EXISTS user_type_enum CASCADE;
  ```

## Next Steps

After running the migration:

1. Update your `.env` file with database credentials
2. Test the connection by starting the app: `npm run start:dev`
3. Try registering a user via Swagger: http://localhost:3000/api

## Rollback (if needed)

To rollback the migration:

```sql
-- Drop tables
DROP TABLE IF EXISTS otp_codes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_otps() CASCADE;

-- Drop types
DROP TYPE IF EXISTS otp_channel_enum CASCADE;
DROP TYPE IF EXISTS user_type_enum CASCADE;
```

**Warning**: This will delete all data. Only use in development!

