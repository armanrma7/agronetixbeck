# Image Upload Guide for Announcements

Complete guide for uploading images to announcements using Supabase Storage.

---

## Overview

The announcements API supports image uploads in two ways:
1. **Binary file uploads** - Upload image files directly (multipart/form-data)
2. **URLs** - Provide image URLs directly (application/json)

Both methods can be combined - you can upload files AND provide URLs.

---

## Setup

### 1. Install Dependencies

```bash
npm install --save-dev @types/multer
```

### 2. Environment Variables

Add to your `.env` file:

```env
# Supabase Storage Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=announcements
```

### 3. Create Supabase Storage Bucket

In your Supabase dashboard:

1. Go to **Storage**
2. Create a new bucket named `announcements`
3. Set it to **Public** (or configure RLS policies)
4. Configure CORS if needed

---

## API Usage

### Method 1: Upload Binary Files (Multipart/Form-Data)

**Endpoint**: `POST /announcements`

**Content-Type**: `multipart/form-data`

**Request Format**:
```javascript
const formData = new FormData();

// Required fields
formData.append('type', 'sell');
formData.append('category', 'goods');
formData.append('group_id', 'category-uuid');
formData.append('item_id', 'item-uuid');
formData.append('price', '1500');

// Optional fields
formData.append('description', 'High quality wheat');
formData.append('count', '1000');
formData.append('daily_limit', '100');
formData.append('unit', 'kg');

// Images - upload binary files
formData.append('images', file1); // File object
formData.append('images', file2); // File object
formData.append('images', file3); // File object

// Regions
formData.append('regions', 'region-uuid-1');
formData.append('regions', 'region-uuid-2');

fetch('/announcements', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    // Don't set Content-Type - browser will set it with boundary
  },
  body: formData
});
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/announcements \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "type=sell" \
  -F "category=goods" \
  -F "group_id=category-uuid" \
  -F "item_id=item-uuid" \
  -F "price=1500" \
  -F "count=1000" \
  -F "images=@/path/to/image1.jpg" \
  -F "images=@/path/to/image2.jpg"
```

### Method 2: Provide URLs (JSON)

**Endpoint**: `POST /announcements`

**Content-Type**: `application/json`

**Request Body**:
```json
{
  "type": "sell",
  "category": "goods",
  "group_id": "category-uuid",
  "item_id": "item-uuid",
  "price": 1500,
  "count": 1000,
  "images": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ]
}
```

### Method 3: Combine Both

You can upload files AND provide URLs:

```javascript
const formData = new FormData();
formData.append('type', 'sell');
formData.append('category', 'goods');
formData.append('group_id', 'category-uuid');
formData.append('item_id', 'item-uuid');
formData.append('price', '1500');
formData.append('count', '1000');

// Upload files
formData.append('images', file1);
formData.append('images', file2);

// Also provide URLs (will be merged)
formData.append('images', 'https://example.com/existing-image.jpg');
```

---

## Image Requirements

### File Types
- ✅ JPEG/JPG
- ✅ PNG
- ✅ WebP

### File Size
- Maximum: **5MB per file**
- Maximum: **10 files per request**

### Validation
- Files are validated on upload
- Invalid files return `400 Bad Request`
- Error messages indicate which validation failed

---

## Update Announcement with Images

**Endpoint**: `PATCH /announcements/:id`

**Content-Type**: `multipart/form-data`

**Request**:
```javascript
const formData = new FormData();
formData.append('price', '1600');
formData.append('description', 'Updated description');

// Upload new images
formData.append('images', newFile1);
formData.append('images', newFile2);

// Existing URLs (will be merged with new uploads)
formData.append('images', 'https://existing-url.com/image.jpg');
```

**Note**: New images are uploaded and merged with existing image URLs.

---

## Response Format

**Success Response (201)**:
```json
{
  "message": "Your Announcement was successfully submitted for verification",
  "announcement": {
    "id": "announcement-uuid",
    "type": "sell",
    "category": "goods",
    "images": [
      "https://your-project.supabase.co/storage/v1/object/public/announcements/announcements/1234567890-abc123.jpg",
      "https://your-project.supabase.co/storage/v1/object/public/announcements/announcements/1234567891-def456.jpg"
    ],
    ...
  }
}
```

---

## Error Handling

### Invalid File Type
```json
{
  "statusCode": 400,
  "message": "Invalid file type. Allowed types: image/jpeg, image/jpg, image/png, image/webp"
}
```

### File Too Large
```json
{
  "statusCode": 400,
  "message": "File size exceeds 5MB limit"
}
```

### Storage Not Configured
```json
{
  "statusCode": 400,
  "message": "Storage service not configured"
}
```

### Upload Failed
```json
{
  "statusCode": 400,
  "message": "Failed to upload image: [error details]"
}
```

---

## Frontend Examples

### React/Next.js

```typescript
import { useState } from 'react';

function CreateAnnouncementForm() {
  const [files, setFiles] = useState<File[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('type', 'sell');
    formData.append('category', 'goods');
    formData.append('group_id', categoryId);
    formData.append('item_id', itemId);
    formData.append('price', price.toString());
    formData.append('count', count.toString());

    // Add image files
    files.forEach((file) => {
      formData.append('images', file);
    });

    const response = await fetch('/api/announcements', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    const result = await response.json();
    console.log('Announcement created:', result);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        multiple
        accept="image/jpeg,image/jpg,image/png,image/webp"
        onChange={(e) => setFiles(Array.from(e.target.files || []))}
      />
      {/* Other form fields */}
      <button type="submit">Create Announcement</button>
    </form>
  );
}
```

### Vue.js

```vue
<template>
  <form @submit.prevent="handleSubmit">
    <input
      type="file"
      multiple
      accept="image/jpeg,image/jpg,image/png,image/webp"
      @change="handleFileChange"
    />
    <!-- Other form fields -->
    <button type="submit">Create Announcement</button>
  </form>
</template>

<script setup>
import { ref } from 'vue';

const files = ref([]);

const handleFileChange = (e) => {
  files.value = Array.from(e.target.files || []);
};

const handleSubmit = async () => {
  const formData = new FormData();
  formData.append('type', 'sell');
  formData.append('category', 'goods');
  // ... other fields

  files.value.forEach((file) => {
    formData.append('images', file);
  });

  const response = await fetch('/api/announcements', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const result = await response.json();
  console.log('Announcement created:', result);
};
</script>
```

---

## Storage Service Configuration

### Supabase Storage Setup

1. **Create Bucket**:
   - Name: `announcements`
   - Public: Yes (or configure RLS)
   - File size limit: 5MB
   - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`

2. **RLS Policies** (if bucket is not public):

```sql
-- Allow authenticated users to upload
CREATE POLICY "Users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'announcements');

-- Allow public read access
CREATE POLICY "Public can read images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'announcements');
```

3. **CORS Configuration** (if needed):
   - Add your frontend domain to CORS settings
   - Allow methods: GET, POST, PUT, DELETE
   - Allow headers: Authorization, Content-Type

---

## File Naming

Uploaded files are automatically renamed:
- Format: `{folder}/{timestamp}-{random}.{extension}`
- Example: `announcements/1704067200000-abc123def456.jpg`
- Prevents filename conflicts
- Ensures unique file paths

---

## Cleanup

When an announcement is deleted, you may want to delete associated images:

```typescript
// In announcements service
async remove(id: string, userId: string): Promise<void> {
  const announcement = await this.findOne(id);
  
  // Delete images from storage
  if (announcement.images && announcement.images.length > 0) {
    await this.storageService.deleteImages(announcement.images);
  }
  
  // Soft delete announcement
  announcement.status = AnnouncementStatus.CANCELED;
  await this.announcementRepository.save(announcement);
}
```

---

## Testing

### Test Image Upload

```bash
# Create announcement with image
curl -X POST http://localhost:3000/announcements \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "type=sell" \
  -F "category=goods" \
  -F "group_id=category-uuid" \
  -F "item_id=item-uuid" \
  -F "price=1500" \
  -F "count=1000" \
  -F "images=@test-image.jpg"
```

### Test with Multiple Images

```bash
curl -X POST http://localhost:3000/announcements \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "type=sell" \
  -F "category=goods" \
  -F "group_id=category-uuid" \
  -F "item_id=item-uuid" \
  -F "price=1500" \
  -F "count=1000" \
  -F "images=@image1.jpg" \
  -F "images=@image2.jpg" \
  -F "images=@image3.jpg"
```

---

## Troubleshooting

### Issue: "Storage service not configured"
**Solution**: Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to `.env`

### Issue: "Failed to upload image"
**Solution**: 
- Check Supabase bucket exists and is accessible
- Verify service role key has storage permissions
- Check file size and type

### Issue: Images not showing
**Solution**:
- Verify bucket is public OR RLS policies allow read access
- Check CORS configuration
- Verify image URLs are correct

---

## Summary

✅ **Binary file uploads** supported via multipart/form-data  
✅ **URL uploads** supported via JSON  
✅ **Both methods** can be combined  
✅ **Automatic validation** of file type and size  
✅ **Unique file naming** prevents conflicts  
✅ **Public URLs** returned for uploaded images  

All image uploads are handled automatically - just include files in your request!

