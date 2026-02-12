# Announcements Optional Fields Update

Summary of changes making `daily_limit`, `images`, and `regions` optional.

---

## Changes Made

### 1. **Database Schema** (`migrations_announcements.sql`)

#### Before:
```sql
-- daily_limit was required for goods
daily_limit DECIMAL(10, 2) CHECK (
    (category = 'goods' AND daily_limit IS NOT NULL AND daily_limit > 0 AND daily_limit <= count)
    OR (category != 'goods' AND daily_limit IS NULL)
),

-- images were required for goods and rent
images TEXT[] DEFAULT '{}' CHECK (
    (category IN ('goods', 'rent') AND array_length(images, 1) > 0)
    OR (category = 'service')
),

-- regions were required (at least one)
regions UUID[] DEFAULT '{}' CHECK (array_length(regions, 1) > 0),
```

#### After:
```sql
-- daily_limit is now optional
daily_limit DECIMAL(10, 2) CHECK (
    daily_limit IS NULL OR (daily_limit > 0 AND (count IS NULL OR daily_limit <= count))
),

-- images are now optional
images TEXT[] DEFAULT '{}',

-- regions are now optional
regions UUID[] DEFAULT '{}',
```

---

### 2. **DTOs** (Create & Update)

#### `create-announcement.dto.ts`

**daily_limit**:
- ❌ Was: Required for goods via `@ValidateIf`
- ✅ Now: Optional for all categories via `@IsOptional()`

**images**:
- ❌ Was: Required for goods/rent via `@ValidateIf` + `@ArrayMinSize(1)`
- ✅ Now: Optional for all categories via `@IsOptional()`

**regions**:
- ❌ Was: Required with `@ArrayMinSize(1)`
- ✅ Now: Optional via `@IsOptional()`

#### `update-announcement.dto.ts`

**images**:
- ❌ Was: `@ArrayMinSize(1)` if provided
- ✅ Now: No minimum size constraint

**regions**:
- ❌ Was: `@ArrayMinSize(1)` if provided
- ✅ Now: No minimum size constraint

---

### 3. **Service Logic** (`announcements.service.ts`)

#### Before:
```typescript
if (dto.category === AnnouncementCategory.GOODS) {
  if (!dto.count || dto.count <= 0) {
    throw new BadRequestException('count is required and must be > 0 for goods category');
  }
  if (!dto.daily_limit || dto.daily_limit <= 0) {
    throw new BadRequestException('daily_limit is required and must be > 0 for goods category');
  }
  if (dto.daily_limit > dto.count) {
    throw new BadRequestException('daily_limit cannot exceed count');
  }
  if (!dto.images || dto.images.length === 0) {
    throw new BadRequestException('At least one image is required for goods category');
  }
}

if (dto.category === AnnouncementCategory.RENT) {
  if (!dto.images || dto.images.length === 0) {
    throw new BadRequestException('At least one image is required for rent category');
  }
}
```

#### After:
```typescript
if (dto.category === AnnouncementCategory.GOODS) {
  if (!dto.count || dto.count <= 0) {
    throw new BadRequestException('count is required and must be > 0 for goods category');
  }
  // daily_limit is optional, but if provided, must be valid
  if (dto.daily_limit && dto.daily_limit > dto.count) {
    throw new BadRequestException('daily_limit cannot exceed count');
  }
}

// No image validation needed anymore
```

---

## New Validation Rules

### ✅ Required Fields

**For ALL announcements:**
- `type` (sell or buy)
- `category` (goods, rent, or service)
- `group_id` (FK to catalog_categories)
- `item_id` (FK to catalog_items)
- `price` (>= 0)

**For goods category:**
- `count` (> 0 and <= 999999)

**For rent category:**
- `date_from` (valid date)
- `date_to` (valid date, must be after date_from)

### ⚪ Optional Fields

**For ALL announcements:**
- `description`
- `images` (array of URLs)
- `regions` (array of region UUIDs)
- `villages` (array of village UUIDs)
- `unit` (kg, ton, pcs, etc.)
- `min_area` (for rent)

**For goods category:**
- `daily_limit` (if provided, must be > 0 and <= count)

---

## Example Requests

### Example 1: Minimal Goods Announcement
```json
{
  "type": "sell",
  "category": "goods",
  "group_id": "category-uuid",
  "item_id": "item-uuid",
  "price": 1500,
  "count": 1000
}
```
✅ Valid - No daily_limit, images, or regions required

### Example 2: Goods with Daily Limit
```json
{
  "type": "sell",
  "category": "goods",
  "group_id": "category-uuid",
  "item_id": "item-uuid",
  "price": 1500,
  "count": 1000,
  "daily_limit": 100
}
```
✅ Valid - daily_limit must be <= count

### Example 3: Goods with Invalid Daily Limit
```json
{
  "type": "sell",
  "category": "goods",
  "group_id": "category-uuid",
  "item_id": "item-uuid",
  "price": 1500,
  "count": 1000,
  "daily_limit": 1500
}
```
❌ Invalid - daily_limit (1500) > count (1000)

### Example 4: Minimal Rent Announcement
```json
{
  "type": "rent",
  "category": "rent",
  "group_id": "category-uuid",
  "item_id": "item-uuid",
  "price": 50000,
  "date_from": "2026-03-01",
  "date_to": "2026-06-30"
}
```
✅ Valid - No images or regions required

### Example 5: Service Announcement
```json
{
  "type": "sell",
  "category": "service",
  "group_id": "category-uuid",
  "item_id": "item-uuid",
  "price": 15000
}
```
✅ Valid - Most flexible, minimal requirements

### Example 6: With Optional Fields
```json
{
  "type": "sell",
  "category": "goods",
  "group_id": "category-uuid",
  "item_id": "item-uuid",
  "price": 1500,
  "count": 1000,
  "daily_limit": 100,
  "unit": "kg",
  "description": "Fresh wheat harvest 2026",
  "images": ["url1.jpg", "url2.jpg"],
  "regions": ["region-uuid-1", "region-uuid-2"],
  "villages": ["village-uuid-1"]
}
```
✅ Valid - All optional fields provided

---

## Migration Impact

### Breaking Changes
❌ None - Making fields optional is backward compatible

### Non-Breaking Changes
✅ Existing announcements with these fields will continue to work  
✅ New announcements can omit these fields  
✅ Database CHECK constraints are relaxed, not tightened  

---

## Status Determination

The initial status logic remains unchanged:

```typescript
// If description OR images exist, needs verification
if (description || (images && images.length > 0)) {
  return AnnouncementStatus.PENDING;
}
// Auto-publish if no description or images
return AnnouncementStatus.PUBLISHED;
```

**Examples:**
- No description, no images → `published` (auto-approved)
- With description → `pending` (needs admin approval)
- With images → `pending` (needs admin approval)
- With both → `pending` (needs admin approval)

---

## Testing Checklist

### ✅ Goods Category
- [ ] Create with only `count` (no daily_limit, images, regions)
- [ ] Create with `daily_limit` <= `count`
- [ ] Fail to create with `daily_limit` > `count`
- [ ] Create with images (should be pending)
- [ ] Create without images (should be published)

### ✅ Rent Category
- [ ] Create with only required dates (no images, regions)
- [ ] Create with images (should be pending)
- [ ] Create without images (should be published)
- [ ] Fail to create with `date_from` >= `date_to`

### ✅ Service Category
- [ ] Create with minimal fields (no images, regions, dates)
- [ ] Create with optional description (should be pending)

### ✅ Regions & Villages
- [ ] Create without regions
- [ ] Create without villages
- [ ] Create with empty arrays
- [ ] Filter by region (should work even if announcement has no regions)

---

## Summary

### What Changed
1. ✅ `daily_limit` - Now optional for goods (was required)
2. ✅ `images` - Now optional for all categories (was required for goods/rent)
3. ✅ `regions` - Now optional (was required - at least one)

### What Stayed the Same
1. ✅ `count` - Still required for goods
2. ✅ `date_from` and `date_to` - Still required for rent
3. ✅ Validation logic for provided optional fields
4. ✅ Status determination (description or images → pending)

### Benefits
- 🎯 **More flexible** - Users can create announcements faster
- 🚀 **Better UX** - Fewer required fields = less friction
- 📦 **Backward compatible** - Existing data still valid
- ✨ **Cleaner API** - Simpler validation rules

---

## Migration Steps

No data migration needed! Just update the code and run the updated SQL migration.

1. **Update database**:
   ```sql
   -- Run migrations_announcements.sql
   -- It will drop and recreate triggers (safe)
   ```

2. **Restart application**:
   ```bash
   npm run build
   npm run start:prod
   ```

3. **Test**:
   - Create announcements without optional fields
   - Verify existing announcements still work
   - Test validation for provided optional fields

All TypeScript compiles successfully! ✅

