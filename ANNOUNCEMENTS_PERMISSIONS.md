# Announcements Permissions & Access Control

Complete guide to the announcement permission system ensuring only owners and admins can mutate announcements.

---

## Overview

The announcements module implements **Role-Based Access Control (RBAC)** with three levels of access:
1. **Public** - Anyone (no authentication required)
2. **Owner** - User who created the announcement
3. **Admin** - System administrators

---

## Guards

### 1. `JwtAuthGuard`
**Location**: `src/auth/guards/jwt-auth.guard.ts`

**Purpose**: Ensures user is authenticated

**Used On**: All protected endpoints

### 2. `CanCreateAnnouncementGuard`
**Location**: `src/announcements/guards/can-create-announcement.guard.ts`

**Purpose**: Checks if user can create announcements

**Requirements**:
- User must be verified (`verified: true`)
- Account must be active (not blocked/locked)
- User type must be `FARMER` or `COMPANY`

**Used On**:
- `POST /announcements` (create)

### 3. `AnnouncementOwnerGuard`
**Location**: `src/announcements/guards/announcement-owner.guard.ts`

**Purpose**: Ensures only the announcement owner can access

**Logic**:
```typescript
if (announcement.owner_id !== userId) {
  throw ForbiddenException('You can only access your own announcements');
}
```

**Used On**:
- `POST /announcements/:id/cancel` (owner only)
- `DELETE /announcements/:id` (owner only)

### 4. `AnnouncementOwnerOrAdminGuard` ✨ NEW
**Location**: `src/announcements/guards/announcement-owner-or-admin.guard.ts`

**Purpose**: Allows both owners AND admins to access

**Logic**:
```typescript
// Admins can access all announcements
if (user.user_type === UserType.ADMIN) {
  return true;
}

// Regular users can only access their own
if (announcement.owner_id !== user.id) {
  throw ForbiddenException('You can only access your own announcements');
}
```

**Used On**:
- `PATCH /announcements/:id` (update)
- `POST /announcements/:id/close` (close)

### 5. `IsAdminGuard` ✨ NEW
**Location**: `src/announcements/guards/is-admin.guard.ts`

**Purpose**: Ensures only admins can access

**Logic**:
```typescript
if (user.user_type !== UserType.ADMIN) {
  throw ForbiddenException('Only admins can perform this action');
}
```

**Used On**:
- `POST /announcements/:id/publish` (admin only)
- `POST /announcements/:id/block` (admin only)

---

## Endpoint Permissions Matrix

| Endpoint | Method | Guards | Who Can Access |
|----------|--------|--------|----------------|
| `/announcements` | POST | `JwtAuthGuard` + `CanCreateAnnouncementGuard` | ✅ Verified Farmers/Companies |
| `/announcements` | GET | None | ✅ Everyone (public) |
| `/announcements/me` | GET | `JwtAuthGuard` | ✅ Authenticated users (own announcements) |
| `/announcements/:id` | GET | None | ✅ Everyone (public) |
| `/announcements/:id` | PATCH | `JwtAuthGuard` + `AnnouncementOwnerOrAdminGuard` | ✅ Owner OR Admin |
| `/announcements/:id` | DELETE | `JwtAuthGuard` + `AnnouncementOwnerGuard` | ✅ Owner only |
| `/announcements/:id/publish` | POST | `JwtAuthGuard` + `IsAdminGuard` | ✅ Admin only |
| `/announcements/:id/block` | POST | `JwtAuthGuard` + `IsAdminGuard` | ✅ Admin only |
| `/announcements/:id/close` | POST | `JwtAuthGuard` + `AnnouncementOwnerOrAdminGuard` | ✅ Owner OR Admin |
| `/announcements/:id/cancel` | POST | `JwtAuthGuard` + `AnnouncementOwnerGuard` | ✅ Owner only |

---

## Permission Rules by Action

### 📝 CREATE Announcement
**Who**: Farmers and Companies (verified only)

**Requirements**:
- ✅ User type: `FARMER` or `COMPANY`
- ✅ Account verified: `verified = true`
- ✅ Account active: `is_locked = false`, `account_status = 'active'`

**Guard**: `CanCreateAnnouncementGuard`

**Example**:
```typescript
// ✅ Can create
user = { user_type: 'farmer', verified: true, is_locked: false }

// ❌ Cannot create
user = { user_type: 'farmer', verified: false, is_locked: false }  // Not verified
user = { user_type: 'admin', verified: true, is_locked: false }    // Wrong type
```

---

### ✏️ UPDATE Announcement
**Who**: Owner OR Admin

**Owner Rules**:
- ✅ Can update own announcements
- ✅ Only if status is `pending` (not published yet)
- ❌ Cannot update after published

**Admin Rules**:
- ✅ Can update ANY announcement
- ✅ Can update even if published

**Guard**: `AnnouncementOwnerOrAdminGuard`

**Service Logic**:
```typescript
// Admins can update any announcement (including published)
const isAdmin = userType === UserType.ADMIN;

if (!isAdmin && announcement.owner_id !== userId) {
  throw ForbiddenException('You can only update your own announcements');
}

if (!isAdmin && announcement.status === AnnouncementStatus.PUBLISHED) {
  throw ForbiddenException('Cannot update published announcements');
}
```

**Example**:
```typescript
// ✅ Owner can update pending
announcement = { owner_id: 'user-123', status: 'pending' }
user = { id: 'user-123', user_type: 'farmer' }

// ❌ Owner cannot update published
announcement = { owner_id: 'user-123', status: 'published' }
user = { id: 'user-123', user_type: 'farmer' }

// ✅ Admin can update published
announcement = { owner_id: 'user-123', status: 'published' }
user = { id: 'admin-456', user_type: 'admin' }
```

---

### 🚀 PUBLISH Announcement
**Who**: Admin only

**Rules**:
- ✅ Only pending announcements can be published
- ✅ Sends FCM notification to owner

**Guard**: `IsAdminGuard`

**Service Logic**:
```typescript
if (announcement.status !== AnnouncementStatus.PENDING) {
  throw BadRequestException('Only pending announcements can be published');
}

announcement.status = AnnouncementStatus.PUBLISHED;
// Send notification to owner
```

---

### 🚫 BLOCK Announcement
**Who**: Admin only

**Rules**:
- ✅ Can block any announcement (any status)
- ✅ Sets `closed_by = adminId`
- ✅ Sends FCM notification to owner

**Guard**: `IsAdminGuard`

**Example Use Cases**:
- Spam content
- Policy violations
- Fraudulent listings

---

### 🔒 CLOSE Announcement
**Who**: Owner OR Admin

**Rules**:
- ✅ Owner can close own announcements
- ✅ Admin can close any announcement
- ✅ Sets `closed_by = userId`
- ❌ Cannot close if already closed

**Guard**: `AnnouncementOwnerOrAdminGuard`

**Example Use Cases**:
- Owner sold out of goods
- Owner completed service
- Admin manually closing expired announcements

---

### ❌ CANCEL Announcement
**Who**: Owner only

**Rules**:
- ✅ Can cancel own pending or published announcements
- ❌ Cannot cancel if already closed/canceled/blocked
- ✅ If was published, may notify applicants

**Guard**: `AnnouncementOwnerGuard`

**Service Logic**:
```typescript
if (announcement.owner_id !== userId) {
  throw ForbiddenException('You can only cancel your own announcements');
}

const wasPublished = announcement.status === AnnouncementStatus.PUBLISHED;

if (!wasPublished && announcement.status !== AnnouncementStatus.PENDING) {
  throw BadRequestException('Only pending or published announcements can be canceled');
}

announcement.status = AnnouncementStatus.CANCELED;
```

---

### 🗑️ DELETE Announcement
**Who**: Owner only

**Rules**:
- ✅ Soft delete (sets status to `canceled`)
- ✅ Can only delete non-published announcements
- ❌ Cannot delete published announcements (must cancel first)

**Guard**: `AnnouncementOwnerGuard`

**Service Logic**:
```typescript
if (announcement.owner_id !== userId) {
  throw ForbiddenException('You can only delete your own announcements');
}

if (announcement.status === AnnouncementStatus.PUBLISHED) {
  throw ForbiddenException('Cannot delete published announcements. Please cancel it first.');
}

announcement.status = AnnouncementStatus.CANCELED;
```

---

## Status Flow with Permissions

```
┌─────────┐
│ pending │ ← Created by OWNER
└────┬────┘
     │
     ├─(ADMIN publish)──────> ┌───────────┐
     │                        │ published │
     │                        └─────┬─────┘
     │                              │
     │ (OWNER cancel)               │ (OWNER/ADMIN close)
     │                              │ (OWNER cancel)
     │                              │ (ADMIN block)
     ▼                              ▼
┌──────────┐                  ┌────────┐
│ canceled │                  │ closed │
└──────────┘                  └────────┘
                                   │
                                   │ (ADMIN block)
                                   ▼
                              ┌─────────┐
                              │ blocked │
                              └─────────┘
```

---

## Testing Permissions

### Test 1: Owner Can Update Pending
```bash
# As owner
curl -X PATCH /announcements/:id \
  -H "Authorization: Bearer {owner-token}" \
  -d '{"price": 2000}'

# Expected: 200 OK
```

### Test 2: Owner Cannot Update Published
```bash
# As owner (announcement is published)
curl -X PATCH /announcements/:id \
  -H "Authorization: Bearer {owner-token}" \
  -d '{"price": 2000}'

# Expected: 403 Forbidden - "Cannot update published announcements"
```

### Test 3: Admin Can Update Published
```bash
# As admin (announcement is published)
curl -X PATCH /announcements/:id \
  -H "Authorization: Bearer {admin-token}" \
  -d '{"price": 2000}'

# Expected: 200 OK
```

### Test 4: Non-Owner Cannot Update
```bash
# As different user
curl -X PATCH /announcements/:id \
  -H "Authorization: Bearer {other-user-token}" \
  -d '{"price": 2000}'

# Expected: 403 Forbidden - "You can only access your own announcements"
```

### Test 5: Only Admin Can Publish
```bash
# As owner
curl -X POST /announcements/:id/publish \
  -H "Authorization: Bearer {owner-token}"

# Expected: 403 Forbidden - "Only admins can perform this action"

# As admin
curl -X POST /announcements/:id/publish \
  -H "Authorization: Bearer {admin-token}"

# Expected: 200 OK
```

### Test 6: Only Admin Can Block
```bash
# As owner
curl -X POST /announcements/:id/block \
  -H "Authorization: Bearer {owner-token}"

# Expected: 403 Forbidden - "Only admins can perform this action"

# As admin
curl -X POST /announcements/:id/block \
  -H "Authorization: Bearer {admin-token}"

# Expected: 200 OK
```

### Test 7: Owner and Admin Can Close
```bash
# As owner
curl -X POST /announcements/:id/close \
  -H "Authorization: Bearer {owner-token}"

# Expected: 200 OK

# As admin (different announcement)
curl -X POST /announcements/:id2/close \
  -H "Authorization: Bearer {admin-token}"

# Expected: 200 OK
```

### Test 8: Only Owner Can Cancel
```bash
# As owner
curl -X POST /announcements/:id/cancel \
  -H "Authorization: Bearer {owner-token}"

# Expected: 200 OK

# As admin (different user's announcement)
curl -X POST /announcements/:id/cancel \
  -H "Authorization: Bearer {admin-token}"

# Expected: 403 Forbidden - "You can only access your own announcements"
```

---

## Security Best Practices

### ✅ Implemented

1. **Authentication Required** - All mutation endpoints require `JwtAuthGuard`
2. **Ownership Validation** - Guards check `owner_id` matches authenticated user
3. **Role-Based Access** - Admin role has elevated permissions
4. **Status Restrictions** - Owners cannot modify published announcements
5. **Audit Trail** - `closed_by` field tracks who closed announcements

### 🔒 Recommendations

1. **Logging** - Log all admin actions for audit trail
2. **Rate Limiting** - Prevent abuse of create/update endpoints
3. **Input Validation** - DTOs validate all input data
4. **SQL Injection Protection** - TypeORM parameterizes queries
5. **XSS Protection** - Sanitize description and other text fields

---

## Summary

✅ **Only owners and admins can mutate announcements**

| Action | Owner | Admin | Others |
|--------|-------|-------|--------|
| Create | ✅ (if verified) | ✅ | ❌ |
| Read (public) | ✅ | ✅ | ✅ |
| Update | ✅ (if pending) | ✅ (all) | ❌ |
| Publish | ❌ | ✅ | ❌ |
| Block | ❌ | ✅ | ❌ |
| Close | ✅ | ✅ | ❌ |
| Cancel | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ |

**Guards Ensure**:
- ✅ Authentication via JWT
- ✅ Authorization via ownership check
- ✅ Role-based admin privileges
- ✅ Status-based restrictions

All permissions are enforced at both the **controller level** (guards) and **service level** (business logic).

