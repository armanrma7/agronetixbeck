const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function readJsonFile(filename = 'catalog.json') {
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

async function insertOrGetCategory(categoryData) {
  // Handle both "hy" and "am" for Armenian
  const nameObj = categoryData.name || categoryData;
  const name_am = nameObj.hy || nameObj.am || '';
  const name_en = nameObj.en || '';
  const name_ru = nameObj.ru || '';
  
  // Use provided key or generate from English name
  const key = categoryData.key || name_en.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  
  // Get type from categoryData, default to 'goods'
  const type = categoryData.type || 'goods';
  
  // Validate type
  if (!['goods', 'service', 'rent'].includes(type)) {
    console.error(`Invalid category type: ${type}. Must be 'goods', 'service', or 'rent'`);
    return null;
  }

  if (!name_en) {
    console.error('Category missing English name');
    return null;
  }

  const { data: existingCategory } = await supabase
    .from('catalog_categories')
    .select('id')
    .eq('key', key)
    .single();

  if (existingCategory) {
    return existingCategory.id;
  }

  const { data, error } = await supabase
    .from('catalog_categories')
    .insert({
      key,
      type: type,
      name_am: name_am,
      name_en: name_en,
      name_ru: name_ru,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('catalog_categories')
        .select('id')
        .eq('key', key)
        .single();
      return existing?.id;
    }
    console.error(`Error inserting category ${name_en}:`, error.message);
    return null;
  }

  return data.id;
}

async function insertOrGetSubcategory(categoryId, subcategoryData) {
  // Handle both "hy" and "am" for Armenian
  const nameObj = subcategoryData.name || subcategoryData;
  const name_am = nameObj.hy || nameObj.am || '';
  const name_en = nameObj.en || '';
  const name_ru = nameObj.ru || '';
  
  // Use provided key or generate from English name
  const key = subcategoryData.key || name_en.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  if (!name_en) {
    console.error('Subcategory missing English name');
    return null;
  }

  const { data: existingSubcategory } = await supabase
    .from('catalog_subcategories')
    .select('id')
    .eq('category_id', categoryId)
    .eq('key', key)
    .single();

  if (existingSubcategory) {
    return existingSubcategory.id;
  }

  const { data, error } = await supabase
    .from('catalog_subcategories')
    .insert({
      category_id: categoryId,
      key,
      name_am: name_am,
      name_en: name_en,
      name_ru: name_ru,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('catalog_subcategories')
        .select('id')
        .eq('category_id', categoryId)
        .eq('key', key)
        .single();
      return existing?.id;
    }
    console.error(`Error inserting subcategory ${name_en}:`, error.message);
    return null;
  }

  return data.id;
}

async function insertItem(subcategoryId, itemData) {
  // Handle name - can be object with hy/en/ru or direct properties
  const nameObj = itemData.name || itemData;
  const name_am = nameObj.hy || nameObj.am || '';
  const name_en = nameObj.en || '';
  const name_ru = nameObj.ru || '';

  if (!name_en) {
    console.error('Item missing English name');
    return null;
  }

  // Get key from itemData or generate from English name
  const key = itemData.key || name_en.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  // Handle measurements - array of objects with hy/en/ru
  let measurements = null;
  
  if (itemData.measurements && Array.isArray(itemData.measurements) && itemData.measurements.length > 0) {
    // Convert array of measurement objects to proper format
    // Input: [{hy: "կգ", en: "kg", ru: "кг"}, ...]
    // Output: [{hy: "կգ", en: "kg", ru: "кг"}, ...] (same format, but ensure all fields exist)
    measurements = itemData.measurements.map(meas => ({
      hy: (meas.hy || meas.am || '').trim() || null,
      en: (meas.en || '').trim() || null,
      ru: (meas.ru || '').trim() || null,
    })).filter(meas => meas.hy || meas.en || meas.ru); // Remove empty measurements
    
    // If all measurements were filtered out, set to null
    if (measurements.length === 0) {
      measurements = null;
    }
  }

  // Check if item already exists
  const { data: existingItem } = await supabase
    .from('catalog_items')
    .select('id, measurements')
    .eq('subcategory_id', subcategoryId)
    .eq('key', key)
    .single();

  if (existingItem) {
    // Update existing item with measurements if provided and different
    if (measurements) {
      const existingMeasurements = existingItem.measurements || [];
      const needsUpdate = JSON.stringify(existingMeasurements) !== JSON.stringify(measurements);
      
      if (needsUpdate) {
        await supabase
          .from('catalog_items')
          .update({ measurements: measurements })
          .eq('id', existingItem.id);
      }
    }
    return existingItem.id;
  }

  const insertData = {
    subcategory_id: subcategoryId,
    key: key,
    name_am: name_am,
    name_en: name_en,
    name_ru: name_ru,
  };
  
  // Include measurements if they exist
  if (measurements) {
    insertData.measurements = measurements;
  }

  const { data, error } = await supabase
    .from('catalog_items')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      // Try to get existing item
      const { data: existing } = await supabase
        .from('catalog_items')
        .select('id')
        .eq('subcategory_id', subcategoryId)
        .eq('key', key)
        .single();
      return existing?.id;
    }
    console.error(`Error inserting item ${name_en}:`, error.message);
    return null;
  }

  return data.id;
}

async function importCatalog() {
  const filename = process.argv[2] || 'catalog.json';
  const jsonData = readJsonFile(filename);

  let categoriesProcessed = 0;
  let subcategoriesProcessed = 0;
  let itemsProcessed = 0;
  let categoriesSkipped = 0;
  let subcategoriesSkipped = 0;
  let itemsSkipped = 0;
  let categoriesFailed = 0;
  let subcategoriesFailed = 0;
  let itemsFailed = 0;

  console.log(`Starting import of catalog from ${filename}...\n`);

  // Handle different JSON structures:
  // 1. { categories: [...] } - object with categories property
  // 2. [{ categories: [...] }] - array with object containing categories
  // 3. [{ category: {...}, subcategories: [...] }] - array of category entries
  let categoriesArray = [];
  
  if (Array.isArray(jsonData)) {
    // Array structure
    if (jsonData.length > 0 && jsonData[0].categories && Array.isArray(jsonData[0].categories)) {
      // Structure: [{ categories: [...] }]
      categoriesArray = jsonData[0].categories;
    } else {
      // Structure: [{ category: {...}, subcategories: [...] }]
      categoriesArray = jsonData;
    }
  } else if (jsonData && typeof jsonData === 'object') {
    // Object structure
    if (jsonData.categories && Array.isArray(jsonData.categories)) {
      // Structure: { categories: [...] }
      categoriesArray = jsonData.categories;
    } else {
      console.error('Invalid JSON structure: Expected "categories" array');
      process.exit(1);
    }
  } else {
    console.error('Invalid JSON structure: Expected object or array');
    process.exit(1);
  }

  if (categoriesArray.length === 0) {
    console.log('No categories found in JSON file.');
    return;
  }

  for (const categoryData of categoriesArray) {
    const categoryName = categoryData.name?.en || categoryData.en || 'Unknown';
    console.log(`Processing category: ${categoryName}`);

    const categoryId = await insertOrGetCategory(categoryData);
    
    if (!categoryId) {
      categoriesFailed++;
      console.error(`  Failed to process category: ${categoryName}`);
      continue;
    }

    categoriesProcessed++;

    if (!categoryData.subcategories || categoryData.subcategories.length === 0) {
      console.log(`  No subcategories for ${categoryName}`);
      continue;
    }

    for (const subcategoryData of categoryData.subcategories) {
      const subcategoryName = subcategoryData.name?.en || subcategoryData.en || 'Unknown';
      console.log(`  Processing subcategory: ${subcategoryName}`);

      const subcategoryId = await insertOrGetSubcategory(categoryId, subcategoryData);
      
      if (!subcategoryId) {
        subcategoriesFailed++;
        console.error(`    Failed to process subcategory: ${subcategoryName}`);
        continue;
      }

      subcategoriesProcessed++;

      if (!subcategoryData.items || subcategoryData.items.length === 0) {
        console.log(`    No items for ${subcategoryName}`);
        continue;
      }

      for (const itemData of subcategoryData.items) {
        const itemName = itemData.en || 'Unknown';
        const itemId = await insertItem(subcategoryId, itemData);
        
        if (itemId) {
          itemsProcessed++;
        } else {
          itemsSkipped++;
        }
      }
    }
  }

  console.log('\n--- Import Summary ---');
  console.log(`Categories: Processed ${categoriesProcessed}, Failed ${categoriesFailed}`);
  console.log(`Subcategories: Processed ${subcategoriesProcessed}, Failed ${subcategoriesFailed}`);
  console.log(`Items: Processed ${itemsProcessed}, Skipped ${itemsSkipped}`);
  console.log('----------------------');
  console.log('Import process finished.');
}

importCatalog().catch((error) => {
  console.error('Fatal error during import:', error);
  process.exit(1);
});

