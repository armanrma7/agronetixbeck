/**
 * Script to find and delete orphaned images from Supabase Storage
 * 
 * This script:
 * 1. Gets all image paths referenced in announcements from the database
 * 2. Lists all files in the storage bucket
 * 3. Finds files that are NOT referenced in any announcement
 * 4. Optionally deletes the orphaned files
 * 
 * Usage:
 *   node database/cleanup_orphaned_images.js [--dry-run] [--delete]
 * 
 * Options:
 *   --dry-run: Only list orphaned files, don't delete (default)
 *   --delete: Actually delete orphaned files (use with caution!)
 */

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'agronetxbeck';

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

const isDryRun = !process.argv.includes('--delete');
const shouldDelete = process.argv.includes('--delete');

async function getReferencedImages() {
  const client = new Client(dbConfig);
  await client.connect();
  
  try {
    const result = await client.query(`
      SELECT DISTINCT unnest(images) AS image_path
      FROM announcements
      WHERE images IS NOT NULL 
        AND array_length(images, 1) > 0
    `);
    
    const referencedPaths = new Set(
      result.rows.map(row => row.image_path).filter(Boolean)
    );
    
    console.log(`Found ${referencedPaths.size} unique image paths referenced in announcements`);
    return referencedPaths;
  } finally {
    await client.end();
  }
}

async function getAllStorageFiles() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  const allFiles = [];
  let pageToken = null;
  
  do {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list('announcements', {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });
    
    if (error) {
      throw new Error(`Failed to list storage files: ${error.message}`);
    }
    
    // Recursively get all files from subfolders
    for (const item of data || []) {
      if (item.id) {
        // It's a file
        allFiles.push(`announcements/${item.name}`);
      } else if (item.name) {
        // It's a folder - list files in it
        const folderFiles = await listFolderFiles(supabase, `announcements/${item.name}`);
        allFiles.push(...folderFiles);
      }
    }
    
    // For simplicity, we'll do a single pass. For large buckets, you might need pagination
    break;
  } while (pageToken);
  
  console.log(`Found ${allFiles.length} files in storage bucket '${bucketName}'`);
  return allFiles;
}

async function listFolderFiles(supabase, folderPath) {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .list(folderPath, {
      limit: 1000,
    });
  
  if (error) {
    console.warn(`Warning: Could not list folder ${folderPath}: ${error.message}`);
    return [];
  }
  
  const files = [];
  for (const item of data || []) {
    if (item.id) {
      files.push(`${folderPath}/${item.name}`);
    } else if (item.name) {
      // Recursive for nested folders
      const nestedFiles = await listFolderFiles(supabase, `${folderPath}/${item.name}`);
      files.push(...nestedFiles);
    }
  }
  
  return files;
}

async function deleteOrphanedFiles(orphanedFiles) {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  console.log(`\nDeleting ${orphanedFiles.length} orphaned files...`);
  
  let deleted = 0;
  let failed = 0;
  
  for (const filePath of orphanedFiles) {
    try {
      const { error } = await supabase.storage
        .from(bucketName)
        .remove([filePath]);
      
      if (error) {
        console.error(`Failed to delete ${filePath}: ${error.message}`);
        failed++;
      } else {
        console.log(`Deleted: ${filePath}`);
        deleted++;
      }
    } catch (error) {
      console.error(`Error deleting ${filePath}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\nDeletion complete: ${deleted} deleted, ${failed} failed`);
}

async function main() {
  console.log('=== Orphaned Image Cleanup Script ===\n');
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no files will be deleted)' : 'DELETE MODE (files will be deleted!)'}\n`);
  
  try {
    // Step 1: Get all referenced images from database
    console.log('Step 1: Getting referenced images from database...');
    const referencedImages = await getReferencedImages();
    
    // Step 2: Get all files from storage
    console.log('\nStep 2: Listing all files in storage...');
    const storageFiles = await getAllStorageFiles();
    
    // Step 3: Find orphaned files
    console.log('\nStep 3: Finding orphaned files...');
    const orphanedFiles = storageFiles.filter(file => !referencedImages.has(file));
    
    console.log(`\n=== Results ===`);
    console.log(`Referenced images: ${referencedImages.size}`);
    console.log(`Total storage files: ${storageFiles.length}`);
    console.log(`Orphaned files: ${orphanedFiles.length}`);
    
    if (orphanedFiles.length > 0) {
      console.log(`\nOrphaned files:`);
      orphanedFiles.forEach(file => console.log(`  - ${file}`));
      
      if (shouldDelete) {
        console.log(`\n⚠️  WARNING: About to delete ${orphanedFiles.length} files!`);
        console.log('Press Ctrl+C within 5 seconds to cancel...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await deleteOrphanedFiles(orphanedFiles);
      } else {
        console.log(`\n💡 Run with --delete flag to actually delete these files`);
      }
    } else {
      console.log(`\n✅ No orphaned files found!`);
    }
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getReferencedImages, getAllStorageFiles };
