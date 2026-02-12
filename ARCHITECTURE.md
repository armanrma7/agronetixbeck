# Architecture Overview

## Project Structure

```
AcronetXBeck/
├── src/
│   ├── auth/                    # Authentication module
│   │   ├── dto/                 # Data Transfer Objects
│   │   │   ├── register.dto.ts
│   │   │   ├── send-otp.dto.ts
│   │   │   ├── verify-otp.dto.ts
│   │   │   ├── login.dto.ts
│   │   │   ├── forgot-password.dto.ts
│   │   │   └── reset-password.dto.ts
│   │   ├── auth.controller.ts   # Auth endpoints
│   │   ├── auth.service.ts      # Auth business logic
│   │   └── auth.module.ts       # Auth module definition
│   ├── admin/                   # Admin module
│   │   ├── dto/
│   │   │   ├── unlock-user.dto.ts
│   │   │   └── verify-company.dto.ts
│   │   ├── admin.controller.ts  # Admin endpoints
│   │   ├── admin.service.ts     # Admin business logic
│   │   └── admin.module.ts      # Admin module definition
│   ├── common/                  # Shared services
│   │   ├── services/
│   │   │   ├── otp.service.ts   # OTP generation & verification
│   │   │   └── sms-provider.service.ts  # Abstracted SMS provider
│   │   └── common.module.ts
│   ├── entities/                # TypeORM entities
│   │   ├── user.entity.ts
│   │   └── otp-code.entity.ts
│   ├── app.module.ts            # Root module
│   └── main.ts                  # Application entry point
├── database/
│   └── migrations.sql           # Database schema
├── .env.example                 # Environment variables template
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture Principles

### Clean Architecture
- **Separation of Concerns**: Controllers handle HTTP, Services handle business logic
- **Dependency Injection**: NestJS DI container manages dependencies
- **Modular Design**: Feature-based modules (auth, admin)

### Security
- **Password Hashing**: bcrypt with salt rounds
- **OTP Hashing**: OTPs are hashed before storage
- **Input Validation**: class-validator on all DTOs
- **Type Safety**: TypeScript throughout

### Database
- **TypeORM**: Object-Relational Mapping
- **Supabase Postgres**: Database only (NOT using Supabase Auth)
- **Migrations**: SQL scripts for schema management

## Data Flow

### Registration Flow
1. Client sends registration data → `POST /auth/register`
2. Controller validates DTO → `AuthController.register()`
3. Service checks uniqueness → `AuthService.register()`
4. Password hashed → `bcrypt.hash()`
5. User saved to database
6. Response: "Registration success" or "Awaiting verification"

### OTP Flow
1. Client requests OTP → `POST /auth/send-otp`
2. OTP generated (6 digits) → `OtpService.generateOtp()`
3. OTP hashed → `bcrypt.hash()`
4. OTP saved with expiry → `otp_codes` table
5. SMS sent via provider → `SmsProviderService.sendOtp()`
6. Client verifies OTP → `POST /auth/verify-otp`
7. OTP verified → `bcrypt.compare()`
8. User marked as verified (if Farmer)

### Login Flow
1. Client sends credentials → `POST /auth/login`
2. User fetched by phone
3. Account lock checked
4. Password verified → `bcrypt.compare()`
5. Last login/active updated
6. User data returned (password excluded)

### Forgot Password Flow
1. Client requests reset → `POST /auth/forgot-password`
2. User existence checked
3. Inactivity check (>12 months)
4. OTP sent if active
5. Admin review required if inactive
6. Client verifies OTP → `POST /auth/reset-password`
7. Password updated (hashed)

## User Types

### Farmer
- Verified: `true` after OTP verification
- Can login immediately after OTP
- No admin review required

### Company
- Verified: `false` after registration
- Requires admin review
- Admin verifies via `POST /admin/verify-company`
- Cannot login until verified

### Admin
- Special user type
- Can unlock accounts
- Can verify companies

## OTP System

### Generation
- 6-digit numeric code
- Random generation: 100000-999999
- Hashed with bcrypt before storage

### Expiry
- Default: 60 seconds (configurable)
- Stored as `expires_at` timestamp
- Expired OTPs cleaned up automatically

### Verification
- Max attempts: 5 (configurable)
- Attempts tracked in database
- OTP marked as verified after success

### Channels
- Currently: SMS only
- Abstracted for future: Viber, WhatsApp, Telegram
- Provider abstraction: MSG91, Twilio, etc.

## Error Messages

All error messages match system requirements:
- "Duplicate phone" - Phone already registered
- "Duplicate company" - Company name already exists
- "OTP expired" - OTP code expired
- "Wrong OTP" - Invalid OTP code
- "Terms not accepted" - Terms checkbox not checked
- "Registration success" - Farmer registered successfully
- "Awaiting verification" - Company registered, awaiting admin review

## API Endpoints

### Auth Endpoints
- `POST /auth/register` - Register new user
- `POST /auth/send-otp` - Send OTP to phone
- `POST /auth/verify-otp` - Verify OTP code
- `POST /auth/login` - Login with phone + password
- `POST /auth/forgot-password` - Initiate password reset
- `POST /auth/reset-password` - Reset password with OTP

### Admin Endpoints
- `POST /admin/unlock-user` - Unlock/lock user account
- `POST /admin/verify-company` - Verify/reject company
- `GET /admin/users-requiring-review` - List users needing review

## Environment Variables

All configuration via environment variables:
- Database connection
- JWT secrets
- OTP settings
- SMS provider credentials
- Application settings

## Deployment

Ready for VPS deployment:
- Static IP support
- Environment-based configuration
- Production-ready error handling
- Logging support
- SSL/TLS ready

