const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Read JSON file from utils folder
 */
function readJsonFile(filename = 'regions-villages.json') {
  const filePath = path.join(__dirname, filename);
  
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File ${filePath} not found`);
    process.exit(1);
  }

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error reading JSON file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Insert or get region (handles duplicates)
 */
async function insertOrGetRegion(regionData) {
  const { am: name_am, en: name_en, ru: name_ru } = regionData;

  // Check if region already exists (check by all three names to be safe)
  const { data: existingRegions, error: checkError } = await supabase
    .from('regions')
    .select('id')
    .eq('name_am', name_am)
    .eq('name_en', name_en)
    .eq('name_ru', name_ru)
    .limit(1);
  
  const existingRegion = existingRegions && existingRegions.length > 0 ? existingRegions[0] : null;

  if (existingRegion) {
    console.log(`  Region already exists: ${name_en} (ID: ${existingRegion.id})`);
    return existingRegion.id;
  }

  // Insert new region
  const { data: newRegion, error: insertError } = await supabase
    .from('regions')
    .insert({
      name_am,
      name_en,
      name_ru,
    })
    .select('id')
    .single();

  if (insertError) {
    // Handle unique constraint violation (duplicate)
    if (insertError.code === '23505') {
      console.log(`  Region duplicate detected, fetching existing: ${name_en}`);
      const { data: existing } = await supabase
        .from('regions')
        .select('id')
        .eq('name_am', name_am)
        .eq('name_en', name_en)
        .eq('name_ru', name_ru)
        .single();
      return existing?.id;
    }
    throw insertError;
  }

  console.log(`  ✓ Inserted region: ${name_en} (ID: ${newRegion.id})`);
  return newRegion.id;
}

/**
 * Insert or get village (handles duplicates)
 */
async function insertOrGetVillage(regionId, villageData) {
  const { am: name_am, en: name_en, ru: name_ru } = villageData;

  // Check if village already exists for this region (check by all three names)
  const { data: existingVillages, error: checkError } = await supabase
    .from('villages')
    .select('id')
    .eq('region_id', regionId)
    .eq('name_am', name_am)
    .eq('name_en', name_en)
    .eq('name_ru', name_ru)
    .limit(1);
  
  const existingVillage = existingVillages && existingVillages.length > 0 ? existingVillages[0] : null;

  if (existingVillage) {
    console.log(`    Village already exists: ${name_en}`);
    return existingVillage.id;
  }

  // Insert new village
  const { data: newVillage, error: insertError } = await supabase
    .from('villages')
    .insert({
      region_id: regionId,
      name_am,
      name_en,
      name_ru,
    })
    .select('id')
    .single();

  if (insertError) {
    // Handle unique constraint violation (duplicate)
    if (insertError.code === '23505') {
      console.log(`    Village duplicate detected, skipping: ${name_en}`);
      const { data: existing } = await supabase
        .from('villages')
        .select('id')
        .eq('region_id', regionId)
        .eq('name_am', name_am)
        .eq('name_en', name_en)
        .eq('name_ru', name_ru)
        .single();
      return existing?.id;
    }
    throw insertError;
  }

  console.log(`    ✓ Inserted village: ${name_en}`);
  return newVillage.id;
}

/**
 * Main import function
 */
async function importRegionsAndVillages() {
  console.log('Starting import of regions and villages...\n');

  // Read JSON file
  const jsonData = readJsonFile();
  console.log(`Found ${jsonData.length} regions to import\n`);

  let totalRegions = 0;
  let totalVillages = 0;
  let skippedRegions = 0;
  let skippedVillages = 0;

  // Process each region
  for (let i = 0; i < jsonData.length; i++) {
    const item = jsonData[i];
    const regionData = item.region;
    const villages = item.villages || [];

    console.log(`[${i + 1}/${jsonData.length}] Processing region: ${regionData.en}`);

    try {
      // Insert or get region
      const regionId = await insertOrGetRegion(regionData);
      
      if (!regionId) {
        console.log(`  ✗ Failed to get/create region: ${regionData.en}`);
        skippedRegions++;
        continue;
      }

      totalRegions++;

      // Process villages for this region
      if (villages.length > 0) {
        console.log(`  Processing ${villages.length} villages...`);
        
        for (const village of villages) {
          try {
            const villageId = await insertOrGetVillage(regionId, village);
            if (villageId) {
              totalVillages++;
            } else {
              skippedVillages++;
            }
          } catch (error) {
            console.error(`    ✗ Error inserting village ${village.en}:`, error.message);
            skippedVillages++;
          }
        }
      } else {
        console.log(`  No villages found for this region`);
      }

      console.log(''); // Empty line for readability

    } catch (error) {
      console.error(`  ✗ Error processing region ${regionData.en}:`, error.message);
      skippedRegions++;
      console.log(''); // Empty line for readability
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Import Summary:');
  console.log('='.repeat(50));
  console.log(`Total regions processed: ${totalRegions}`);
  console.log(`Skipped regions: ${skippedRegions}`);
  console.log(`Total villages processed: ${totalVillages}`);
  console.log(`Skipped villages: ${skippedVillages}`);
  console.log('='.repeat(50));
  console.log('\nImport completed!');
}

// Run the import
if (require.main === module) {
  importRegionsAndVillages()
    .then(() => {
      console.log('\n✓ Import finished successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Import failed:', error);
      process.exit(1);
    });
}

module.exports = { importRegionsAndVillages };

