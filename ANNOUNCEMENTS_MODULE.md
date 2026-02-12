# Announcements Module - Complete Backend Implementation

## Overview

Production-ready NestJS backend module for managing announcements (Goods, Service, Rent) with full business logic, validations, role-based access control, notifications, and scheduled tasks.

## Features

- ✅ **Complete CRUD operations** for announcements
- ✅ **Role-based access control** (Farmers, Companies, Admins)
- ✅ **Status management** (TO_BE_VERIFIED, PUBLISHED, CLOSED, CANCELED)
- ✅ **Applications system** with approval/rejection workflow
- ✅ **Firebase Cloud Messaging** for push notifications
- ✅ **Scheduled tasks** for auto-closing expired announcements
- ✅ **Comprehensive validation** with detailed error messages
- ✅ **Business rules enforcement** (editing, closing, canceling)
- ✅ **Available quantity calculation** based on approved applications

## Database Schema

### Announcements Table
- `id` (UUID, Primary Key)
- `category` (enum: goods, service, rent)
- `type` (VARCHAR: buy/sell, rent_in/rent_out)
- `group` (VARCHAR: e.g., Grain, Machinery)
- `name` (VARCHAR: e.g., Wheat, Tractor)
- `description` (TEXT, max 500 chars, optional)
- `quantity` (DECIMAL, > 0, ≤ 999999)
- `unit` (enum: kg, ton, pcs, liter, bag)
- `price_per_unit` (JSONB: {from?: number, to?: number})
- `photos` (TEXT[], max 3, optional)
- `availability_period` (JSONB: {start: Date, end?: Date}, optional)
- `region_ids` (UUID[], optional)
- `village_ids` (UUID[], optional)
- `daily_limit` (DECIMAL, optional, ≤ quantity)
- `status` (enum: to_be_verified, published, closed, canceled)
- `user_id` (UUID, Foreign Key → users)
- `available_quantity` (DECIMAL: calculated automatically)
- `created_at`, `updated_at` (TIMESTAMP)

### Applications Table
- `id` (UUID, Primary Key)
- `announcement_id` (UUID, Foreign Key → announcements)
- `applicant_id` (UUID, Foreign Key → users)
- `quantity` (DECIMAL, > 0)
- `note` (TEXT, optional, max 500 chars)
- `contact_info` (VARCHAR, optional, max 255)
- `status` (enum: pending, approved, rejected, canceled)
- `created_at`, `updated_at` (TIMESTAMP)

## API Endpoints

### Announcements

#### Create Announcement
```http
POST /announcements
Authorization: Bearer <token>
Content-Type: application/json

{
  "category": "goods",
  "type": "sell",
  "group": "Grain",
  "name": "Wheat",
  "description": "High quality wheat",
  "quantity": 1000,
  "unit": "kg",
  "price_per_unit": {
    "from": 100,
    "to": 150
  },
  "photos": ["url1", "url2"],
  "availability_period": {
    "start": "2024-12-31",
    "end": "2025-01-31"
  },
  "region_ids": ["uuid1", "uuid2"],
  "village_ids": ["uuid3"],
  "daily_limit": 100
}
```

**Response:**
- If description OR photos exist → Status: `TO_BE_VERIFIED`
  - Message: "The announcement has been successfully created and is awaiting administrator verification within 24 hours."
- If description AND photos are empty → Status: `PUBLISHED`
  - Message: "The announcement has been successfully created."

#### Get All Announcements
```http
GET /announcements?category=goods&status=published&page=1&limit=20
```

#### Get My Announcements
```http
GET /announcements/me
Authorization: Bearer <token>
```

#### Get Announcement by ID
```http
GET /announcements/:id
```

#### Update Announcement
```http
PATCH /announcements/:id
Authorization: Bearer <token>
```

**Rules:**
- **TO_BE_VERIFIED**: All fields editable
- **PUBLISHED**: Only `availability_period.end` editable

#### Close Announcement
```http
POST /announcements/:id/close
Authorization: Bearer <token>
```

**Effects:**
- Status → `CLOSED`
- Pending applications → `CANCELED`
- Approved applications → Read-only
- Notifies all applicants

#### Cancel Announcement
```http
POST /announcements/:id/cancel
Authorization: Bearer <token>
```

**Effects:**
- Status → `CANCELED`
- All applications → `CANCELED`
- Visible only in "My Announcements"

### Applications

#### Apply to Announcement
```http
POST /announcements/:announcementId/applications
Authorization: Bearer <token>
Content-Type: application/json

{
  "quantity": 100,
  "note": "Interested in bulk purchase",
  "contact_info": "+1234567890"
}
```

#### Get Applications for Announcement (Announcer Only)
```http
GET /announcements/:announcementId/applications
Authorization: Bearer <token>
```

#### Approve Application
```http
POST /announcements/:announcementId/applications/:applicationId/approve
Authorization: Bearer <token>
```

#### Reject Application
```http
POST /announcements/:announcementId/applications/:applicationId/reject
Authorization: Bearer <token>
```

#### Get My Applications
```http
GET /applications/me
Authorization: Bearer <token>
```

## Business Rules

### User Preconditions
- User must be **registered** and **verified**
- User must **NOT** be blocked or deactivated
- User type must be **Farmer** or **Company**

### Status Determination
- If `description` OR `photos` exist → `TO_BE_VERIFIED`
- If `description` AND `photos` are empty → `PUBLISHED` (auto-publish)

### Editing Rules
- **TO_BE_VERIFIED**: All fields editable
- **PUBLISHED**: Only `availability_period.end` editable
- **CLOSED/CANCELED**: Cannot be edited

### Closing Rules
- Only **PUBLISHED** announcements can be closed
- Pending applications → `CANCELED`
- Approved applications → Read-only
- Notifies all applicants via FCM

### Canceling Rules
- **TO_BE_VERIFIED** or **PUBLISHED** can be canceled
- All applications → `CANCELED`
- Visible only in "My Announcements"

## Scheduled Tasks

### Expiry Warning (Daily at 9:00 AM)
- Checks announcements expiring in 1 day
- Sends FCM notification to announcer

### Auto-Close Expired (Every Hour)
- Finds expired announcements (end date < today)
- Automatically closes them
- Retries on errors

## Notifications (FCM)

Notifications are sent for:
- ✅ Announcement creation
- ✅ Verification required (TO_BE_VERIFIED)
- ✅ Announcement published
- ✅ Application created
- ✅ Application approved/rejected
- ✅ Announcement closed (manual/auto)
- ✅ Announcement canceled
- ✅ Announcement updated
- ✅ Expiry warning (1 day before)

## Validation Messages

- "Select announcement type (Buy or Sell)."
- "Select a valid group from the list."
- "Select a valid name from the list."
- "Enter valid total amount (> 0)."
- "Select a measurement unit."
- "Enter valid fields for price per unit."
- "Start date cannot be later than end date."
- "Daily limit cannot exceed total amount."
- "Unsupported file format. Please upload JPG, PNG images only."
- "This photo exceeds the maximum allowed size of 5 MB."

## Setup

### 1. Install Dependencies
```bash
npm install @nestjs/schedule firebase-admin
```

### 2. Run Database Migration
```sql
-- Execute: database/migrations_announcements.sql
```

### 3. Configure Environment Variables
```env
# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'

# JWT Configuration (already configured)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=15m
```

### 4. Start the Application
```bash
npm run start:dev
```

## Module Structure

```
src/
├── announcements/
│   ├── dto/
│   │   ├── create-announcement.dto.ts
│   │   └── update-announcement.dto.ts
│   ├── guards/
│   │   ├── announcement-owner.guard.ts
│   │   └── can-create-announcement.guard.ts
│   ├── tasks/
│   │   └── announcement-expiry.task.ts
│   ├── announcements.controller.ts
│   ├── announcements.service.ts
│   └── announcements.module.ts
├── applications/
│   ├── dto/
│   │   └── create-application.dto.ts
│   ├── applications.controller.ts
│   ├── applications.service.ts
│   └── applications.module.ts
├── notifications/
│   ├── fcm.service.ts
│   └── notifications.module.ts
└── entities/
    ├── announcement.entity.ts
    └── application.entity.ts
```

## Testing

All endpoints are documented in Swagger at `/api` when running the application.

## Production Considerations

1. **File Upload**: Implement proper file storage (S3, Cloudinary, etc.) for photos
2. **FCM Tokens**: Store FCM tokens in a separate table linked to users
3. **Rate Limiting**: Add rate limiting for announcement creation
4. **Caching**: Consider caching for frequently accessed announcements
5. **Monitoring**: Add logging and monitoring for scheduled tasks
6. **Error Handling**: Implement retry logic for failed notifications

## License

UNLICENSED

