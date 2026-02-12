# JWT Token Implementation

## Overview

JWT authentication with access tokens and refresh tokens has been implemented. Unverified users are now blocked from logging in.

## Changes Made

### 1. Packages Added
- `@nestjs/jwt` - JWT module for NestJS
- `@nestjs/passport` - Passport integration
- `passport` - Authentication middleware
- `passport-jwt` - JWT strategy for Passport
- `@types/passport-jwt` - TypeScript types

**Run `npm install` to install these packages.**

### 2. User Entity Updated
- Added `refresh_token` field (TEXT, nullable) to store refresh tokens

### 3. JWT Service Created (`src/auth/jwt.service.ts`)
- `generateTokens()` - Generates access and refresh tokens
- `verifyToken()` - Verifies access token
- `verifyRefreshToken()` - Verifies refresh token
- `refreshAccessToken()` - Generates new access token from refresh token

### 4. Login Updated
- **Blocks unverified users** - Returns error if `verified = false`
- Returns access token and refresh token on successful login
- Stores refresh token in database

### 5. Refresh Token Endpoint
- `POST /auth/refresh-token` - Refreshes access token
- Validates refresh token
- Checks if token matches stored token
- Returns new access token

## Environment Variables

Add to your `.env` file:

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

## API Endpoints

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "phone": "+1234567890",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "user_type": "farmer",
    "verified": true
  },
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 900
}
```

**Error (Unverified User):**
```json
{
  "statusCode": 401,
  "message": "Account not verified. Please verify your account with OTP first."
}
```

### Refresh Token
```http
POST /auth/refresh-token
Content-Type: application/json

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 900
}
```

## Token Structure

### Access Token Payload
```json
{
  "sub": "user-id",
  "phone": "+1234567890",
  "user_type": "farmer",
  "verified": true,
  "iat": 1234567890,
  "exp": 1234568790
}
```

### Refresh Token Payload
Same structure as access token but with longer expiration (7 days default)

## Security Features

1. **Unverified User Blocking**
   - Users must verify OTP before login
   - Login fails if `verified = false`

2. **Token Validation**
   - Refresh token must match stored token
   - Tokens are verified before use
   - Expired tokens are rejected

3. **Account Status Checks**
   - Locked accounts cannot login
   - Companies must be active and verified
   - Pending companies cannot login

## Database Migration

Run the migration to add `refresh_token` field:

```sql
-- Add refresh_token column (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'refresh_token'
    ) THEN
        ALTER TABLE users ADD COLUMN refresh_token TEXT;
    END IF;
END $$;
```

Or use the updated migration file: `database/migrations_add_account_status_and_profile.sql`

## Usage Flow

1. **User Registration**
   - User registers → OTP sent automatically
   - User verifies OTP → Account marked as verified

2. **User Login**
   - User provides phone + password
   - System checks: verified, not locked, valid credentials
   - Returns access token + refresh token

3. **Token Refresh**
   - Access token expires (15 minutes default)
   - User sends refresh token
   - System returns new access token

4. **Protected Routes** (Future)
   - Use access token in `Authorization: Bearer <token>` header
   - Implement JWT guard to validate tokens

## Next Steps

1. Install packages: `npm install`
2. Add JWT environment variables to `.env`
3. Run database migration for `refresh_token` field
4. Test login and refresh token endpoints
5. Implement JWT guard for protected routes (optional)

## Token Expiration

- **Access Token**: 15 minutes (configurable via `JWT_EXPIRES_IN`)
- **Refresh Token**: 7 days (configurable via `JWT_REFRESH_EXPIRES_IN`)

## Notes

- Refresh tokens are stored in database for validation
- Access tokens are stateless (no database lookup needed)
- Unverified users cannot login (must verify OTP first)
- Companies need both verification AND admin approval to login

