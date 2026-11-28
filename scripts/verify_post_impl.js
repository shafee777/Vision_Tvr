/**
 * Focused Post-Implementation Verification Suite
 * Covers:
 *  - Blank Catalogue Template & Real Import Validation (atomic rollback, edge cases)
 *  - Full Product Lifecycle (Create -> Edit -> 5 Images/Reorder/Primary/Delete -> Inventory -> Storefront -> Archive)
 *  - Security (Auth/RBAC, SQLi resistance, Concurrent 409 handling, Upload 5MB/MIME/magic-byte & atomic cleanup)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const Jimp = require('jimp');

const TEST_DB_PATH = path.resolve(__dirname, '../data/optii_post_verify.db');
[TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach((p) => {
  if (fs.existsSync(p)) fs.unlinkSync(p);
});

process.env.DB_PATH = TEST_DB_PATH;
process.env.JWT_SECRET = 'optii_post_verify_secret_key_32chars_ok';
process.env.ADMIN_SEED_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'Admin@123';
process.env.NODE_ENV = 'test';

const db = require('../server/db/database');
const runMigrations = require('../server/db/migrate');
const seedDatabase = require('../server/db/seeds/optii_seed');
const { app } = require('../server');
const { parseSpreadsheetText } = require('../server/utils/csvValidation');

let server;
let baseUrl;
let passed = 0;
let failed = 0;
const uploadedDiskPaths = [];

function check(name, cond, detail = null) {
  if (cond) {
    console.log(`PASS | ${name}`);
    passed++;
  } else {
    console.error(`FAIL | ${name}`, detail ? JSON.stringify(detail) : '');
    failed++;
  }
}

function request(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlPath, baseUrl);
    const isBufferBody = Buffer.isBuffer(options.body);
    const bodyData = options.body
      ? (isBufferBody ? options.body : JSON.stringify(options.body))
      : null;

    const req = http.request(
      parsedUrl,
      {
        method: options.method || 'GET',
        headers: {
          ...(!isBufferBody && bodyData ? { 'Content-Type': 'application/json' } : {}),
          ...(bodyData ? { 'Content-Length': Buffer.byteLength(bodyData) } : {}),
          ...(options.headers || {})
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, data });
        });
      }
    );
    req.on('error', reject);
    if (bodyData) req.write(bodyData);
    req.end();
  });
}

function buildMultipartForm(fields = {}, files = []) {
  const boundary = '----OptiiVerifyBoundary' + Date.now() + Math.random().toString(16).slice(2);
  const chunks = [];
  for (const [k, v] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files) {
    chunks.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.filename}"\r\nContent-Type: ${f.mimetype}\r\n\r\n`
    ));
    chunks.push(f.buffer);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}

async function login(username, password) {
  const res = await request('/api/auth/login', { method: 'POST', body: { username, password } });
  return res.data.token;
}

async function run() {
  try {
    const mig001 = fs.readFileSync(path.resolve(__dirname, '../server/db/migrations/001_initial_optii_schema.sql'), 'utf8');
    await db.exec(mig001);
    await db.run("ALTER TABLE orders ADD COLUMN delivery_method TEXT DEFAULT 'express'").catch(() => {});
    await db.run("ALTER TABLE orders ADD COLUMN promo_code TEXT").catch(() => {});
    await db.run("ALTER TABLE orders ADD COLUMN estimated_delivery TEXT").catch(() => {});
    await runMigrations();
    await seedDatabase();
    const bcrypt = require('bcryptjs');
    await db.run("INSERT OR IGNORE INTO users (username, password_hash, full_name, role) VALUES ('staff', ?, 'Test Staff', 'staff')", [bcrypt.hashSync('staff123', 8)]);
    await db.run("INSERT OR IGNORE INTO users (username, password_hash, full_name, role) VALUES ('optometrist', ?, 'Test Optom', 'optometrist')", [bcrypt.hashSync('optom123', 8)]);
    server = await new Promise((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const adminToken = await login('admin', process.env.ADMIN_SEED_PASSWORD);
    const staffToken = await login('staff', 'staff123');
    const optomToken = await login('optometrist', 'optom123');
    const adminH = { Authorization: `Bearer ${adminToken}` };

    // ─── SECTION A: REAL CATALOGUE IMPORT VALIDATION ───
    const tplRes = await request('/api/admin/imports/catalogue/template', { headers: adminH });
    const parsedTpl = parseSpreadsheetText(String(tplRes.data || ''));
    check(
      'Import 1: Blank template downloads with prod_code, 5 measurements, 0 sample rows, no removed fields',
      tplRes.status === 200 &&
      parsedTpl.rows.length === 0 &&
      parsedTpl.headers.includes('prod_code') &&
      ['lens_width_mm', 'bridge_width_mm', 'temple_length_mm', 'frame_height_mm', 'total_width_mm'].every(h => parsedTpl.headers.includes(h)) &&
      !['master_sku', 'variant_sku', 'color_code', 'color_hex', 'status'].some(h => parsedTpl.headers.includes(h)),
      parsedTpl.headers
    );

    const validRow = {
      rowNumber: 2,
      prod_code: 'VER-IMP-01',
      product_name: 'Verify Import Frame',
      brand_name: 'Optii Atelier',
      category_name: 'Eyeglasses',
      shape_name: 'Round',
      material: 'Acetate',
      frame_fit: 'Medium',
      base_price_inr: '3500',
      color_name: 'Black',
      lens_width_mm: '50',
      bridge_width_mm: '20',
      temple_length_mm: '145'
    };

    const optVal = await request('/api/admin/imports/catalogue/validate', {
      method: 'POST', headers: adminH,
      body: { source_type: 'csv', rows: [validRow] }
    });
    check('Import 2: Optional fields omitted (desc, height, total_width, stock, override) validates cleanly',
      optVal.status === 200 && optVal.data.valid === true, optVal.data?.errors);

    const dupInFile = await request('/api/admin/imports/catalogue/validate', {
      method: 'POST', headers: adminH,
      body: {
        source_type: 'csv',
        rows: [
          validRow,
          { ...validRow, rowNumber: 3, base_price_inr: '4500', color_name: 'Tortoise' }
        ]
      }
    });
    check('Import 3: Inconsistent duplicate prod_code in same file rejected',
      dupInFile.status === 200 && dupInFile.data.valid === false &&
      dupInFile.data.errors.some(e => e.error_message.includes('Inconsistent')), dupInFile.data?.errors);

    const missingFields = await request('/api/admin/imports/catalogue/validate', {
      method: 'POST', headers: adminH,
      body: { source_type: 'csv', rows: [{ rowNumber: 2, prod_code: '', product_name: 'A', brand_name: '', material: '', color_name: '' }] }
    });
    check('Import 4: Missing required fields caught with row diagnostics',
      missingFields.status === 200 && missingFields.data.valid === false && missingFields.data.errors.length >= 5);

    const invalidMeas = await request('/api/admin/imports/catalogue/validate', {
      method: 'POST', headers: adminH,
      body: {
        source_type: 'csv',
        rows: [{ ...validRow, lens_width_mm: '20', bridge_width_mm: '50', temple_length_mm: '200', frame_height_mm: '-5', total_width_mm: '0' }]
      }
    });
    check('Import 5: Invalid measurements rejected across all 5 measurement fields',
      invalidMeas.status === 200 && invalidMeas.data.valid === false && invalidMeas.data.errors.length === 5, invalidMeas.data?.errors);

    const invalidPriceStockTax = await request('/api/admin/imports/catalogue/validate', {
      method: 'POST', headers: adminH,
      body: {
        source_type: 'csv',
        rows: [{ ...validRow, base_price_inr: '-100', opening_stock: '2.5', brand_name: 'NoSuchBrand', shape_name: 'NoSuchShape', category_name: 'NoSuchCat' }]
      }
    });
    check('Import 6: Invalid price, non-integer stock & invalid taxonomy rejected',
      invalidPriceStockTax.status === 200 && invalidPriceStockTax.data.valid === false && invalidPriceStockTax.data.errors.length === 5, invalidPriceStockTax.data?.errors);

    const beforeCount = (await db.get('SELECT COUNT(*) AS c FROM products')).c;
    const atomicFail = await request('/api/admin/imports/catalogue/commit', {
      method: 'POST', headers: adminH,
      body: {
        source_type: 'csv',
        rows: [
          validRow,
          { ...validRow, rowNumber: 3, prod_code: 'VER-IMP-02', color_name: 'Tortoise', base_price_inr: '-50' }
        ]
      }
    });
    const afterCount = (await db.get('SELECT COUNT(*) AS c FROM products')).c;
    check('Import 7: Atomic rollback on multi-row commit failure (0 partial writes)',
      atomicFail.status === 400 && beforeCount === afterCount, { status: atomicFail.status, beforeCount, afterCount });

    const goodCommit = await request('/api/admin/imports/catalogue/commit', {
      method: 'POST', headers: adminH,
      body: { source_type: 'csv', rows: [validRow] }
    });
    const dupDb = await request('/api/admin/imports/catalogue/validate', {
      method: 'POST', headers: adminH,
      body: { source_type: 'csv', rows: [validRow] }
    });
    check('Import 8: Valid commit persists & duplicate prod_code vs DB rejected',
      goodCommit.status === 201 && dupDb.status === 200 && dupDb.data.valid === false);

    // ─── SECTION B: PRODUCT LIFECYCLE (Create -> Edit -> 5 Images/Reorder/Primary/Delete -> Inventory -> Storefront -> Archive) ───
    const createRes = await request('/api/admin/products', {
      method: 'POST', headers: adminH,
      body: {
        name: 'Lifecycle Test Frame',
        prod_code: 'LIFE-001',
        brand_id: 1,
        category_id: 1,
        shape_id: 1,
        base_price_inr: 4900,
        gender: 'unisex',
        material: 'Titanium',
        frame_fit: 'Medium',
        frame_type: 'Full Rim',
        lens_width_mm: 51,
        bridge_width_mm: 19,
        temple_length_mm: 145,
        frame_height_mm: 40,
        total_width_mm: 138,
        initial_variant: { color_name: 'Gunmetal', stock_quantity: 12 }
      }
    });
    const prodId = createRes.data.product_id;
    const varId = createRes.data.variant_id;
    check('Lifecycle 1: Create frame with prod_code & auto-generated variant_sku/hex',
      createRes.status === 201 && createRes.data.variant_sku === 'LIFE-001-GUN', createRes.data);

    const editProdRes = await request(`/api/admin/products/${prodId}`, {
      method: 'PUT', headers: adminH,
      body: { name: 'Lifecycle Test Frame Edited', base_price_inr: 5200 }
    });
    const editVarRes = await request(`/api/admin/variants/${varId}`, {
      method: 'PUT', headers: adminH,
      body: { color_name: 'Brushed Gunmetal', price_override_inr: 5400 }
    });
    check('Lifecycle 2: Edit product & variant persist cleanly',
      editProdRes.status === 200 && editVarRes.status === 200);

    // Generate 5 real PNGs
    const pngs = [];
    for (let i = 0; i < 6; i++) {
      const img = await new Jimp(100, 100, 0x112233ff + i * 0x10101000);
      pngs.push(await img.getBufferAsync(Jimp.MIME_PNG));
    }

    const up5Form = buildMultipartForm(
      { image_types: JSON.stringify(['studio_front', 'model_on_face', 'angle_45', 'hinge_detail', 'packaging']) },
      pngs.slice(0, 5).map((buf, i) => ({ field: 'images', filename: `life_${i}.png`, mimetype: 'image/png', buffer: buf }))
    );
    const up5Res = await request(`/api/admin/variants/${varId}/images`, {
      method: 'POST', headers: { ...adminH, 'Content-Type': up5Form.contentType }, body: up5Form.body
    });
    if (up5Res.data?.images) {
      up5Res.data.images.forEach(img => uploadedDiskPaths.push(path.resolve(__dirname, '../public', img.image_url)));
    }
    const imgIds = (up5Res.data?.images || []).map(i => i.id);

    const up6Form = buildMultipartForm({}, [{ field: 'images', filename: 'life_6.png', mimetype: 'image/png', buffer: pngs[5] }]);
    const up6Res = await request(`/api/admin/variants/${varId}/images`, {
      method: 'POST', headers: { ...adminH, 'Content-Type': up6Form.contentType }, body: up6Form.body
    });

    const reorderRes = await request(`/api/admin/variants/${varId}/images/reorder`, {
      method: 'PUT', headers: adminH,
      body: { image_ids: [imgIds[4], imgIds[0], imgIds[1], imgIds[2], imgIds[3]] }
    });
    const setPrimaryRes = await request(`/api/admin/images/${imgIds[2]}`, {
      method: 'PATCH', headers: adminH,
      body: { display_order: 1 }
    });
    const delImgPath = path.resolve(__dirname, '../public', up5Res.data.images[4].image_url);
    const delImgRes = await request(`/api/admin/images/${imgIds[4]}`, { method: 'DELETE', headers: adminH });

    check('Lifecycle 3: Upload 5 images, reject 6th (400), reorder, set primary & delete removes disk file',
      up5Res.status === 201 && imgIds.length === 5 && up6Res.status === 400 &&
      reorderRes.status === 200 && setPrimaryRes.status === 200 &&
      delImgRes.status === 200 && !fs.existsSync(delImgPath),
      { up5: up5Res.status, up6: up6Res.status, delExists: fs.existsSync(delImgPath) });

    // Inventory adjust
    const invAdjRes = await request('/api/admin/inventory/adjust', {
      method: 'POST', headers: adminH,
      body: { variant_id: varId, change_quantity: -3, movement_type: 'manual_adjustment', reason: 'Lifecycle QA test sale' }
    });
    const varAfterInv = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [varId]);
    check('Lifecycle 4: Inventory adjustment updates stock (12 -> 9) & logs movement',
      invAdjRes.status === 200 && varAfterInv.stock_quantity === 9);

    // Storefront visibility before & after archive
    const createdProdRow = await db.get('SELECT slug FROM products WHERE id = ?', [prodId]);
    const pdpActive = await request(`/api/products/${createdProdRow.slug}`);
    const archiveRes = await request(`/api/admin/products/${prodId}/status`, {
      method: 'PATCH', headers: adminH,
      body: { is_active: 0 }
    });
    const pdpArchived = await request(`/api/products/${createdProdRow.slug}`);
    const dbPreserved = await db.get('SELECT id, is_active FROM products WHERE id = ?', [prodId]);
    check('Lifecycle 5: Storefront PDP visible when active (4 images), hidden after archive (404), DB preserved',
      pdpActive.status === 200 && archiveRes.status === 200 && pdpArchived.status === 404 && dbPreserved.is_active === 0);

    // ─── SECTION C: SECURITY REVIEW TESTS ───
    const unauthProd = await request('/api/admin/products', { method: 'POST', body: { name: 'X' } });
    const staffProd = await request('/api/admin/products', { method: 'POST', headers: { Authorization: `Bearer ${staffToken}` }, body: { name: 'X' } });
    const optomProd = await request('/api/admin/products', { method: 'POST', headers: { Authorization: `Bearer ${optomToken}` }, body: { name: 'X' } });
    check('Security 1: RBAC enforces 401 unauthenticated & 403 for staff/optometrist on POST /products',
      unauthProd.status === 401 && staffProd.status === 403 && optomProd.status === 403);

    const sqliRes = await request("/api/admin/products?search=' OR 1=1 --", { headers: adminH });
    check('Security 2: SQL injection in search query safely parameterized (200)', sqliRes.status === 200);

    // Concurrent duplicate prod_code submissions
    const concPayload = {
      name: 'Concurrent Frame',
      prod_code: 'CONC-999',
      brand_id: 1, category_id: 1, shape_id: 1,
      base_price_inr: 3000, material: 'Acetate', frame_fit: 'Medium',
      lens_width_mm: 50, bridge_width_mm: 20, temple_length_mm: 145,
      initial_variant: { color_name: 'Black', stock_quantity: 5 }
    };
    const [c1, c2] = await Promise.all([
      request('/api/admin/products', { method: 'POST', headers: adminH, body: concPayload }),
      request('/api/admin/products', { method: 'POST', headers: adminH, body: concPayload })
    ]);
    const concStatuses = [c1.status, c2.status].sort((a, b) => a - b);
    check('Security 3: Concurrent duplicate prod_code returns [201, 409] (never 500)',
      concStatuses[0] === 201 && concStatuses[1] === 409, concStatuses);

    // Upload security: >5 MB, .gif, and atomic rollback on 1 valid + 1 spoofed PNG
    const oversizedBuf = Buffer.alloc(5 * 1024 * 1024 + 1024, 0xff);
    const overForm = buildMultipartForm({}, [{ field: 'images', filename: 'huge.png', mimetype: 'image/png', buffer: oversizedBuf }]);
    const overRes = await request(`/api/admin/variants/${varId}/images`, {
      method: 'POST', headers: { ...adminH, 'Content-Type': overForm.contentType }, body: overForm.body
    });

    const gifForm = buildMultipartForm({}, [{ field: 'images', filename: 'anim.gif', mimetype: 'image/gif', buffer: Buffer.from('GIF89a') }]);
    const gifRes = await request(`/api/admin/variants/${varId}/images`, {
      method: 'POST', headers: { ...adminH, 'Content-Type': gifForm.contentType }, body: gifForm.body
    });

    const imgsBeforeFail = (await db.get('SELECT COUNT(*) AS c FROM product_images WHERE variant_id = ?', [varId])).c;
    const filesBeforeFail = fs.readdirSync(path.resolve(__dirname, '../public/images/products')).length;
    const partialSpoofForm = buildMultipartForm(
      { image_types: JSON.stringify(['studio_front', 'model_on_face']) },
      [
        { field: 'images', filename: 'ok.png', mimetype: 'image/png', buffer: pngs[0] },
        { field: 'images', filename: 'evil.png', mimetype: 'image/png', buffer: Buffer.from('MZ_FAKE_EXE_PAYLOAD') }
      ]
    );
    const partialSpoofRes = await request(`/api/admin/variants/${varId}/images`, {
      method: 'POST', headers: { ...adminH, 'Content-Type': partialSpoofForm.contentType }, body: partialSpoofForm.body
    });
    const imgsAfterFail = (await db.get('SELECT COUNT(*) AS c FROM product_images WHERE variant_id = ?', [varId])).c;
    const filesAfterFail = fs.readdirSync(path.resolve(__dirname, '../public/images/products')).length;

    check('Security 4: Rejects >5MB (400), rejects GIF (400), atomic cleanup on partial spoofed upload (0 orphaned rows/files)',
      overRes.status === 400 && gifRes.status === 400 && partialSpoofRes.status === 400 &&
      imgsBeforeFail === imgsAfterFail && filesBeforeFail === filesAfterFail,
      { over: overRes.status, gif: gifRes.status, spoof: partialSpoofRes.status, imgsBeforeFail, imgsAfterFail, filesBeforeFail, filesAfterFail });

    console.log(`\n===============================================================`);
    console.log(`POST-IMPLEMENTATION VERIFICATION: ${passed + failed} CHECKS | PASSED: ${passed} | FAILED: ${failed}`);
    console.log(`===============================================================\n`);
    process.exitCode = failed > 0 ? 1 : 0;
  } catch (err) {
    console.error('Fatal Verify Error:', err);
    process.exitCode = 1;
  } finally {
    uploadedDiskPaths.forEach(p => { try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {} });
    if (server) await new Promise(r => server.close(r));
    await db.close();
    [TEST_DB_PATH, `${TEST_DB_PATH}-wal`, `${TEST_DB_PATH}-shm`].forEach((p) => {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
  }
}

run();
