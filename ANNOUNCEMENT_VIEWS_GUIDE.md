# Announcement Views Tracking System

## Overview

The announcement views system tracks unique views per announcement, ensuring that **one user can only count as one view** per announcement, even if they view it multiple times.

## Database Schema

### `announcement_views` Table
- `id` (UUID, Primary Key)
- `announcement_id` (UUID, Foreign Key → announcements.id)
- `user_id` (UUID, Foreign Key → users.id)
- `viewed_at` (Timestamp)
- **Unique constraint**: `(announcement_id, user_id)` - ensures one user = one view

### `announcements` Table
- `views_count` (Integer, default: 0) - Calculated field that tracks total unique views

## Features

✅ **One User = One View**: Each user can only count as one view per announcement  
✅ **Automatic Count**: `views_count` is automatically updated via database triggers  
✅ **Performance**: Indexed for fast lookups  
✅ **Published Only**: Only published announcements can be viewed  

## API Endpoints

### Record a View

**Endpoint**: `POST /announcements/:id/view`

**Authentication**: Required (JWT)

**Request**:
```bash
POST /announcements/550e8400-e29b-41d4-a716-446655440000/view
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response** (200 OK):
```json
{
  "viewed": true,
  "views_count": 42
}
```

- `viewed: true` - This was a new view (user hadn't viewed before)
- `viewed: false` - User already viewed this announcement (no new view recorded)
- `views_count` - Total number of unique users who viewed this announcement

**Error Responses**:

```json
{
  "statusCode": 400,
  "message": "Only published announcements can be viewed",
  "error": "Bad Request"
}
```

```json
{
  "statusCode": 404,
  "message": "Announcement with ID ... not found",
  "error": "Not Found"
}
```

## Usage Examples

### Frontend Integration

```typescript
// When user views an announcement detail page
async function viewAnnouncement(announcementId: string) {
  try {
    const response = await fetch(`/announcements/${announcementId}/view`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    const data = await response.json();
    
    if (data.viewed) {
      console.log('New view recorded!');
    } else {
      console.log('You already viewed this announcement');
    }
    
    console.log(`Total views: ${data.views_count}`);
  } catch (error) {
    console.error('Error recording view:', error);
  }
}
```

### Get Announcement with View Count

The `views_count` field is automatically included in all announcement responses:

```bash
GET /announcements/550e8400-e29b-41d4-a716-446655440000
```

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "sell",
  "category": "goods",
  "price": 1500.00,
  "views_count": 42,  // ✅ Automatically included
  "status": "published",
  // ... other fields
}
```

## Database Migration

Run the migration to create the views tracking system:

```sql
-- Run this in Supabase SQL Editor
\i database/migrations_announcement_views.sql
```

Or copy and paste the contents of `database/migrations_announcement_views.sql` into the Supabase SQL Editor.

## How It Works

1. **User views announcement**: Frontend calls `POST /announcements/:id/view`
2. **Check existing view**: System checks if user already viewed this announcement
3. **Record view**: If not viewed before, creates a new record in `announcement_views`
4. **Update count**: Database trigger automatically updates `announcements.views_count`
5. **Return result**: API returns whether view was new and current view count

## Database Triggers

The system uses PostgreSQL triggers to automatically maintain `views_count`:

- **On INSERT**: Updates `views_count` when a new view is recorded
- **On DELETE**: Updates `views_count` when a view is deleted (for cleanup)

## Performance Considerations

- **Indexes**: All foreign keys and lookup fields are indexed
- **Unique Constraint**: Prevents duplicate views at the database level
- **Calculated Field**: `views_count` is stored (not calculated on-the-fly) for fast queries

## Best Practices

1. **Call view endpoint when user opens announcement details page**
2. **Don't call multiple times**: One call per page view is sufficient
3. **Handle errors gracefully**: If view recording fails, still show the announcement
4. **Display view count**: Show `views_count` in the UI to indicate popularity

## Example Flow

```
User opens announcement detail page
    ↓
Frontend calls: POST /announcements/:id/view
    ↓
Backend checks: Has this user viewed before?
    ↓
No → Create view record → Update views_count → Return {viewed: true, views_count: 43}
Yes → Return {viewed: false, views_count: 42}
    ↓
Frontend displays announcement with view count
```

## Notes

- Views are only recorded for **published** announcements
- The owner viewing their own announcement **will count as a view**
- Views persist even if announcement status changes (historical data)
- View records are deleted when announcement is deleted (CASCADE)

