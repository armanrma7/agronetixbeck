# AcronetXBeck - NestJS Authentication System

Production-ready NestJS authentication system with OTP-based phone verification.

## Features

- User registration (Farmer, Company, Admin)
- OTP-based phone verification
- Login with phone + password
- Forgot password flow
- Admin escalation for recovery
- Swagger/OpenAPI documentation

## Tech Stack

- NestJS (latest)
- TypeScript
- TypeORM
- Supabase Postgres (database only)
- bcrypt for password hashing
- class-validator for validation
- Swagger for API documentation

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Configure your `.env` file with:
   - Supabase database credentials
   - MSG91 SMS credentials:
     - `MSG91_AUTH_KEY` - Your MSG91 authentication key
     - `MSG91_SENDER_ID` - Your MSG91 sender ID (default: ACRONET)
   - JWT secret

4. Run database migrations (create tables in Supabase):
   - See `database/migrations.sql` for table schemas

5. Start the application:
```bash
npm run start:dev
```

6. Access Swagger documentation:
   - http://localhost:3000/api

## Database Schema

The application uses Supabase Postgres with the following tables:
- `users` - User accounts
- `otp_codes` - OTP verification codes

See `database/migrations.sql` for full schema.

## API Endpoints

### Auth
- `POST /auth/register` - Register new user
- `POST /auth/send-otp` - Send OTP to phone
- `POST /auth/verify-otp` - Verify OTP code
- `POST /auth/login` - Login with phone + password
- `POST /auth/forgot-password` - Initiate password reset
- `POST /auth/reset-password` - Reset password with OTP

### Admin
- `POST /admin/unlock-user` - Unlock user account
- `POST /admin/verify-company` - Verify company account

## Deployment

Ready for deployment on VPS with static IP. Ensure:
- Environment variables are set
- Database connection is configured
- SMS provider credentials are valid
- JWT secret is strong and secure

