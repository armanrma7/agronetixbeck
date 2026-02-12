# Applications Module Update Guide

## Overview

Updated the existing Applications module to include:
- **delivery_date** field (required, cannot be in the past)
- **Status enum** updated to include `closed` (replacing `canceled` for new records)
- **Soft delete** support with `deleted_at` column
- **Status transition validation** with strict business rules
- **Enhanced indexes** for performance

## Database Migration

### Migration File: `database/migrations_update_applications.sql`

**Changes:**
1. ✅ Added `delivery_date` column (DATE, required)
2. ✅ Added constraint: `delivery_date >= CURRENT_DATE` (cannot be in the past)
3. ✅ Added `deleted_at` column (TIMESTAMP, nullable) for soft delete
4. ✅ Updated enum: Added `closed` value to `application_status_enum`
5. ✅ Added indexes:
   - `idx_applications_delivery_date` - For date-based queries
   - `idx_applications_deleted_at` - For soft delete queries
   - `idx_applications_status_delivery_date` - Composite index
   - `idx_applications_status_active` - Status index excluding soft-deleted
   - `idx_applications_applicant_id_active` - Applicant index excluding soft-deleted

**Note:** The `canceled` status remains in the enum for legacy support, but new records should use `closed`.

### Running the Migration

```bash
# Copy the SQL from database/migrations_update_applications.sql
# and run it in your Supabase SQL Editor
```

## Entity Updates

### File: `src/entities/application.entity.ts`

**Changes:**
- ✅ Added `delivery_date: Date` field with `@Index()` decorator
- ✅ Added `CLOSED = 'closed'` to `ApplicationStatus` enum
- ✅ Added `deleted_at: Date | null` with `@DeleteDateColumn()` decorator
- ✅ Updated timestamp columns to use `timestamp with time zone`

## DTO Updates

### File: `src/applications/dto/create-application.dto.ts`

**Changes:**
- ✅ Added `delivery_date: string` field (required)
- ✅ Added validation: `@IsDateString()` and `@IsNotEmpty()`
- ✅ Updated Swagger documentation

**Example Request:**
```json
{
  "quantity": 100,
  "delivery_date": "2026-02-15",
  "note": "Please deliver in the morning",
  "contact_info": "+1234567890"
}
```

## Service Updates

### File: `src/applications/applications.service.ts`

**New Methods:**

1. **`validateDeliveryDate(deliveryDate: string | Date)`**
   - Validates that delivery_date is not in the past
   - Throws `BadRequestException` if date is invalid

2. **`validateStatusTransition(currentStatus, newStatus)`**
   - Enforces status transition rules:
     - `pending` → `approved` | `rejected` | `closed` ✅
     - `approved` → `closed` ✅
     - `rejected` → `pending` ✅ (optional, allowed)
     - `closed` → ❌ No transitions allowed (final state)
   - Throws `BadRequestException` for invalid transitions

3. **`updateStatus(announcementId, applicationId, newStatus, userId)`**
   - Generic method to update status with validation
   - Validates ownership and status transitions

4. **`close(announcementId, applicationId, userId)`**
   - Convenience method to close an application
   - Calls `updateStatus` with `CLOSED` status

**Updated Methods:**

- ✅ `create()` - Now validates and saves `delivery_date`
- ✅ `findByAnnouncement()` - Excludes soft-deleted records
- ✅ `findMyApplications()` - Excludes soft-deleted records
- ✅ `approve()` - Uses status transition validation
- ✅ `reject()` - Uses status transition validation

## Controller Updates

### File: `src/applications/applications.controller.ts`

**New Endpoint:**

```
POST /announcements/:announcementId/applications/:applicationId/close
```

- Closes an application (sets status to `closed`)
- Requires authentication and ownership
- Returns updated application

## Status Transition Rules

| Current Status | Allowed Transitions | Notes |
|----------------|-------------------|-------|
| `pending` | `approved`, `rejected`, `closed` | Initial state |
| `approved` | `closed` | Only transition allowed |
| `rejected` | `pending` | Optional, allows re-application |
| `closed` | ❌ None | Final state, no changes allowed |
| `canceled` (legacy) | `closed` | Legacy support |

## Validation Rules

### Delivery Date
- **Required** for creation
- **Format:** `YYYY-MM-DD` (e.g., `2026-02-15`)
- **Cannot be in the past** - validated server-side
- Throws `BadRequestException` if date is in the past

### Status Transitions
- **Validated server-side** before any status change
- Throws `BadRequestException` with descriptive error message for invalid transitions

## Soft Delete

- Applications are **not physically deleted**
- `deleted_at` column is set to current timestamp
- All queries automatically exclude soft-deleted records (via TypeORM `withDeleted: false`)
- To restore, set `deleted_at = NULL` manually in database

## API Examples

### Create Application with Delivery Date

```typescript
POST /announcements/:announcementId/applications
{
  "quantity": 100,
  "delivery_date": "2026-02-15",
  "note": "Please deliver in the morning"
}
```

### Close Application

```typescript
POST /announcements/:announcementId/applications/:applicationId/close
```

### Update Status (via service method)

```typescript
// In service
await applicationsService.updateStatus(
  announcementId,
  applicationId,
  ApplicationStatus.CLOSED,
  userId
);
```

## Breaking Changes

⚠️ **Important:** Existing applications without `delivery_date` will need to be updated:

```sql
-- Set a default delivery_date for existing records
UPDATE applications 
SET delivery_date = created_at + INTERVAL '7 days'
WHERE delivery_date IS NULL;
```

## Migration Checklist

- [ ] Run `database/migrations_update_applications.sql` in Supabase SQL Editor
- [ ] Update existing applications to set `delivery_date` (if needed)
- [ ] Test creating new applications with `delivery_date`
- [ ] Test status transitions (pending → approved → closed)
- [ ] Test soft delete functionality
- [ ] Verify indexes are created correctly
- [ ] Update frontend to include `delivery_date` in forms

## Files Modified

1. ✅ `database/migrations_update_applications.sql` - New migration file
2. ✅ `src/entities/application.entity.ts` - Added fields and enum
3. ✅ `src/applications/dto/create-application.dto.ts` - Added delivery_date
4. ✅ `src/applications/applications.service.ts` - Added validation and status transitions
5. ✅ `src/applications/applications.controller.ts` - Added close endpoint

## Notes

- **Legacy Support:** The `canceled` status remains in the enum for backward compatibility
- **Soft Delete:** TypeORM automatically handles soft delete exclusion in queries
- **Indexes:** New indexes improve query performance, especially for date-based filtering
- **Validation:** All validation is server-side for security and data integrity
