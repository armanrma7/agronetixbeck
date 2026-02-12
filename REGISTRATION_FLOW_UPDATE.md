# Registration Flow Update

## Overview

The registration flow has been updated to handle existing unverified users. Users can now update their credentials if they previously registered but didn't complete OTP verification.

## New Behavior

### Registration Flow (`POST /auth/register`)

1. **User exists and is verified**
   - Returns: `"User exists"`
   - User data is returned
   - No changes are made

2. **User exists but NOT verified**
   - Updates user with new credentials (name, password, etc.)
   - Resets verified status to `false`
   - Returns: `"User updated. Please verify OTP"` (for Farmers)
   - Returns: `"User updated. Awaiting verification"` (for Companies)
   - User must verify OTP to complete registration

3. **User does not exist**
   - Creates new user (existing behavior)
   - Returns: `"Registration success"` (for Farmers)
   - Returns: `"Awaiting verification"` (for Companies)

## Updated OTP Verification

The `verifyOtp` endpoint now returns user data after successful verification:

- **Farmer**: Account is marked as verified, returns user data
- **Company**: OTP verified but still requires admin verification, returns user data

## API Response Examples

### Scenario 1: Verified User Tries to Register
```json
POST /auth/register
{
  "user_type": "farmer",
  "full_name": "John Doe",
  "phone": "+1234567890",
  "password": "NewPass123!",
  "terms_accepted": true
}

Response:
{
  "message": "User exists",
  "user": {
    "id": "uuid",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "user_type": "farmer",
    "verified": true
  }
}
```

### Scenario 2: Unverified User Updates Credentials
```json
POST /auth/register
{
  "user_type": "farmer",
  "full_name": "John Updated",
  "phone": "+1234567890",
  "password": "NewPass123!",
  "terms_accepted": true
}

Response:
{
  "message": "User updated. Please verify OTP",
  "user": {
    "id": "uuid",
    "full_name": "John Updated",
    "phone": "+1234567890",
    "user_type": "farmer",
    "verified": false
  }
}
```

### Scenario 3: OTP Verification After Update
```json
POST /auth/verify-otp
{
  "phone": "+1234567890",
  "code": "123456",
  "purpose": "registration"
}

Response (Farmer):
{
  "message": "OTP verified successfully. Account is now verified.",
  "user": {
    "id": "uuid",
    "full_name": "John Updated",
    "phone": "+1234567890",
    "user_type": "farmer",
    "verified": true
  }
}
```

## Updated Fields

When updating an existing unverified user, the following fields are updated:
- `full_name`
- `password` (hashed)
- `user_type`
- `phones` (merged with existing)
- `emails` (merged with existing)
- `profile_picture` (if provided)
- `terms_accepted`
- `verified` (reset to `false`)
- `account_status` (reset to `pending` for companies)

## Benefits

1. **User-friendly**: Users who didn't complete registration can update their info and try again
2. **Flexible**: Allows users to change their password/name before verification
3. **Secure**: Verified users cannot be overwritten
4. **Clear messaging**: Different messages for different scenarios

## Flow Diagram

```
Registration Request
    |
    v
User exists?
    |
    +-- Yes --> Verified?
    |           |
    |           +-- Yes --> Return "User exists"
    |           |
    |           +-- No --> Update credentials
    |                       Return "User updated. Please verify OTP"
    |                       |
    |                       v
    |                   Send OTP
    |                       |
    |                       v
    |                   User verifies OTP
    |                       |
    |                       v
    |                   Mark as verified (Farmer)
    |                   or Await admin (Company)
    |
    +-- No --> Create new user
                Return "Registration success" or "Awaiting verification"
```

## Notes

- Verified users cannot be updated through registration endpoint
- Company name uniqueness is still enforced (cannot have duplicate company names with different phones)
- All password updates are hashed before storage
- OTP must be sent after registration/update to complete verification

