-- Simple SQL query to help identify potentially orphaned images
-- Note: This only shows images IN the database. To find truly orphaned files,
-- you need to compare this list with actual files in Supabase Storage.
--
-- Use the Node.js script (cleanup_orphaned_images.js) for full cleanup.

-- Get all image paths that are referenced in announcements
-- Save this output and compare with your storage bucket files
SELECT DISTINCT unnest(images) AS image_path
FROM announcements
WHERE images IS NOT NULL 
  AND array_length(images, 1) > 0
ORDER BY image_path;

-- Optional: Also check user profile pictures
SELECT DISTINCT profile_picture AS image_path
FROM users
WHERE profile_picture IS NOT NULL
  AND profile_picture != ''
ORDER BY image_path;

-- Combined: All images referenced in database (announcements + users)
SELECT DISTINCT image_path
FROM (
  SELECT unnest(images) AS image_path
  FROM announcements
  WHERE images IS NOT NULL AND array_length(images, 1) > 0
  
  UNION
  
  SELECT profile_picture AS image_path
  FROM users
  WHERE profile_picture IS NOT NULL AND profile_picture != ''
) AS all_images
WHERE image_path IS NOT NULL
ORDER BY image_path;
