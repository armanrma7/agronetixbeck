-- Fix Supabase Storage RLS Policies for Image Uploads
-- Run this in your Supabase SQL Editor

-- First, check if the bucket exists and get its ID
-- Replace 'agronetxbeck' with your actual bucket name if different
DO $$
DECLARE
  bucket_name TEXT := 'agronetxbeck';
BEGIN
  -- Check if bucket exists
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = bucket_name
  ) THEN
    RAISE EXCEPTION 'Bucket % does not exist. Please create it first in the Supabase dashboard.', bucket_name;
  END IF;
END $$;

-- Option 1: Disable RLS on storage.objects (if you want to allow all operations)
-- WARNING: This makes all storage objects accessible. Only use if bucket is already public.
-- ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Option 2: Create policies that allow service role to upload (RECOMMENDED)
-- Drop existing policies for this bucket if they exist
DROP POLICY IF EXISTS "Service role can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete images" ON storage.objects;
DROP POLICY IF EXISTS "Public can read images" ON storage.objects;

-- Allow service role (service_role) to INSERT (upload)
CREATE POLICY "Service role can upload images"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'agronetxbeck');

-- Allow service role to DELETE
CREATE POLICY "Service role can delete images"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'agronetxbeck');

-- Allow public to SELECT (read) - for public URLs
CREATE POLICY "Public can read images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'agronetxbeck');

-- Option 3: If you want authenticated users to also upload (optional)
-- Uncomment these if you want users to upload directly from frontend
/*
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'agronetxbeck');

CREATE POLICY "Authenticated users can delete their images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'agronetxbeck' AND (storage.foldername(name))[1] = auth.uid()::text);
*/

-- Verify policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;

