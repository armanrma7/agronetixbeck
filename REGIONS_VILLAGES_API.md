# Regions and Villages API

## Overview

API endpoints for managing Armenian regions (provinces) and villages with multilingual support. Users can now be linked to regions and villages via foreign key relationships.

## Database Schema

### Regions Table
- `id` (UUID, Primary Key)
- `name_am` (VARCHAR 255) - Armenian name
- `name_en` (VARCHAR 255) - English name
- `name_ru` (VARCHAR 255) - Russian name
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Villages Table
- `id` (UUID, Primary Key)
- `region_id` (UUID, Foreign Key → regions.id)
- `name_am` (VARCHAR 255) - Armenian name
- `name_en` (VARCHAR 255) - English name
- `name_ru` (VARCHAR 255) - Russian name
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

### Users Table (Updated)
- `region_id` (UUID, Foreign Key → regions.id, nullable)
- `village_id` (UUID, Foreign Key → villages.id, nullable)

## API Endpoints

### Regions

#### Get All Regions
```http
GET /regions
```

**Response:**
```json
[
  {
    "id": "uuid",
    "name_am": "Արագածոտն",
    "name_en": "Aragatsotn",
    "name_ru": "Арагацотн",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

#### Get Region by ID
```http
GET /regions/:id
```

**Response:**
```json
{
  "id": "uuid",
  "name_am": "Արագածոտն",
  "name_en": "Aragatsotn",
  "name_ru": "Арагацотн",
  "villages": [
    {
      "id": "uuid",
      "region_id": "uuid",
      "name_am": "Ագարակ/Թալ",
      "name_en": "Agarak (Tal)",
      "name_ru": "Аграк (Тал)"
    }
  ],
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

#### Get Villages by Region
```http
GET /regions/:id/villages
```

**Response:**
```json
[
  {
    "id": "uuid",
    "region_id": "uuid",
    "name_am": "Ագարակ/Թալ",
    "name_en": "Agarak (Tal)",
    "name_ru": "Аграк (Тал)",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

### Villages

#### Get All Villages
```http
GET /villages
```

**Response:**
```json
[
  {
    "id": "uuid",
    "region_id": "uuid",
    "name_am": "Ագարակ/Թալ",
    "name_en": "Agarak (Tal)",
    "name_ru": "Аграк (Тал)",
    "region": {
      "id": "uuid",
      "name_am": "Արագածոտն",
      "name_en": "Aragatsotn",
      "name_ru": "Арагацотн"
    },
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

#### Get Village by ID
```http
GET /villages/:id
```

**Response:**
```json
{
  "id": "uuid",
  "region_id": "uuid",
  "name_am": "Ագարակ/Թալ",
  "name_en": "Agarak (Tal)",
  "name_ru": "Аграк (Тал)",
  "region": {
    "id": "uuid",
    "name_am": "Արագածոտն",
    "name_en": "Aragatsotn",
    "name_ru": "Арагацотн"
  },
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

## Updated Registration

Registration now accepts `region_id` and `village_id` instead of string values:

```json
POST /auth/register
{
  "user_type": "farmer",
  "full_name": "John Doe",
  "phone": "+1234567890",
  "password": "SecurePass123!",
  "region_id": "uuid-of-region",
  "village_id": "uuid-of-village",
  "terms_accepted": true
}
```

**Response includes region and village objects:**
```json
{
  "message": "Registration success",
  "user": {
    "id": "uuid",
    "full_name": "John Doe",
    "phone": "+1234567890",
    "region_id": "uuid",
    "village_id": "uuid",
    "region": {
      "id": "uuid",
      "name_am": "Արագածոտն",
      "name_en": "Aragatsotn",
      "name_ru": "Арагацотн"
    },
    "village": {
      "id": "uuid",
      "name_am": "Ագարակ/Թալ",
      "name_en": "Agarak (Tal)",
      "name_ru": "Аграк (Тал)"
    }
  }
}
```

## Migration Steps

1. **Run regions/villages migration:**
   ```sql
   -- Execute: database/migrations_regions_villages.sql
   ```

2. **Import regions and villages data:**
   ```bash
   npm run import:regions
   ```

3. **Update users table:**
   ```sql
   -- Execute: database/migrations_add_user_region_village.sql
   ```

## Features

- ✅ **Multilingual support**: Armenian, English, Russian
- ✅ **Foreign key relationships**: Proper database constraints
- ✅ **Relations loaded**: Region and village objects included in user responses
- ✅ **ID-based lookup**: Get regions/villages by ID
- ✅ **Swagger documentation**: All endpoints documented

## Usage Flow

1. **Get all regions:**
   ```bash
   GET /regions
   ```

2. **Get villages for a region:**
   ```bash
   GET /regions/{region_id}/villages
   ```

3. **Register user with region and village:**
   ```bash
   POST /auth/register
   {
     "region_id": "...",
     "village_id": "..."
   }
   ```

4. **User response includes full region/village objects:**
   - Login response
   - Registration response
   - All user-related endpoints

