/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — BULK CATALOGUE & STOCK COUNT IMPORT SERVICE
 * Validates, groups, detects stale stock conflicts, and executes atomic commits
 * ═════════════════════════════════════════════════════════════════════
 */

const db = require('../db/database');
const { buildCsvContent } = require('../utils/csvValidation');

const CATALOGUE_TEMPLATE_HEADERS = [
  'master_sku', 'product_name', 'product_slug', 'description',
  'brand_name', 'shape_name', 'category_name', 'base_price_inr',
  'gender', 'material', 'frame_fit', 'lens_width_mm', 'bridge_width_mm',
  'temple_length_mm', 'frame_height_mm', 'total_width_mm',
  'variant_sku', 'color_name', 'color_hex', 'color_secondary_hex',
  'price_override_inr', 'opening_stock', 'is_default'
];

const STOCK_TEMPLATE_HEADERS = [
  'variant_sku', 'product_name', 'color_name',
  'expected_current_quantity', 'counted_quantity', 'reason'
];

const VALID_GENDERS = ['men', 'women', 'unisex'];
const VALID_FITS = ['Narrow', 'Medium', 'Wide'];
const HEX_REGEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;

function slugify(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function generateBatchNumber(prefix) {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${stamp}-${rand}`;
}

function normalizeFit(val) {
  const clean = String(val || '').trim().toLowerCase();
  return VALID_FITS.find(f => f.toLowerCase() === clean) || null;
}

function normalizeBoolFlag(val) {
  const clean = String(val ?? '').trim().toLowerCase();
  if (clean === '1' || clean === 'true' || clean === 'yes') return 1;
  return 0;
}

/**
 * Generate blank or sample Catalogue CSV template (never mutates DB)
 */
async function generateCatalogueTemplateCsv(includeSample = false) {
  if (!includeSample) {
    return buildCsvContent(CATALOGUE_TEMPLATE_HEADERS, []);
  }

  const [firstBrand, firstShape, firstCat] = await Promise.all([
    db.get('SELECT name FROM brands WHERE is_active = 1 ORDER BY id ASC LIMIT 1'),
    db.get('SELECT name FROM frame_shapes WHERE is_active = 1 ORDER BY id ASC LIMIT 1'),
    db.get('SELECT name FROM categories WHERE is_active = 1 ORDER BY id ASC LIMIT 1')
  ]);

  const brandName = firstBrand ? firstBrand.name : 'Optii Atelier';
  const shapeName = firstShape ? firstShape.name : 'Round';
  const categoryName = firstCat ? firstCat.name : 'Eyeglasses';

  const sampleRows = [
    [
      'DEMO-MIRA-01', 'Mira Sample Round', 'demo-mira-sample-round', 'Sample demonstration frame (edit or replace before import)',
      brandName, shapeName, categoryName, '4290',
      'unisex', 'Italian Bio-Acetate', 'Medium', '49', '20', '145', '44', '134',
      'DEMO-MIRA-BLK', 'Matte Black', '#222222', '', '', '12', '1'
    ],
    [
      'DEMO-MIRA-01', 'Mira Sample Round', 'demo-mira-sample-round', 'Sample demonstration frame (edit or replace before import)',
      brandName, shapeName, categoryName, '4290',
      'unisex', 'Italian Bio-Acetate', 'Medium', '49', '20', '145', '44', '134',
      'DEMO-MIRA-TOR', 'Tortoise', '#70513B', '#B2733B', '', '6', '0'
    ]
  ];

  return buildCsvContent(CATALOGUE_TEMPLATE_HEADERS, sampleRows);
}

/**
 * Load taxonomy & existing SKU lookup sets from SQLite
 */
async function loadCatalogueReferenceData() {
  const [brands, shapes, categories, existingProducts, existingVariants] = await Promise.all([
    db.all('SELECT id, name, slug FROM brands WHERE is_active = 1'),
    db.all('SELECT id, name, slug FROM frame_shapes WHERE is_active = 1'),
    db.all('SELECT id, name, slug FROM categories WHERE is_active = 1'),
    db.all('SELECT id, sku, slug FROM products'),
    db.all('SELECT id, sku FROM product_variants')
  ]);

  const brandMap = new Map();
  brands.forEach(b => {
    brandMap.set(b.name.trim().toLowerCase(), b);
    brandMap.set(b.slug.trim().toLowerCase(), b);
  });

  const shapeMap = new Map();
  shapes.forEach(s => {
    shapeMap.set(s.name.trim().toLowerCase(), s);
    shapeMap.set(s.slug.trim().toLowerCase(), s);
  });

  const categoryMap = new Map();
  categories.forEach(c => {
    categoryMap.set(c.name.trim().toLowerCase(), c);
    categoryMap.set(c.slug.trim().toLowerCase(), c);
  });

  const existingMasterSkus = new Set(existingProducts.map(p => String(p.sku).trim().toUpperCase()));
  const existingProductSlugs = new Set(existingProducts.map(p => String(p.slug).trim().toLowerCase()));
  const existingVariantSkus = new Set(existingVariants.map(v => String(v.sku).trim().toUpperCase()));

  return {
    brandMap,
    shapeMap,
    categoryMap,
    existingMasterSkus,
    existingProductSlugs,
    existingVariantSkus
  };
}

/**
 * Validate raw mapped catalogue rows without committing.
 */
async function validateCatalogueRows(rawRows) {
  const refs = await loadCatalogueReferenceData();
  const errors = [];
  const warnings = [];
  const normalizedRows = [];
  const seenVariantSkus = new Map(); // SKU -> [rowNumbers]
  const masterGroups = new Map(); // master_sku (upper) -> [entries]

  rawRows.forEach((raw, idx) => {
    const rowNumber = Number(raw.rowNumber || idx + 2);
    const masterSku = String(raw.master_sku || '').trim();
    const productName = String(raw.product_name || '').trim();
    const rawSlug = String(raw.product_slug || '').trim();
    const productSlug = rawSlug ? slugify(rawSlug) : slugify(`${productName}-${masterSku}`);
    const description = String(raw.description || '').trim();
    const brandName = String(raw.brand_name || '').trim();
    const shapeName = String(raw.shape_name || '').trim();
    const categoryName = String(raw.category_name || '').trim();
    const basePriceRaw = raw.base_price_inr;
    const genderRaw = String(raw.gender || 'unisex').trim().toLowerCase();
    const material = String(raw.material || '').trim();
    const fitRaw = String(raw.frame_fit || '').trim();
    const lensWidthRaw = raw.lens_width_mm;
    const bridgeWidthRaw = raw.bridge_width_mm;
    const templeLengthRaw = raw.temple_length_mm;
    const frameHeightRaw = raw.frame_height_mm;
    const totalWidthRaw = raw.total_width_mm;

    const variantSku = String(raw.variant_sku || '').trim();
    const colorName = String(raw.color_name || '').trim();
    const colorHex = String(raw.color_hex || '').trim();
    const colorSecondaryHex = String(raw.color_secondary_hex || '').trim();
    const priceOverrideRaw = raw.price_override_inr;
    const openingStockRaw = raw.opening_stock === '' || raw.opening_stock === undefined || raw.opening_stock === null ? '0' : raw.opening_stock;
    const isDefault = normalizeBoolFlag(raw.is_default);

    const rowErrors = [];
    const addErr = (field, value, msg) => {
      const errObj = {
        row_number: rowNumber,
        sku: variantSku || masterSku || '',
        field_name: field,
        submitted_value: value === undefined || value === null ? '' : String(value),
        error_message: `Row ${rowNumber}: ${msg}`
      };
      rowErrors.push(errObj);
      errors.push(errObj);
    };

    if (!masterSku) addErr('master_sku', masterSku, 'Master SKU is required.');
    if (!productName || productName.length < 2) addErr('product_name', productName, 'Product name must be at least 2 characters.');
    if (!variantSku) addErr('variant_sku', variantSku, 'Variant SKU is required.');
    if (!colorName) addErr('color_name', colorName, 'Colour name is required.');
    if (!material) addErr('material', material, 'Frame material is required.');

    if (!HEX_REGEX.test(colorHex)) {
      addErr('color_hex', colorHex, `Colour hex '${colorHex}' must be formatted as #RRGGBB.`);
    }
    if (colorSecondaryHex && !HEX_REGEX.test(colorSecondaryHex)) {
      addErr('color_secondary_hex', colorSecondaryHex, `Secondary colour hex '${colorSecondaryHex}' must be formatted as #RRGGBB.`);
    }

    const basePrice = Number(basePriceRaw);
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      addErr('base_price_inr', basePriceRaw, `Base price '${basePriceRaw}' must be a positive number.`);
    }

    let priceOverride = null;
    if (priceOverrideRaw !== '' && priceOverrideRaw !== undefined && priceOverrideRaw !== null) {
      priceOverride = Number(priceOverrideRaw);
      if (!Number.isFinite(priceOverride) || priceOverride <= 0) {
        addErr('price_override_inr', priceOverrideRaw, `Price override '${priceOverrideRaw}' must be a positive number.`);
      }
    }

    const openingStock = Number(openingStockRaw);
    if (!Number.isInteger(openingStock) || openingStock < 0) {
      addErr('opening_stock', openingStockRaw, `Opening stock '${openingStockRaw}' must be a non-negative whole integer.`);
    }

    const lensWidth = Number(lensWidthRaw);
    if (!Number.isFinite(lensWidth) || lensWidth < 30 || lensWidth > 75) {
      addErr('lens_width_mm', lensWidthRaw, `Lens width '${lensWidthRaw}' must be between 30 and 75 mm.`);
    }
    const bridgeWidth = Number(bridgeWidthRaw);
    if (!Number.isFinite(bridgeWidth) || bridgeWidth < 10 || bridgeWidth > 35) {
      addErr('bridge_width_mm', bridgeWidthRaw, `Bridge width '${bridgeWidthRaw}' must be between 10 and 35 mm.`);
    }
    const templeLength = Number(templeLengthRaw);
    if (!Number.isFinite(templeLength) || templeLength < 100 || templeLength > 180) {
      addErr('temple_length_mm', templeLengthRaw, `Temple length '${templeLengthRaw}' must be between 100 and 180 mm.`);
    }

    let frameHeight = null;
    if (frameHeightRaw !== '' && frameHeightRaw !== undefined && frameHeightRaw !== null) {
      frameHeight = Number(frameHeightRaw);
      if (!Number.isFinite(frameHeight) || frameHeight <= 0) {
        addErr('frame_height_mm', frameHeightRaw, `Frame height '${frameHeightRaw}' must be a positive number.`);
      }
    }
    let totalWidth = null;
    if (totalWidthRaw !== '' && totalWidthRaw !== undefined && totalWidthRaw !== null) {
      totalWidth = Number(totalWidthRaw);
      if (!Number.isFinite(totalWidth) || totalWidth <= 0) {
        addErr('total_width_mm', totalWidthRaw, `Total width '${totalWidthRaw}' must be a positive number.`);
      }
    }

    const normalizedFit = normalizeFit(fitRaw);
    if (!normalizedFit) {
      addErr('frame_fit', fitRaw, `Frame fit '${fitRaw}' must be Narrow, Medium, or Wide.`);
    }

    if (!VALID_GENDERS.includes(genderRaw)) {
      addErr('gender', genderRaw, `Gender '${genderRaw}' must be men, women, or unisex.`);
    }

    const brand = refs.brandMap.get(brandName.toLowerCase());
    if (!brand) {
      addErr('brand_name', brandName, `Brand '${brandName}' does not exist. Select an existing brand before continuing.`);
    }

    const shape = refs.shapeMap.get(shapeName.toLowerCase());
    if (!shape) {
      addErr('shape_name', shapeName, `Frame shape '${shapeName}' does not exist. Select an existing shape before continuing.`);
    }

    const category = refs.categoryMap.get(categoryName.toLowerCase());
    if (!category) {
      addErr('category_name', categoryName, `Category '${categoryName}' does not exist. Select an existing category before continuing.`);
    }

    // DB conflict checks
    if (masterSku && refs.existingMasterSkus.has(masterSku.toUpperCase())) {
      addErr('master_sku', masterSku, `Master SKU '${masterSku}' already exists in catalogue.`);
    }
    if (productSlug && refs.existingProductSlugs.has(productSlug)) {
      addErr('product_slug', productSlug, `Product slug '${productSlug}' already exists in catalogue.`);
    }
    if (variantSku && refs.existingVariantSkus.has(variantSku.toUpperCase())) {
      addErr('variant_sku', variantSku, `Variant SKU '${variantSku}' already exists.`);
    }

    if (variantSku) {
      const upperVar = variantSku.toUpperCase();
      if (!seenVariantSkus.has(upperVar)) seenVariantSkus.set(upperVar, []);
      seenVariantSkus.get(upperVar).push(rowNumber);
    }

    if (!rawSlug && productName) {
      warnings.push({
        row_number: rowNumber,
        message: `Row ${rowNumber}: Product slug omitted; derived '${productSlug}'.`
      });
    }

    const entry = {
      rowNumber,
      master_sku: masterSku,
      product_name: productName,
      product_slug: productSlug,
      description,
      brand_id: brand ? brand.id : null,
      brand_name: brand ? brand.name : brandName,
      shape_id: shape ? shape.id : null,
      shape_name: shape ? shape.name : shapeName,
      category_id: category ? category.id : null,
      category_name: category ? category.name : categoryName,
      base_price_inr: Number.isFinite(basePrice) ? Math.round(basePrice) : null,
      gender: genderRaw,
      material,
      frame_fit: normalizedFit,
      lens_width_mm: Number.isFinite(lensWidth) ? Math.round(lensWidth) : null,
      bridge_width_mm: Number.isFinite(bridgeWidth) ? Math.round(bridgeWidth) : null,
      temple_length_mm: Number.isFinite(templeLength) ? Math.round(templeLength) : null,
      frame_height_mm: frameHeight !== null ? Math.round(frameHeight) : null,
      total_width_mm: totalWidth !== null ? Math.round(totalWidth) : null,
      variant_sku: variantSku,
      color_name: colorName,
      color_hex: colorHex,
      color_secondary_hex: colorSecondaryHex || null,
      price_override_inr: priceOverride !== null ? Math.round(priceOverride) : null,
      opening_stock: Number.isInteger(openingStock) ? openingStock : 0,
      is_default: isDefault,
      rowErrors
    };

    normalizedRows.push(entry);

    if (masterSku) {
      const key = masterSku.toUpperCase();
      if (!masterGroups.has(key)) masterGroups.set(key, []);
      masterGroups.get(key).push(entry);
    }
  });

  // Duplicate variant SKU within file
  for (const [varSku, rowNums] of seenVariantSkus.entries()) {
    if (rowNums.length > 1) {
      rowNums.forEach(rn => {
        const entry = normalizedRows.find(r => r.rowNumber === rn);
        const errObj = {
          row_number: rn,
          sku: varSku,
          field_name: 'variant_sku',
          submitted_value: varSku,
          error_message: `Row ${rn}: Duplicate variant SKU '${varSku}' within spreadsheet (rows ${rowNums.join(', ')}).`
        };
        if (entry) entry.rowErrors.push(errObj);
        errors.push(errObj);
      });
    }
  }

  // Master group consistency, slug collision across different master SKUs, and duplicate colorways per master
  const slugToMaster = new Map();
  for (const [masterKey, group] of masterGroups.entries()) {
    const first = group[0];
    const masterSignature = JSON.stringify([
      first.product_name,
      first.product_slug,
      first.brand_name.toLowerCase(),
      first.shape_name.toLowerCase(),
      first.category_name.toLowerCase(),
      first.base_price_inr,
      first.gender,
      first.material,
      first.frame_fit,
      first.lens_width_mm,
      first.bridge_width_mm,
      first.temple_length_mm,
      first.description
    ]);

    let hasGroupConflict = false;
    for (let i = 1; i < group.length; i++) {
      const cur = group[i];
      const curSig = JSON.stringify([
        cur.product_name,
        cur.product_slug,
        cur.brand_name.toLowerCase(),
        cur.shape_name.toLowerCase(),
        cur.category_name.toLowerCase(),
        cur.base_price_inr,
        cur.gender,
        cur.material,
        cur.frame_fit,
        cur.lens_width_mm,
        cur.bridge_width_mm,
        cur.temple_length_mm,
        cur.description
      ]);
      if (curSig !== masterSignature) {
        hasGroupConflict = true;
        break;
      }
    }

    if (hasGroupConflict) {
      group.forEach(entry => {
        const errObj = {
          row_number: entry.rowNumber,
          sku: entry.master_sku,
          field_name: 'master_sku',
          submitted_value: entry.master_sku,
          error_message: `Row ${entry.rowNumber}: Inconsistent master frame details for Master SKU '${entry.master_sku}'. All variants of a frame must share identical master specifications.`
        };
        entry.rowErrors.push(errObj);
        errors.push(errObj);
      });
    }

    // Duplicate color name within same master SKU
    const colorSeen = new Map();
    group.forEach(entry => {
      if (!entry.color_name) return;
      const cKey = entry.color_name.toLowerCase();
      if (colorSeen.has(cKey)) {
        const errObj = {
          row_number: entry.rowNumber,
          sku: entry.variant_sku || entry.master_sku,
          field_name: 'color_name',
          submitted_value: entry.color_name,
          error_message: `Row ${entry.rowNumber}: Duplicate variant colour '${entry.color_name}' for Master SKU '${entry.master_sku}'.`
        };
        entry.rowErrors.push(errObj);
        errors.push(errObj);
      } else {
        colorSeen.set(cKey, entry.rowNumber);
      }
    });

    // Slug conflict across different master SKUs
    if (first.product_slug) {
      const prevMaster = slugToMaster.get(first.product_slug);
      if (prevMaster && prevMaster !== masterKey) {
        group.forEach(entry => {
          const errObj = {
            row_number: entry.rowNumber,
            sku: entry.master_sku,
            field_name: 'product_slug',
            submitted_value: entry.product_slug,
            error_message: `Row ${entry.rowNumber}: Product slug '${entry.product_slug}' is shared by multiple master SKUs (${prevMaster}, ${masterKey}).`
          };
          entry.rowErrors.push(errObj);
          errors.push(errObj);
        });
      } else {
        slugToMaster.set(first.product_slug, masterKey);
      }
    }
  }

  const invalidRowNumbers = new Set(errors.map(e => e.row_number));
  const summary = {
    total_rows: normalizedRows.length,
    frames_detected: masterGroups.size,
    variants_detected: normalizedRows.length,
    valid_rows: normalizedRows.length - invalidRowNumbers.size,
    invalid_rows: invalidRowNumbers.size,
    warning_count: warnings.length,
    blocking_error_count: errors.length,
    opening_stock_records: normalizedRows.filter(r => r.opening_stock > 0).length
  };

  return {
    valid: errors.length === 0 && normalizedRows.length > 0,
    summary,
    errors,
    warnings,
    normalizedRows,
    masterGroups
  };
}

async function persistFailedImportBatch({ batchNumber, idempotencyKey, importType, sourceType, sourceName, user, totalRows, errors }) {
  const uniqueFailedRows = new Set(errors.map(e => e.row_number)).size;
  const result = await db.run(
    `INSERT INTO admin_import_batches (
       batch_number, idempotency_key, import_type, source_type, source_name,
       user_id, username, total_rows, frames_created, variants_created,
       records_updated, records_unchanged, failed_rows, status, summary_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 'failed', ?)`,
    [
      batchNumber,
      idempotencyKey || null,
      importType,
      sourceType,
      sourceName,
      user ? user.id : null,
      user ? user.username : 'Admin',
      totalRows,
      uniqueFailedRows,
      JSON.stringify({ errors: errors.slice(0, 50) })
    ]
  );

  for (const err of errors) {
    await db.run(
      `INSERT INTO admin_import_errors (batch_id, row_number, sku, field_name, submitted_value, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [result.lastID, err.row_number, err.sku || null, err.field_name || null, err.submitted_value || null, err.error_message]
    );
  }
  return result.lastID;
}

/**
 * Commit validated catalogue import atomically.
 */
async function commitCatalogueRows({ rows, sourceType = 'csv', sourceName = 'catalogue_import', idempotencyKey = null, user = null }) {
  if (idempotencyKey) {
    const existingBatch = await db.get('SELECT * FROM admin_import_batches WHERE idempotency_key = ?', [idempotencyKey]);
    if (existingBatch) {
      return {
        idempotent: true,
        already_processed: true,
        batch: existingBatch
      };
    }
  }

  const batchNumber = generateBatchNumber('IMP-CAT');
  let validation;
  let commitResult = null;

  try {
    await db.transaction(async () => {
      validation = await validateCatalogueRows(rows);
      if (!validation.valid) {
        const err = new Error(`Validation failed with ${validation.errors.length} error(s).`);
        err.status = 400;
        err.code = 'CATALOGUE_VALIDATION_FAILED';
        throw err;
      }

      let framesCreated = 0;
      let variantsCreated = 0;

      for (const [, group] of validation.masterGroups.entries()) {
        const master = group[0];
        const prodRes = await db.run(
          `INSERT INTO products (
             brand_id, shape_id, category_id, name, slug, sku, description,
             base_price_inr, gender, material, frame_fit,
             lens_width_mm, bridge_width_mm, temple_length_mm,
             frame_height_mm, total_width_mm, is_active
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            master.brand_id, master.shape_id, master.category_id,
            master.product_name, master.product_slug, master.master_sku, master.description || null,
            master.base_price_inr, master.gender, master.material, master.frame_fit,
            master.lens_width_mm, master.bridge_width_mm, master.temple_length_mm,
            master.frame_height_mm, master.total_width_mm
          ]
        );
        const productId = prodRes.lastID;
        framesCreated++;

        const hasExplicitDefault = group.some(v => v.is_default === 1);
        let defaultAssigned = false;

        for (let idx = 0; idx < group.length; idx++) {
          const variant = group[idx];
          let isDefault = 0;
          if (hasExplicitDefault) {
            if (variant.is_default === 1 && !defaultAssigned) {
              isDefault = 1;
              defaultAssigned = true;
            }
          } else if (idx === 0) {
            isDefault = 1;
          }

          const varRes = await db.run(
            `INSERT INTO product_variants (
               product_id, color_name, color_hex, color_secondary_hex, sku,
               price_override_inr, stock_quantity, is_default, is_active
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [
              productId, variant.color_name, variant.color_hex, variant.color_secondary_hex,
              variant.variant_sku, variant.price_override_inr, variant.opening_stock, isDefault
            ]
          );
          const variantId = varRes.lastID;
          variantsCreated++;

          if (variant.opening_stock > 0) {
            await db.run(
              `INSERT INTO inventory_movements (
                 variant_id, product_id, user_id, username,
                 change_quantity, previous_quantity, new_quantity,
                 movement_type, reason
               ) VALUES (?, ?, ?, ?, ?, 0, ?, 'replenishment', ?)`,
              [
                variantId,
                productId,
                user ? user.id : null,
                user ? user.username : 'Admin',
                variant.opening_stock,
                variant.opening_stock,
                `Opening stock via catalogue import batch ${batchNumber}`
              ]
            );
          }
        }
      }

      const batchInsert = await db.run(
        `INSERT INTO admin_import_batches (
           batch_number, idempotency_key, import_type, source_type, source_name,
           user_id, username, total_rows, frames_created, variants_created,
           records_updated, records_unchanged, failed_rows, status, summary_json
         ) VALUES (?, ?, 'catalogue', ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'completed', ?)`,
        [
          batchNumber,
          idempotencyKey || null,
          sourceType,
          sourceName,
          user ? user.id : null,
          user ? user.username : 'Admin',
          validation.summary.total_rows,
          framesCreated,
          variantsCreated,
          JSON.stringify(validation.summary)
        ]
      );

      commitResult = {
        idempotent: false,
        batch: {
          id: batchInsert.lastID,
          batch_number: batchNumber,
          import_type: 'catalogue',
          source_type: sourceType,
          source_name: sourceName,
          username: user ? user.username : 'Admin',
          total_rows: validation.summary.total_rows,
          frames_created: framesCreated,
          variants_created: variantsCreated,
          failed_rows: 0,
          status: 'completed',
          created_at: new Date().toISOString()
        }
      };
    });
  } catch (err) {
    if (err.code === 'CATALOGUE_VALIDATION_FAILED' && validation) {
      const failedBatchId = await persistFailedImportBatch({
        batchNumber,
        idempotencyKey: null,
        importType: 'catalogue',
        sourceType,
        sourceName,
        user,
        totalRows: validation.summary.total_rows,
        errors: validation.errors
      });
      err.batchId = failedBatchId;
      err.batchNumber = batchNumber;
      err.validation = {
        summary: validation.summary,
        errors: validation.errors
      };
    }
    throw err;
  }

  return commitResult;
}

/**
 * Generate Stock Count CSV sheet from current filtered DB inventory.
 */
async function generateStockCountTemplateCsv({ search, brand_id, category_id, stock_status } = {}) {
  const conditions = ['v.is_active = 1', 'p.is_active = 1'];
  const params = [];

  if (search && String(search).trim()) {
    const term = `%${String(search).trim()}%`;
    conditions.push('(v.sku LIKE ? OR v.color_name LIKE ? OR p.name LIKE ?)');
    params.push(term, term, term);
  }
  if (brand_id) {
    conditions.push('p.brand_id = ?');
    params.push(Number(brand_id));
  }
  if (category_id) {
    conditions.push('p.category_id = ?');
    params.push(Number(category_id));
  }
  if (stock_status === 'low') {
    conditions.push('v.stock_quantity > 0 AND v.stock_quantity <= 5');
  } else if (stock_status === 'out') {
    conditions.push('v.stock_quantity = 0');
  } else if (stock_status === 'in') {
    conditions.push('v.stock_quantity > 5');
  }

  const rows = await db.all(
    `SELECT v.sku AS variant_sku, p.name AS product_name, v.color_name, v.stock_quantity
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.name ASC, v.sku ASC`,
    params
  );

  const csvRows = rows.map(r => [
    r.variant_sku,
    r.product_name,
    r.color_name,
    String(r.stock_quantity),
    '',
    'Physical stock count'
  ]);

  return buildCsvContent(STOCK_TEMPLATE_HEADERS, csvRows);
}

/**
 * Validate bulk stock count rows against live database quantities.
 */
async function validateStockCountRows(rawRows) {
  const dbVariants = await db.all(
    `SELECT v.id AS variant_id, v.product_id, v.sku, v.color_name, v.stock_quantity,
            p.name AS product_name
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     WHERE v.is_active = 1 AND p.is_active = 1`
  );

  const variantBySku = new Map(dbVariants.map(v => [String(v.sku).trim().toUpperCase(), v]));
  const seenSkus = new Map();
  const errors = [];
  const normalizedRows = [];
  let staleConflicts = 0;

  rawRows.forEach((raw, idx) => {
    const rowNumber = Number(raw.rowNumber || idx + 2);
    const variantSku = String(raw.variant_sku || '').trim();
    const expectedRaw = raw.expected_current_quantity;
    const countedRaw = raw.counted_quantity;
    const reason = String(raw.reason || '').trim() || 'Physical stock count';

    const rowErrors = [];
    const addErr = (field, value, msg, isStale = false) => {
      const errObj = {
        row_number: rowNumber,
        sku: variantSku,
        field_name: field,
        submitted_value: value === undefined || value === null ? '' : String(value),
        error_message: `Row ${rowNumber}: ${msg}`,
        is_stale: isStale
      };
      rowErrors.push(errObj);
      errors.push(errObj);
      if (isStale) staleConflicts++;
    };

    if (!variantSku) {
      addErr('variant_sku', variantSku, 'Variant SKU is required.');
    }

    const dbVar = variantSku ? variantBySku.get(variantSku.toUpperCase()) : null;
    if (variantSku && !dbVar) {
      addErr('variant_sku', variantSku, `Variant SKU '${variantSku}' does not exist or is inactive.`);
    }

    if (variantSku) {
      const upperSku = variantSku.toUpperCase();
      if (!seenSkus.has(upperSku)) seenSkus.set(upperSku, []);
      seenSkus.get(upperSku).push(rowNumber);
    }

    if (expectedRaw === '' || expectedRaw === undefined || expectedRaw === null) {
      addErr('expected_current_quantity', expectedRaw, 'Expected current quantity is required for stale-stock safety.');
    }
    const expectedQty = Number(expectedRaw);
    if (expectedRaw !== '' && expectedRaw !== undefined && expectedRaw !== null && (!Number.isInteger(expectedQty) || expectedQty < 0)) {
      addErr('expected_current_quantity', expectedRaw, `Expected quantity '${expectedRaw}' must be a non-negative integer.`);
    }

    if (countedRaw === '' || countedRaw === undefined || countedRaw === null) {
      addErr('counted_quantity', countedRaw, 'Counted quantity is required.');
    }
    const countedQty = Number(countedRaw);
    if (countedRaw !== '' && countedRaw !== undefined && countedRaw !== null && (!Number.isInteger(countedQty) || countedQty < 0)) {
      addErr('counted_quantity', countedRaw, `Counted quantity '${countedRaw}' must be a non-negative whole integer.`);
    }

    if (dbVar && Number.isInteger(expectedQty) && expectedQty >= 0 && dbVar.stock_quantity !== expectedQty) {
      addErr(
        'expected_current_quantity',
        expectedRaw,
        `Stale stock detected for '${variantSku}': spreadsheet expected ${expectedQty}, but database currently holds ${dbVar.stock_quantity}. Download a fresh count sheet before committing.`,
        true
      );
    }

    const previousQty = dbVar ? dbVar.stock_quantity : null;
    const diff = (dbVar && Number.isInteger(countedQty) && countedQty >= 0) ? (countedQty - dbVar.stock_quantity) : null;
    let statusLabel = 'Invalid';
    if (rowErrors.some(e => e.is_stale)) statusLabel = 'Stale Conflict';
    else if (rowErrors.length > 0) statusLabel = 'Invalid';
    else if (diff > 0) statusLabel = 'Increase';
    else if (diff < 0) statusLabel = 'Decrease';
    else statusLabel = 'Unchanged';

    normalizedRows.push({
      rowNumber,
      variant_id: dbVar ? dbVar.variant_id : null,
      product_id: dbVar ? dbVar.product_id : null,
      variant_sku: dbVar ? dbVar.sku : variantSku,
      product_name: dbVar ? dbVar.product_name : String(raw.product_name || ''),
      color_name: dbVar ? dbVar.color_name : String(raw.color_name || ''),
      expected_current_quantity: Number.isInteger(expectedQty) ? expectedQty : null,
      database_quantity: previousQty,
      counted_quantity: Number.isInteger(countedQty) ? countedQty : null,
      difference: diff,
      result: statusLabel,
      reason,
      rowErrors
    });
  });

  // Duplicate SKU check inside upload
  for (const [sku, rowNums] of seenSkus.entries()) {
    if (rowNums.length > 1) {
      rowNums.forEach(rn => {
        const entry = normalizedRows.find(r => r.rowNumber === rn);
        const errObj = {
          row_number: rn,
          sku,
          field_name: 'variant_sku',
          submitted_value: sku,
          error_message: `Row ${rn}: Duplicate variant SKU '${sku}' found on rows ${rowNums.join(', ')}.`,
          is_stale: false
        };
        if (entry) {
          entry.rowErrors.push(errObj);
          entry.result = 'Invalid';
        }
        errors.push(errObj);
      });
    }
  }

  const invalidRowNumbers = new Set(errors.map(e => e.row_number));
  const summary = {
    total_skus: normalizedRows.length,
    increases: normalizedRows.filter(r => r.rowErrors.length === 0 && r.difference > 0).length,
    decreases: normalizedRows.filter(r => r.rowErrors.length === 0 && r.difference < 0).length,
    unchanged: normalizedRows.filter(r => r.rowErrors.length === 0 && r.difference === 0).length,
    invalid_records: invalidRowNumbers.size,
    stale_conflicts: staleConflicts
  };

  return {
    valid: errors.length === 0 && normalizedRows.length > 0,
    has_stale_conflicts: staleConflicts > 0,
    summary,
    errors,
    normalizedRows
  };
}

/**
 * Commit bulk stock count updates all-or-nothing in a serialized SQLite transaction.
 */
async function commitStockCountRows({ rows, sourceType = 'csv', sourceName = 'stock_count_import', idempotencyKey = null, user = null }) {
  if (idempotencyKey) {
    const existingBatch = await db.get('SELECT * FROM admin_import_batches WHERE idempotency_key = ?', [idempotencyKey]);
    if (existingBatch) {
      return {
        idempotent: true,
        already_processed: true,
        batch: existingBatch
      };
    }
  }

  const batchNumber = generateBatchNumber('IMP-STK');
  let validation;
  let commitResult = null;

  try {
    await db.transaction(async () => {
      validation = await validateStockCountRows(rows);
      if (!validation.valid) {
        const err = new Error(
          validation.has_stale_conflicts
            ? 'Stale stock conflict detected. Another update changed database stock quantities. Batch rolled back.'
            : `Stock count validation failed with ${validation.errors.length} error(s).`
        );
        err.status = validation.has_stale_conflicts ? 409 : 400;
        err.code = validation.has_stale_conflicts ? 'STALE_STOCK_CONFLICT' : 'STOCK_VALIDATION_FAILED';
        throw err;
      }

      let updatedCount = 0;
      let unchangedCount = 0;

      for (const row of validation.normalizedRows) {
        if (row.difference === 0) {
          unchangedCount++;
          continue;
        }

        await db.run(
          'UPDATE product_variants SET stock_quantity = ? WHERE id = ?',
          [row.counted_quantity, row.variant_id]
        );

        const movementType = row.difference > 0 ? 'replenishment' : 'manual_adjustment';
        await db.run(
          `INSERT INTO inventory_movements (
             variant_id, product_id, user_id, username,
             change_quantity, previous_quantity, new_quantity,
             movement_type, reason
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.variant_id,
            row.product_id,
            user ? user.id : null,
            user ? user.username : 'Staff',
            row.difference,
            row.database_quantity,
            row.counted_quantity,
            movementType,
            `${row.reason} (Batch ${batchNumber})`
          ]
        );
        updatedCount++;
      }

      const batchInsert = await db.run(
        `INSERT INTO admin_import_batches (
           batch_number, idempotency_key, import_type, source_type, source_name,
           user_id, username, total_rows, frames_created, variants_created,
           records_updated, records_unchanged, failed_rows, status, summary_json
         ) VALUES (?, ?, 'stock_count', ?, ?, ?, ?, ?, 0, 0, ?, ?, 0, 'completed', ?)`,
        [
          batchNumber,
          idempotencyKey || null,
          sourceType,
          sourceName,
          user ? user.id : null,
          user ? user.username : 'Staff',
          validation.summary.total_skus,
          updatedCount,
          unchangedCount,
          JSON.stringify(validation.summary)
        ]
      );

      commitResult = {
        idempotent: false,
        batch: {
          id: batchInsert.lastID,
          batch_number: batchNumber,
          import_type: 'stock_count',
          source_type: sourceType,
          source_name: sourceName,
          username: user ? user.username : 'Staff',
          total_rows: validation.summary.total_skus,
          records_updated: updatedCount,
          records_unchanged: unchangedCount,
          failed_rows: 0,
          status: 'completed',
          created_at: new Date().toISOString()
        }
      };
    });
  } catch (err) {
    if ((err.code === 'STALE_STOCK_CONFLICT' || err.code === 'STOCK_VALIDATION_FAILED') && validation) {
      const failedBatchId = await persistFailedImportBatch({
        batchNumber,
        idempotencyKey: null,
        importType: 'stock_count',
        sourceType,
        sourceName,
        user,
        totalRows: validation.summary.total_skus,
        errors: validation.errors
      });
      err.batchId = failedBatchId;
      err.batchNumber = batchNumber;
      err.validation = {
        summary: validation.summary,
        errors: validation.errors
      };
    }
    throw err;
  }

  return commitResult;
}

async function listImportHistory({ importType = '', limit = 50 } = {}) {
  const conditions = [];
  const params = [];
  if (importType) {
    conditions.push('import_type = ?');
    params.push(importType);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(Number(limit) || 50);

  return db.all(
    `SELECT * FROM admin_import_batches ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ?`,
    params
  );
}

async function getImportBatchReport(batchId) {
  const batch = await db.get(
    'SELECT * FROM admin_import_batches WHERE id = ? OR batch_number = ?',
    [Number(batchId) || 0, String(batchId)]
  );
  if (!batch) return null;

  const errors = await db.all(
    'SELECT row_number, sku, field_name, submitted_value, error_message FROM admin_import_errors WHERE batch_id = ? ORDER BY row_number ASC, id ASC',
    [batch.id]
  );

  const csv = buildCsvContent(
    ['row_number', 'sku', 'field_name', 'error_message', 'submitted_value'],
    errors.map(e => [e.row_number, e.sku || '', e.field_name || '', e.error_message, e.submitted_value || ''])
  );

  return { batch, errors, csv };
}

module.exports = {
  CATALOGUE_TEMPLATE_HEADERS,
  STOCK_TEMPLATE_HEADERS,
  generateCatalogueTemplateCsv,
  validateCatalogueRows,
  commitCatalogueRows,
  generateStockCountTemplateCsv,
  validateStockCountRows,
  commitStockCountRows,
  listImportHistory,
  getImportBatchReport
};
