# Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- Supabase account with Postgres database
- npm or yarn package manager

## Setup Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Database Setup

1. Open your Supabase project
2. Go to SQL Editor
3. Copy and run the contents of `database/migrations.sql`
4. Verify tables are created: `users` and `otp_codes`

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- Database credentials (from Supabase)
- SMS provider credentials (MSG91 or similar)
- JWT secret (generate a strong random string)

### 4. Start Development Server

```bash
npm run start:dev
```

### 5. Access Swagger Documentation

Open your browser:
```
http://localhost:3000/api
```

## Testing the API

### 1. Register a Farmer

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "user_type": "farmer",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "password": "SecurePass123!",
    "terms_accepted": true
  }'
```

### 2. Send OTP

```bash
curl -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "channel": "sms",
    "purpose": "registration"
  }'
```

**Note**: In development mode, OTP will be logged to console if SMS provider is not configured.

### 3. Verify OTP

```bash
curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "code": "123456",
    "purpose": "registration"
  }'
```

### 4. Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "password": "SecurePass123!"
  }'
```

### 5. Register a Company

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "user_type": "company",
    "full_name": "Acme Corporation",
    "phone": "+1987654321",
    "password": "SecurePass123!",
    "terms_accepted": true
  }'
```

Response will be: "Awaiting verification" (requires admin review)

### 6. Admin: Verify Company

```bash
curl -X POST http://localhost:3000/admin/verify-company \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1987654321",
    "verified": true,
    "reason": "Company documents verified"
  }'
```

## Development Notes

- OTP codes are logged to console in development mode
- Database synchronization is enabled in development (set `synchronize: false` in production)
- All validation errors return detailed messages
- Swagger UI provides interactive API testing

## Common Issues

### Database Connection Error
- Verify Supabase database credentials in `.env`
- Check if SSL is required (already configured)
- Ensure database is accessible from your IP

### OTP Not Received
- Check console logs (development mode)
- Verify SMS provider credentials
- Check phone number format (must include country code)

### Validation Errors
- All fields are validated using class-validator
- Check Swagger docs for required fields and formats
- Phone numbers must be in E.164 format (e.g., +1234567890)

## Next Steps

- Configure SMS provider for production
- Set up proper logging
- Add rate limiting
- Configure CORS for your frontend
- Set up monitoring and alerts

