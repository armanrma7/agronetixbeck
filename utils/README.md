# Regions and Villages Import Utility

This utility imports Armenian provinces and villages from a JSON file into Supabase PostgreSQL database.

## Setup

1. **Create the JSON file** in the `utils` folder named `regions-villages.json`:

```json
[
  {
    "region": { "am": "Արագածոտն", "en": "Aragatsotn", "ru": "Арагацотн" },
    "villages": [
      { "am": "Ագարակ/Թալ", "en": "Agarak (Tal)", "ru": "Аграк (Тал)" },
      { "am": "Ալագյազ", "en": "Alagyaz", "ru": "Алагяз" }
    ]
  }
]
```

2. **Run the database migration** first:
   - Execute `database/migrations_regions_villages.sql` in Supabase SQL Editor

3. **Set environment variables** in `.env`:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Usage

### Run the import script:

```bash
node utils/import-regions-villages.js
```

Or if you have a different filename:

```javascript
// Modify the filename in the script or pass as argument
const jsonData = readJsonFile('your-file.json');
```

## Features

- ✅ **Duplicate handling**: Safely handles duplicate regions and villages
- ✅ **Error handling**: Continues processing even if individual items fail
- ✅ **Progress tracking**: Shows progress and summary statistics
- ✅ **Upsert logic**: Checks for existing records before inserting

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

## Notes

- The script uses `SUPABASE_SERVICE_ROLE_KEY` for full database access
- Duplicates are detected by checking existing records before insertion
- Unique constraints on the database prevent duplicate entries
- The script can be run multiple times safely (idempotent)

