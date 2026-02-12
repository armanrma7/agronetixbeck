# Changelog: Account Status and Profile Picture

## New Features Added

### 1. Account Status for Companies
Companies now have an `account_status` field with three possible values:
- **pending**: Company is awaiting admin review (default for new companies)
- **active**: Company is verified and active
- **blocked**: Company account is blocked

### 2. Profile Picture
All users (Farmers, Companies, Admins) can now have a profile picture:
- Field: `profile_picture` (VARCHAR 500)
- Stores URL or path to the profile picture
- Optional field during registration

## Database Changes

### New Enum Type
```sql
CREATE TYPE account_status_enum AS ENUM ('pending', 'active', 'blocked');
```

### New Columns
- `users.profile_picture` - VARCHAR(500), nullable
- `users.account_status` - account_status_enum, default 'pending'

### New Index
- `idx_users_account_status` - Index on account_status for better query performance

## Code Changes

### Entity Updates
- `User` entity now includes:
  - `profile_picture: string` (optional)
  - `account_status: AccountStatus` enum
  - New `AccountStatus` enum exported

### Registration Logic
- **Farmers**: Account status set to `active` by default
- **Companies**: Account status set to `pending` by default (requires admin review)
- Profile picture can be provided during registration (optional)

### Login Logic
- Companies with `pending` status cannot login
- Companies with `blocked` status cannot login
- Only companies with `active` status and `verified: true` can login

### Admin Service
- `verifyCompany()` now updates both `verified` and `account_status`
- If `account_status` is provided, it's used directly
- Otherwise, status is set based on verification:
  - `verified: true` → `active`
  - `verified: false` → `blocked`
- `getUsersRequiringReview()` now includes companies with `pending` status

### DTOs Updated
- `RegisterDto`: Added optional `profile_picture` field
- `VerifyCompanyDto`: Added optional `account_status` field

## Migration Instructions

### For New Installations
Run the updated `database/migrations.sql` which includes all new fields.

### For Existing Databases
Run the incremental migration:
```sql
-- Run in Supabase SQL Editor
-- File: database/migrations_add_account_status_and_profile.sql
```

This migration will:
1. Create the `account_status_enum` type
2. Add `profile_picture` column
3. Add `account_status` column
4. Set existing companies to `pending`, others to `active`
5. Create index on `account_status`

## API Usage Examples

### Register Company with Profile Picture
```json
POST /auth/register
{
  "user_type": "company",
  "full_name": "Acme Corp",
  "phone": "+1234567890",
  "password": "SecurePass123!",
  "profile_picture": "https://example.com/logo.jpg",
  "terms_accepted": true
}
```

Response: Account status will be `pending`

### Admin Verify Company with Status
```json
POST /admin/verify-company
{
  "phone": "+1234567890",
  "verified": true,
  "account_status": "active",
  "reason": "Documents verified"
}
```

### Admin Block Company
```json
POST /admin/verify-company
{
  "phone": "+1234567890",
  "verified": false,
  "account_status": "blocked",
  "reason": "Violation of terms"
}
```

## Account Status Flow

### Company Registration Flow
1. Company registers → `account_status: pending`
2. Admin reviews → Sets `account_status: active` (or `blocked`)
3. Company can login only when `account_status: active` AND `verified: true`

### Status Transitions
- `pending` → `active` (via admin verification)
- `pending` → `blocked` (via admin rejection)
- `active` → `blocked` (via admin action)
- `blocked` → `active` (via admin unlock)

## Notes

- Farmers always have `account_status: active` (no review needed)
- Companies must be both `verified: true` AND `account_status: active` to login
- Profile picture is optional for all user types
- Account status is separate from `is_locked` flag (which is for temporary locks)

