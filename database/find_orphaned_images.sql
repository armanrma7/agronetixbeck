-- Find all image paths currently referenced in announcements
-- This query extracts all image paths from the images array column
-- Run this to see what images ARE being used

-- Method 1: Get all unique image paths from announcements
SELECT DISTINCT unnest(images) AS image_path
FROM announcements
WHERE images IS NOT NULL 
  AND array_length(images, 1) > 0
ORDER BY image_path;

-- Method 2: Count how many announcements use each image
SELECT 
  unnest(images) AS image_path,
  COUNT(*) AS usage_count
FROM announcements
WHERE images IS NOT NULL 
  AND array_length(images, 1) > 0
GROUP BY image_path
ORDER BY usage_count DESC, image_path;

-- Method 3: Get all image paths with announcement details (for verification)
SELECT 
  id AS announcement_id,
  owner_id,
  status,
  unnest(images) AS image_path,
  created_at
FROM announcements
WHERE images IS NOT NULL 
  AND array_length(images, 1) > 0
ORDER BY created_at DESC, image_path;

-- Method 4: Find announcements with images (for manual review)
SELECT 
  id,
  owner_id,
  status,
  images,
  array_length(images, 1) AS image_count,
  created_at
FROM announcements
WHERE images IS NOT NULL 
  AND array_length(images, 1) > 0
ORDER BY created_at DESC;
