# Announcements API Guide

Complete documentation for the Announcements module with catalog integration.

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [Validation Rules](#validation-rules)
5. [Status Flow](#status-flow)
6. [Examples](#examples)

---

## Overview

The Announcements module supports three categories:
- **goods**: Physical products for sale (requires: count, daily_limit, images)
- **rent**: Property/equipment rental (requires: date_from, date_to, images)
- **service**: Service offerings (minimal requirements)

Announcements can have two types:
- **sell**: Offering something for sale or rent
- **buy**: Looking to buy or rent something

### Key Features
- ✅ Catalog integration (group_id → categories, item_id → items)
- ✅ Category-specific conditional validation
- ✅ Location filtering (regions, villages)
- ✅ Auto-close expired rent announcements
- ✅ FCM notifications for status changes
- ✅ RBAC guards (only farmers/companies can create)

---

## Database Schema

### Enums

```sql
-- Type: sell or buy
CREATE TYPE announcement_type_enum AS ENUM ('sell', 'buy');

-- Category: goods, rent, or service
CREATE TYPE announcement_category_enum AS ENUM ('goods', 'rent', 'service');

-- Status: pending → published → closed/canceled/blocked
CREATE TYPE announcement_status_enum AS ENUM ('pending', 'published', 'closed', 'canceled', 'blocked');

-- Unit (optional)
CREATE TYPE unit_enum AS ENUM ('kg', 'ton', 'pcs', 'liter', 'bag', 'm2', 'ha');
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Primary key |
| `type` | enum | Yes | sell or buy |
| `category` | enum | Yes | goods, rent, or service |
| `group_id` | UUID | Yes | FK to catalog_categories |
| `item_id` | UUID | Yes | FK to catalog_items |
| `price` | DECIMAL | Yes | Price in base currency |
| `description` | TEXT | No | Optional description |
| `owner_id` | UUID | Yes | FK to users |
| `status` | enum | Yes | Default: pending |
| `closed_by` | UUID | No | User who closed it |
| **Goods-specific** |
| `count` | DECIMAL | Conditional | Required for goods |
| `daily_limit` | DECIMAL | No | Optional (if provided, must be <= count) |
| `available_quantity` | DECIMAL | Auto | count - approved applications |
| **General** |
| `unit` | enum | No | Optional unit |
| `images` | TEXT[] | No | Optional array of image URLs |
| **Rent-specific** |
| `date_from` | DATE | Conditional | Required for rent |
| `date_to` | DATE | Conditional | Required for rent |
| `min_area` | DECIMAL | No | Optional |
| **Location** |
| `regions` | UUID[] | No | Optional array of region UUIDs |
| `villages` | UUID[] | No | Optional array of village UUIDs |
| `created_at` | TIMESTAMP | Auto | |
| `updated_at` | TIMESTAMP | Auto | |

---

## API Endpoints

### 1. Create Announcement
```http
POST /announcements
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body:**
```json
{
  "type": "sell",
  "category": "goods",
  "group_id": "uuid-of-category",
  "item_id": "uuid-of-item",
  "price": 1500.00,
  "description": "High quality wheat",
  "count": 1000,
  "daily_limit": 100,
  "unit": "kg",
  "images": ["https://example.com/image1.jpg", "https://example.com/image2.jpg"],
  "regions": ["region-uuid-1", "region-uuid-2"],
  "villages": ["village-uuid-1"]
}
```

**Response (201):**
```json
{
  "message": "Your Announcement was successfully submitted for verification",
  "announcement": {
    "id": "announcement-uuid",
    "type": "sell",
    "category": "goods",
    "status": "pending",
    ...
  }
}
```

### 2. Get All Announcements (with filters)
```http
GET /announcements?category=goods&type=sell&region=uuid&page=1&limit=20
```

**Query Parameters:**
- `category`: goods | rent | service
- `type`: sell | buy
- `status`: pending | published | closed | canceled | blocked
- `region`: UUID (filters by region)
- `page`: number (default: 1)
- `limit`: number (default: 20)

**Response (200):**
```json
{
  "announcements": [...],
  "total": 150
}
```

### 3. Get My Announcements
```http
GET /announcements/me
Authorization: Bearer {token}
```

**Response (200):**
```json
[
  {
    "id": "uuid",
    "type": "sell",
    "category": "goods",
    "status": "published",
    "owner": { ... },
    "group": { ... },
    "item": { ... },
    ...
  }
]
```

### 4. Get Announcement by ID
```http
GET /announcements/:id
```

**Response (200):**
```json
{
  "id": "uuid",
  "type": "sell",
  "category": "goods",
  "group_id": "uuid",
  "item_id": "uuid",
  "price": 1500.00,
  "status": "published",
  "owner": {
    "id": "uuid",
    "full_name": "John Doe",
    "phone_number": "+37412345678"
  },
  "group": {
    "id": "uuid",
    "name_en": "Grains",
    "name_am": "Հացահատիկ"
  },
  "item": {
    "id": "uuid",
    "name_en": "Wheat",
    "name_am": "Ցորեն",
    "measurements": [...]
  },
  ...
}
```

### 5. Update Announcement
```http
PATCH /announcements/:id
Authorization: Bearer {token}
Content-Type: application/json
```

**Note:** Only pending announcements can be updated. Published announcements cannot be edited.

**Request Body:**
```json
{
  "price": 1600.00,
  "description": "Updated description",
  "count": 1200,
  "daily_limit": 120
}
```

**Response (200):**
```json
{
  "id": "uuid",
  ...
}
```

### 6. Publish Announcement (Admin Only)
```http
POST /announcements/:id/publish
Authorization: Bearer {admin-token}
```

**Response (200):**
```json
{
  "id": "uuid",
  "status": "published",
  ...
}
```

### 7. Block Announcement (Admin Only)
```http
POST /announcements/:id/block
Authorization: Bearer {admin-token}
```

**Response (200):**
```json
{
  "id": "uuid",
  "status": "blocked",
  "closed_by": "admin-uuid",
  ...
}
```

### 8. Close Announcement (Owner or Admin)
```http
POST /announcements/:id/close
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "message": "Announcement closed successfully",
  "announcement": {
    "id": "uuid",
    "status": "closed",
    "closed_by": "user-uuid",
    ...
  }
}
```

### 9. Cancel Announcement (Owner Only)
```http
POST /announcements/:id/cancel
Authorization: Bearer {token}
```

**Response (200):**
```json
{
  "message": "Announcement canceled successfully",
  "announcement": {
    "id": "uuid",
    "status": "canceled",
    ...
  }
}
```

### 10. Delete Announcement (Owner Only)
```http
DELETE /announcements/:id
Authorization: Bearer {token}
```

**Note:** Soft delete (sets status to canceled). Only non-published announcements can be deleted.

**Response (204):** No content

---

## Validation Rules

### All Categories
✅ `type` must be either "sell" or "buy"  
✅ `category` must be "goods", "rent", or "service"  
✅ `group_id` must exist in catalog_categories  
✅ `item_id` must exist in catalog_items  
✅ `price` must be >= 0  

### Category: goods
✅ `count` is **required** and must be > 0  
⚪ `daily_limit` is **optional** (if provided, must be > 0 and <= `count`)  
⚪ `images` is **optional**  

### Category: rent
✅ `date_from` is **required**  
✅ `date_to` is **required**  
✅ `date_from` must be before `date_to`  
⚪ `images` is **optional**  

### Category: service
✅ No special requirements (most flexible)  

### Optional for All
⚪ `regions` - array of region UUIDs (optional)  
⚪ `villages` - array of village UUIDs (optional)  
⚪ `images` - array of image URLs (optional)  
⚪ `daily_limit` - max daily sales/rentals (optional)  

---

## Status Flow

```
┌─────────┐
│ pending │ ──(admin publish)──> ┌───────────┐
└─────────┘                      │ published │
     │                           └───────────┘
     │                                  │
     │                                  │
     │ (owner cancel)                   │ (owner/admin close)
     │                                  │ (owner cancel)
     │                                  │ (admin block)
     ▼                                  ▼
┌──────────┐                     ┌────────┐
│ canceled │                     │ closed │
└──────────┘                     └────────┘
                                      │
                                      │ (admin block)
                                      ▼
                                ┌─────────┐
                                │ blocked │
                                └─────────┘
```

### Status Transitions
- **pending → published**: Admin approves
- **pending → canceled**: Owner cancels before approval
- **published → closed**: Owner or admin closes (normal completion)
- **published → canceled**: Owner cancels after publishing
- **published/closed → blocked**: Admin blocks (policy violation)

---

## Examples

### Example 1: Create Goods Announcement
```typescript
const response = await fetch('/announcements', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'sell',
    category: 'goods',
    group_id: 'wheat-category-uuid',
    item_id: 'wheat-item-uuid',
    price: 250.00,
    description: 'Fresh wheat harvest 2026',
    count: 5000,
    daily_limit: 500,
    unit: 'kg',
    images: [
      'https://storage.example.com/wheat1.jpg',
      'https://storage.example.com/wheat2.jpg'
    ],
    regions: ['yerevan-region-uuid'],
    villages: ['avan-village-uuid']
  })
});
```

### Example 2: Create Rent Announcement
```typescript
const response = await fetch('/announcements', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'rent',
    category: 'rent',
    group_id: 'equipment-category-uuid',
    item_id: 'tractor-item-uuid',
    price: 50000.00,
    description: 'John Deere tractor for rent',
    date_from: '2026-03-01',
    date_to: '2026-06-30',
    min_area: 10.5,
    images: [
      'https://storage.example.com/tractor1.jpg'
    ],
    regions: ['ararat-region-uuid']
  })
});
```

### Example 3: Create Service Announcement
```typescript
const response = await fetch('/announcements', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    type: 'sell',
    category: 'service',
    group_id: 'services-category-uuid',
    item_id: 'plowing-service-uuid',
    price: 15000.00,
    description: 'Professional agricultural plowing service',
    regions: ['armavir-region-uuid', 'ararat-region-uuid']
    // Note: no images, count, daily_limit, or dates required for services
  })
});
```

### Example 4: Filter Announcements by Region and Category
```typescript
const response = await fetch(
  '/announcements?category=goods&region=yerevan-uuid&page=1&limit=20',
  {
    headers: {
      'Content-Type': 'application/json',
    }
  }
);

const { announcements, total } = await response.json();
```

---

## Notes

### Auto-Close for Rent
- Rent announcements are automatically closed at midnight when `date_to` has passed
- A scheduled task runs daily at 00:00 to check for expired rentals
- Owners receive FCM notifications when their rentals are auto-closed

### FCM Notifications
Users receive notifications when:
- Announcement is published (approved by admin)
- Announcement is blocked by admin
- Rent announcement is auto-closed (date_to passed)

### RBAC
- Only **farmers** and **companies** can create announcements
- Users must be **verified** (account_status = 'active', verified = true)
- Users cannot create announcements if **blocked** or **locked**

### Image Upload
Images should be uploaded to storage (e.g., Supabase Storage) first, then the URLs should be included in the announcement creation request.

---

## Error Codes

| Status | Description |
|--------|-------------|
| 400 | Validation error (missing required fields, invalid data) |
| 401 | Unauthorized (no token or invalid token) |
| 403 | Forbidden (not owner, not verified, wrong user type) |
| 404 | Not found (announcement, category, or item not found) |
| 500 | Internal server error |

---

## Migration

Run the SQL migration:
```bash
# Execute in Supabase SQL Editor
cat database/migrations_announcements.sql | psql $DATABASE_URL
```

Or use your preferred migration tool.

---

## Support

For issues or questions, contact the development team or create an issue in the repository.

