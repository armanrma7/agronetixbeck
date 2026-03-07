/**
 * Remove from storage any images that are not linked to any announcement.
 *
 * 1. Loads all image paths referenced in announcements (DB).
 * 2. Lists all files under the announcements folder in Supabase Storage.
 * 3. Deletes from storage only files that are not in the referenced set.
 *
 * Usage:
 *   node utils/clean-orphaned-storage-images.js           # dry run (only list)
 *   node utils/clean-orphaned-storage-images.js --delete  # actually delete
 *
 * Requires .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY),
 *                SUPABASE_STORAGE_BUCKET (optional), DB_* for PostgreSQL.
 */

const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'agronetxbeck';

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false },
};

const isDryRun = !process.argv.includes('--delete');

/** Normalize storage path for comparison (trim, no leading slash, forward slashes) */
function normalizePath(p) {
  if (!p || typeof p !== 'string') return '';
  let s = p.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  try {
    s = decodeURIComponent(s);
  } catch (_) {
    // keep as-is if not valid URI
  }
  return s;
}

/** Get all image paths referenced in announcements (DB) */
async function getReferencedPaths() {
  const client = new Client(dbConfig);
  await client.connect();
  try {
    const result = await client.query(`
      SELECT DISTINCT unnest(images) AS image_path
      FROM announcements
      WHERE images IS NOT NULL AND array_length(images, 1) > 0
    `);
    const set = new Set(
      result.rows
        .map((row) => normalizePath(row.image_path))
        .filter(Boolean),
    );
    console.log(`  Referenced in announcements: ${set.size} unique path(s)`);
    return set;
  } finally {
    await client.end();
  }
}

/** List all file paths under a folder in the bucket (recursive) */
async function listFilesInFolder(supabase, folderPath) {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .list(folderPath, { limit: 1000 });

  if (error) {
    console.warn(`  Warning: list('${folderPath}'): ${error.message}`);
    return [];
  }

  const files = [];
  for (const item of data || []) {
    const fullPath = folderPath ? `${folderPath}/${item.name}` : item.name;
    // Files have `id` in Supabase list response; folders (prefixes) often do not
    if (item.id != null) {
      files.push(fullPath);
    } else {
      const nested = await listFilesInFolder(supabase, fullPath);
      files.push(...nested);
    }
  }
  return files;
}

/** Get all file paths in storage under 'announcements' */
async function getAllStoragePaths() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const files = await listFilesInFolder(supabase, 'announcements');
  console.log(`  In bucket '${bucketName}' under announcements/: ${files.length} file(s)`);
  return files;
}

/** Delete given paths from storage */
async function deletePaths(paths) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const BATCH = 100;
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < paths.length; i += BATCH) {
    const batch = paths.slice(i, i + BATCH);
    const { error } = await supabase.storage.from(bucketName).remove(batch);
    if (error) {
      console.error(`  Delete batch error: ${error.message}`);
      failed += batch.length;
    } else {
      batch.forEach((p) => console.log(`  Deleted: ${p}`));
      deleted += batch.length;
    }
  }
  console.log(`  Deletion done: ${deleted} deleted, ${failed} failed`);
}

async function main() {
  console.log('Clean orphaned storage images (not linked to any announcement)\n');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  console.log(`Mode: ${isDryRun ? 'DRY RUN (no delete)' : 'DELETE'}\n`);

  const referenced = await getReferencedPaths();
  const inStorage = await getAllStoragePaths();

  const orphaned = inStorage.filter((file) => !referenced.has(normalizePath(file)));

  console.log(`\nOrphaned (in storage but not referenced): ${orphaned.length}`);

  if (orphaned.length === 0) {
    console.log('Nothing to remove.');
    return;
  }

  orphaned.forEach((p) => console.log(`  - ${p}`));

  if (isDryRun) {
    console.log('\nRun with --delete to remove these files.');
    return;
  }

  console.log('\nDeleting in 5s... (Ctrl+C to cancel)');
  await new Promise((r) => setTimeout(r, 5000));
  await deletePaths(orphaned);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
