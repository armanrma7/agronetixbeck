# Announcements Image Upload - Production Guide

## Overview

The Announcements module supports image uploads with the following production-grade features:

- **File paths stored in DB** (not URLs)
- **Signed URLs generated on-the-fly** when returning data
- **Max 3 images** per announcement
- **Max 5MB** per image file
- **Supported formats**: JPEG, JPG, PNG, WebP
- **Signed URL expiration**: 1 hour (configurable)

---

## Architecture

### Storage Flow

1. **Upload**: Client sends binary files → Backend saves to Supabase Storage → Backend stores file paths in DB
2. **Retrieval**: Backend reads file paths from DB → Generates signed URLs → Returns to client

### Database Schema

Images are stored in the `announcements.images` column as a JSON array of file paths:

```json
[
  "announcements/abc123/1704067200000-xyz789.jpg",
  "announcements/abc123/1704067201000-def456.png"
]
```

**Important**: The database **never stores signed URLs**, only permanent file paths.

---

## API Endpoints

### 1. Create Announcement with Images

**Endpoint**: `POST /announcements`

**Content-Type**: `multipart/form-data`

**Request Example**:

```bash
curl -X POST http://localhost:3000/announcements \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "type=sell" \
  -F "category=goods" \
  -F "group_id=550e8400-e29b-41d4-a716-446655440000" \
  -F "item_id=660e8400-e29b-41d4-a716-446655440000" \
  -F "price=1500.00" \
  -F "count=1000" \
  -F "description=High quality wheat" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.png" \
  -F "images=@/path/to/image3.webp"
```

**JavaScript/TypeScript Example**:

```typescript
const formData = new FormData();

// Required fields
formData.append('type', 'sell');
formData.append('category', 'goods');
formData.append('group_id', '550e8400-e29b-41d4-a716-446655440000');
formData.append('item_id', '660e8400-e29b-41d4-a716-446655440000');
formData.append('price', '1500.00');
formData.append('count', '1000');
formData.append('description', 'High quality wheat');

// Images (max 3)
formData.append('images', file1); // File object
formData.append('images', file2); // File object
formData.append('images', file3); // File object

const response = await fetch('http://localhost:3000/announcements', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    // Don't set Content-Type - browser will set it with boundary
  },
  body: formData,
});

const result = await response.json();
```

**Response Example** (201 Created):

```json
{
  "message": "Announcement submitted for verification",
  "announcement": {
    "id": "770e8400-e29b-41d4-a716-446655440000",
    "type": "sell",
    "category": "goods",
    "price": 1500.00,
    "count": 1000,
    "description": "High quality wheat",
    "images": [
      "https://xxxxx.supabase.co/storage/v1/object/sign/announcements/abc123/1704067200000-xyz789.jpg?token=eyJ...&expires=1704070800",
      "https://xxxxx.supabase.co/storage/v1/object/sign/announcements/abc123/1704067201000-def456.png?token=eyJ...&expires=1704070800",
      "https://xxxxx.supabase.co/storage/v1/object/sign/announcements/abc123/1704067202000-ghi789.webp?token=eyJ...&expires=1704070800"
    ],
    "status": "pending",
    "created_at": "2026-01-30T12:00:00.000Z",
    "updated_at": "2026-01-30T12:00:00.000Z"
  }
}
```

**Note**: The `images` array in the response contains **signed URLs** that expire after 1 hour. The database stores file paths, not these URLs.

---

### 2. Get Announcement (with Signed URLs)

**Endpoint**: `GET /announcements/:id`

**Request Example**:

```bash
curl -X GET http://localhost:3000/announcements/770e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response Example** (200 OK):

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440000",
  "type": "sell",
  "category": "goods",
  "price": 1500.00,
  "count": 1000,
  "description": "High quality wheat",
  "images": [
    "https://xxxxx.supabase.co/storage/v1/object/sign/announcements/abc123/1704067200000-xyz789.jpg?token=eyJ...&expires=1704070800",
    "https://xxxxx.supabase.co/storage/v1/object/sign/announcements/abc123/1704067201000-def456.png?token=eyJ...&expires=1704070800"
  ],
  "status": "published",
  "owner": {
    "id": "...",
    "name": "John Doe"
  },
  "group": {
    "id": "...",
    "name_am": "..."
  },
  "item": {
    "id": "...",
    "name_am": "..."
  },
  "created_at": "2026-01-30T12:00:00.000Z",
  "updated_at": "2026-01-30T12:00:00.000Z"
}
```

**Note**: Each time you fetch the announcement, **new signed URLs are generated** with a fresh 1-hour expiration.

---

### 3. Update Announcement Images

**Endpoint**: `PATCH /announcements/:id`

**Content-Type**: `multipart/form-data`

**Request Example**:

```bash
curl -X PATCH http://localhost:3000/announcements/770e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "description=Updated description" \
  -F "images=@/path/to/new-image.jpg"
```

**Response**: Same structure as GET, with updated data and fresh signed URLs.

---

## Validation Rules

### Image Count
- **Maximum**: 3 images per announcement
- **Validation**: Enforced at controller level and DTO level
- **Error**: `400 Bad Request` with message: "Maximum 3 images allowed. Received X images."

### File Size
- **Maximum**: 5MB per image
- **Validation**: Enforced in `StorageService.uploadImage()`
- **Error**: `400 Bad Request` with message: "File size (X.XXMB) exceeds 5MB limit."

### File Type
- **Allowed**: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
- **Validation**: Enforced via `FileTypeValidator` in controller
- **Error**: `400 Bad Request` with message: "Validation failed (expected type is /^image\/(jpeg|jpg|png|webp)$/)"

### MIME Type Validation
- Files are validated by MIME type (not file extension)
- Browser/client must send correct `Content-Type` header

---

## Error Responses

### Too Many Images

```json
{
  "statusCode": 400,
  "message": "Maximum 3 images allowed. Received 5 images.",
  "error": "Bad Request"
}
```

### File Too Large

```json
{
  "statusCode": 400,
  "message": "File size (6.50MB) exceeds 5MB limit. Your file is 6.50MB, maximum allowed is 5MB.",
  "error": "Bad Request"
}
```

### Invalid File Type

```json
{
  "statusCode": 400,
  "message": "Validation failed (expected type is /^image\/(jpeg|jpg|png|webp)$/)",
  "error": "Bad Request"
}
```

### Storage Configuration Error

```json
{
  "statusCode": 400,
  "message": "Storage service not configured",
  "error": "Bad Request"
}
```

### RLS Policy Error

```json
{
  "statusCode": 400,
  "message": "Storage upload failed due to RLS policy. Please ensure:\n1. You're using SUPABASE_SERVICE_ROLE_KEY (not anon key)\n2. Run the SQL script: database/fix_storage_rls_policies.sql\n3. Or disable RLS on the storage bucket in Supabase dashboard",
  "error": "Bad Request"
}
```

---

## Configuration

### Environment Variables

```env
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
SUPABASE_STORAGE_BUCKET=agronetxbeck

# Optional: Signed URL expiration (default: 3600 seconds = 1 hour)
SUPABASE_URL_EXPIRATION_SECONDS=3600
```

### Supabase Storage Setup

1. **Create Bucket**:
   - Name: `agronetxbeck` (or configure via `SUPABASE_STORAGE_BUCKET`)
   - Public: No (use signed URLs)
   - File size limit: 5MB

2. **RLS Policies**: Run `database/fix_storage_rls_policies.sql` in Supabase SQL Editor

---

## Implementation Details

### File Path Structure

Files are stored with the following path structure:

```
announcements/{folderId}/{timestamp}-{random}.{extension}
```

Example:
```
announcements/abc123/1704067200000-xyz789.jpg
```

Where:
- `announcements`: Base folder
- `abc123`: Unique folder identifier (8 characters)
- `1704067200000`: Timestamp in milliseconds
- `xyz789`: Random string (13 characters)
- `.jpg`: File extension

### Signed URL Generation

Signed URLs are generated on-the-fly when:
- Fetching a single announcement (`GET /announcements/:id`)
- Fetching all announcements (`GET /announcements`)
- Fetching user's announcements (`GET /announcements/me`)
- Any operation that returns announcement data

**Expiration**: URLs expire after 1 hour (3600 seconds) by default.

**Format**:
```
https://{project}.supabase.co/storage/v1/object/sign/{bucket}/{path}?token={token}&expires={timestamp}
```

---

## Best Practices

### Client-Side

1. **Validate before upload**: Check file size and type on client before sending
2. **Handle expired URLs**: If a signed URL expires, refetch the announcement to get new URLs
3. **Image optimization**: Compress images before upload to reduce file size
4. **Error handling**: Display user-friendly error messages for validation failures

### Server-Side

1. **Never store signed URLs**: Always store file paths in the database
2. **Generate fresh URLs**: Always generate new signed URLs when returning data
3. **Cleanup on delete**: Delete images from storage when announcement is deleted
4. **Logging**: Log all upload operations for debugging and monitoring

---

## Testing

### Test Image Upload

```bash
# Create announcement with 1 image
curl -X POST http://localhost:3000/announcements \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=sell" \
  -F "category=goods" \
  -F "group_id=$GROUP_ID" \
  -F "item_id=$ITEM_ID" \
  -F "price=1500" \
  -F "count=1000" \
  -F "images=@test-image.jpg"
```

### Test Max Images Limit

```bash
# Try to upload 4 images (should fail)
curl -X POST http://localhost:3000/announcements \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=sell" \
  -F "category=goods" \
  -F "group_id=$GROUP_ID" \
  -F "item_id=$ITEM_ID" \
  -F "price=1500" \
  -F "count=1000" \
  -F "images=@image1.jpg" \
  -F "images=@image2.jpg" \
  -F "images=@image3.jpg" \
  -F "images=@image4.jpg"  # This should cause an error
```

### Test File Size Limit

```bash
# Create a 6MB file and try to upload (should fail)
dd if=/dev/zero of=large-image.jpg bs=1M count=6
curl -X POST http://localhost:3000/announcements \
  -H "Authorization: Bearer $TOKEN" \
  -F "type=sell" \
  -F "category=goods" \
  -F "group_id=$GROUP_ID" \
  -F "item_id=$ITEM_ID" \
  -F "price=1500" \
  -F "count=1000" \
  -F "images=@large-image.jpg"
```

---

## Troubleshooting

### Issue: "Storage service not configured"
**Solution**: Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env`

### Issue: "RLS policy" error
**Solution**: Run `database/fix_storage_rls_policies.sql` in Supabase SQL Editor

### Issue: Signed URLs expire too quickly
**Solution**: Increase `SUPABASE_URL_EXPIRATION_SECONDS` in `.env` (default: 3600 = 1 hour)

### Issue: Images not showing
**Solution**: 
- Check if signed URLs are being generated correctly
- Verify bucket name matches configuration
- Check RLS policies allow service role to read

---

## Summary

✅ **File paths stored in DB** (not URLs)  
✅ **Signed URLs generated on-the-fly** (1 hour expiration)  
✅ **Max 3 images** per announcement  
✅ **Max 5MB** per image  
✅ **Production-grade validation** and error handling  
✅ **Comprehensive logging** for debugging  

The implementation is production-ready and follows NestJS and Supabase best practices.

