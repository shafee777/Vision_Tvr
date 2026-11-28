/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII ADMIN IMPROVEMENTS & STOREFRONT SYNC — ISOLATED INTEGRATION TESTS
 * Tests Taxonomy CRUD, Single Frame + 1-5 Images, Reorder, Friendly CSV,
 * Lens Step 1-4 CRUD, Store Settings/Logo Sync & Security Guards.
 * ═════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const Jimp = require('jimp');

const TEST_DB_PATH = path.resolve(__dirname, '../data/optii_improvements_test.db');
for (const ext of ['', '-wal', '-shm']) {
  const f = TEST_DB_PATH + ext;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

process.env.NODE_ENV = 'test';
process.env.DB_PATH = TEST_DB_PATH;
process.env.ADMIN_SEED_PASSWORD = 'test_admin_password_2026';

const runMigrations = require('../server/db/migrate');
const seedOptii = require('../server/db/seeds/optii_seed');
const db = require('../server/db/database');
const { app } = require('../server');
const { parseSpreadsheetText } = require('../server/utils/csvValidation');

const TEST_PORT = 5059;
let server = null;
const cleanupDiskFiles = [];

function request(urlPath, options = {}) {
  return new Promise((resolve) => {
    const method = options.method || 'GET';
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body && typeof body === 'object' && !(body instanceof Buffer)) {
      body = JSON.stringify(body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) headers['Content-Length'] = 0;

    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path: urlPath,
      method,
      headers,
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, data: parsed });
      });
    });
    req.on('error', err => resolve({ status: 0, error: err.message }));
    if (body) req.write(body);
    req.end();
  });
}

function multipartRequest(urlPath, headers, parts) {
  return new Promise((resolve) => {
    const boundary = `----OptiiTestBoundary${Date.now()}`;
    const chunks = [];

    for (const part of parts) {
      let headerStr = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
      if (part.filename) {
        headerStr += `; filename="${part.filename}"\r\nContent-Type: ${part.contentType || 'application/octet-stream'}`;
      }
      headerStr += '\r\n\r\n';
      chunks.push(Buffer.from(headerStr, 'utf8'));
      chunks.push(Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value), 'utf8'));
      chunks.push(Buffer.from('\r\n', 'utf8'));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    const payload = Buffer.concat(chunks);

    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path: urlPath,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': payload.length
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, data: parsed });
      });
    });
    req.on('error', err => resolve({ status: 0, error: err.message }));
    req.write(payload);
    req.end();
  });
}

async function createSamplePngBuffer(colorHex = 0x111827ff) {
  const img = new Jimp(120, 120, colorHex);
  return img.getBufferAsync(Jimp.MIME_PNG);
}

async function runTests() {
  const results = [];
  function check(name, passed, detail = '') {
    results.push({ name, passed });
    console.log(`${passed ? '✅ PASS' : '❌ FAIL'} | ${name}${!passed && detail ? ` -> ${JSON.stringify(detail)}` : ''}`);
  }

  try {
    const mig001 = fs.readFileSync(path.resolve(__dirname, '../server/db/migrations/001_initial_optii_schema.sql'), 'utf8');
    await db.exec(mig001);
    await db.run("ALTER TABLE orders ADD COLUMN delivery_method TEXT DEFAULT 'express'").catch(() => {});
    await db.run("ALTER TABLE orders ADD COLUMN promo_code TEXT").catch(() => {});
    await db.run("ALTER TABLE orders ADD COLUMN estimated_delivery TEXT").catch(() => {});
    await runMigrations();
    await seedOptii();
    const bcrypt = require('bcryptjs');
    const stHash = bcrypt.hashSync('staff_test_123', 8);
    await db.run("UPDATE users SET password_hash = ? WHERE username = 'staff'", [stHash]);
    server = app.listen(TEST_PORT);
    await new Promise(r => setTimeout(r, 300));

    const pngBuf = await createSamplePngBuffer();
    const fakePngBuf = Buffer.from('NOT_A_REAL_PNG_SPOOFED_EXECUTABLE_CONTENT');

    const adminLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'test_admin_password_2026' } });
    const staffLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'staff', password: 'staff_test_123' } });
    const adminH = { Authorization: `Bearer ${adminLogin.data.token}` };
    const staffH = { Authorization: `Bearer ${staffLogin.data.token}` };

    // ─── 1. TAXONOMY CRUD + LOGO + SAFEGUARDS ───
    const brandAdd = await request('/api/admin/brands', {
      method: 'POST', headers: adminH,
      body: { name: 'Lindberg Nordic', slug: 'lindberg-nordic', description: 'Ultralight titanium', is_active: 1 }
    });
    const brandId = brandAdd.data.brand_id;
    const brandEdit = await request(`/api/admin/brands/${brandId}`, {
      method: 'PUT', headers: adminH,
      body: { name: 'Lindberg Titanium', slug: 'lindberg-nordic', description: 'Updated titanium', is_active: 1 }
    });
    const brandLogoOk = await multipartRequest(`/api/admin/brands/${brandId}/logo`, adminH, [
      { name: 'logo', filename: 'brand.png', contentType: 'image/png', value: pngBuf }
    ]);
    if (brandLogoOk.data?.logo_url) {
      cleanupDiskFiles.push(path.join(__dirname, '../public', brandLogoOk.data.logo_url.replace(/^\//, '')));
    }
    const brandLogoSpoof = await multipartRequest(`/api/admin/brands/${brandId}/logo`, adminH, [
      { name: 'logo', filename: 'evil.png', contentType: 'image/png', value: fakePngBuf }
    ]);
    const refBrandDel = await request('/api/admin/brands/1', { method: 'DELETE', headers: adminH });

    check('Taxonomy Brand: Create, edit, real logo upload, spoof reject (400), referenced delete block (409)',
      brandAdd.status === 201 && brandEdit.status === 200 && brandLogoOk.status === 200 && brandLogoSpoof.status === 400 && refBrandDel.status === 409,
      { brandAdd: brandAdd.status, brandEdit: brandEdit.status, brandLogoOk: brandLogoOk.status, brandLogoSpoof: brandLogoSpoof.status, refBrandDel: refBrandDel.status }
    );

    const shapeAdd = await request('/api/admin/shapes', {
      method: 'POST', headers: adminH,
      body: { name: 'Wayfarer', slug: 'wayfarer', display_order: 7, is_active: 1 }
    });
    const shapeXss = await request('/api/admin/shapes', {
      method: 'POST', headers: adminH,
      body: { name: 'Evil', slug: 'evil', icon_svg: '<svg onload="alert(1)"><script>x</script></svg>' }
    });
    const shapeEdit = await request(`/api/admin/shapes/${shapeAdd.data.shape_id}`, {
      method: 'PUT', headers: adminH,
      body: { name: 'Classic Wayfarer', slug: 'wayfarer', display_order: 8, is_active: 1 }
    });

    const catAdd = await request('/api/admin/categories', {
      method: 'POST', headers: adminH,
      body: { name: 'Computer Glasses', slug: 'computer-glasses', category_type: 'glasses', gender: 'unisex', description: 'Blue light filter', display_order: 7, is_active: 1 }
    });
    const catEdit = await request(`/api/admin/categories/${catAdd.data.category_id}`, {
      method: 'PUT', headers: adminH,
      body: { name: 'Blue-Cut Eyewear', slug: 'computer-glasses', category_type: 'glasses', gender: 'unisex', description: 'Screen glasses', display_order: 7, is_active: 1 }
    });
    const catRefDel = await request('/api/admin/categories/1', { method: 'DELETE', headers: adminH });
    const pubCats = await request('/api/categories');

    check('Taxonomy Shape & Category: Full CRUD, XSS SVG reject (400), referenced category block (409), public API reflects new category',
      shapeAdd.status === 201 && shapeXss.status === 400 && shapeEdit.status === 200 &&
      catAdd.status === 201 && catEdit.status === 200 && catRefDel.status === 409 &&
      pubCats.data.categories.some(c => c.slug === 'computer-glasses'),
      { shapeAdd: shapeAdd.status, shapeXss: shapeXss.status, catAdd: catAdd.status, catRefDel: catRefDel.status }
    );

    // ─── 2. SINGLE FRAME + 1-5 IMAGES + REORDER + GALLERY ───
    const prodCreate = await request('/api/admin/products', {
      method: 'POST', headers: adminH,
      body: {
        name: 'Nordic Titan Pro',
        slug: 'nordic-titan-pro',
        sku: 'NRD-TTN-01',
        brand_id: brandId,
        category_id: catAdd.data.category_id,
        shape_id: shapeAdd.data.shape_id,
        frame_type: 'Semi-Rimless',
        gender: 'unisex',
        base_price_inr: 7900,
        material: 'Japanese Titanium',
        frame_fit: 'Medium',
        lens_width_mm: 52,
        bridge_width_mm: 18,
        temple_length_mm: 145,
        frame_height_mm: 40,
        total_width_mm: 140,
        description: 'Featherlight semi-rimless titanium silhouette',
        initial_variant: {
          sku: 'NRD-TTN-01-BLK',
          color_name: 'Matte Graphite',
          color_hex: '#222222',
          stock_quantity: 12
        }
      }
    });
    const prodId = prodCreate.data.product_id;
    const varId = prodCreate.data.variant_id;

    // Upload 1 image, then 4 images (total 5), then attempt 6th (must fail 400), then spoofed file (must fail 400)
    const img1 = await multipartRequest(`/api/admin/variants/${varId}/images`, adminH, [
      { name: 'image_type', value: 'studio_front' },
      { name: 'images', filename: 'view1.png', contentType: 'image/png', value: pngBuf }
    ]);
    const imgBatch4 = await multipartRequest(`/api/admin/variants/${varId}/images`, adminH, [
      { name: 'image_types', value: JSON.stringify(['model_on_face', 'angle_45', 'hinge_detail', 'packaging']) },
      { name: 'images', filename: 'view2.png', contentType: 'image/png', value: pngBuf },
      { name: 'images', filename: 'view3.png', contentType: 'image/png', value: pngBuf },
      { name: 'images', filename: 'view4.png', contentType: 'image/png', value: pngBuf },
      { name: 'images', filename: 'view5.png', contentType: 'image/png', value: pngBuf }
    ]);
    [...(img1.data?.images || []), ...(imgBatch4.data?.images || [])].forEach(im => {
      if (im?.image_url) cleanupDiskFiles.push(path.join(__dirname, '../public', im.image_url));
    });

    const img6Reject = await multipartRequest(`/api/admin/variants/${varId}/images`, adminH, [
      { name: 'image_type', value: 'studio_front' },
      { name: 'images', filename: 'view6.png', contentType: 'image/png', value: pngBuf }
    ]);

    const uploadedIds = [
      img1.data.images[0].id,
      ...imgBatch4.data.images.map(i => i.id)
    ];
    const reversedIds = [...uploadedIds].reverse();
    const reorderRes = await request(`/api/admin/variants/${varId}/images/reorder`, {
      method: 'PUT', headers: adminH,
      body: { image_ids: reversedIds }
    });
    const pdpRes = await request('/api/products/nordic-titan-pro');

    check('Single Frame + 1-5 Images: Create with new taxonomy, upload 1+4, reject 6th (400), reorder & PDP returns 5 ordered images',
      prodCreate.status === 201 && img1.status === 201 && imgBatch4.status === 201 &&
      img6Reject.status === 400 && reorderRes.status === 200 &&
      pdpRes.status === 200 && pdpRes.data.product.variants[0].images.length === 5 &&
      pdpRes.data.product.variants[0].images[0].id === reversedIds[0],
      { prod: prodCreate.status, i1: img1.status, i4: imgBatch4.status, i6: img6Reject.status, reord: reorderRes.status }
    );

    // Delete 1 image & test spoofed upload leaves no DB record
    const delImgRes = await request(`/api/admin/images/${uploadedIds[4]}`, { method: 'DELETE', headers: adminH });
    const spoofImgRes = await multipartRequest(`/api/admin/variants/${varId}/images`, adminH, [
      { name: 'image_type', value: 'packaging' },
      { name: 'images', filename: 'fake.png', contentType: 'image/png', value: fakePngBuf }
    ]);
    const pdpAfterDel = await request('/api/products/nordic-titan-pro');
    check('Product Images: Delete removes image and spoofed binary upload fails (400) cleanly',
      delImgRes.status === 200 && spoofImgRes.status === 400 && pdpAfterDel.data.product.variants[0].images.length === 4
    );

    // Unused brand/shape/cat delete succeeds once unreferenced (create temp & delete)
    const tmpCat = await request('/api/admin/categories', { method: 'POST', headers: adminH, body: { name: 'Temp Delete Cat', slug: 'temp-delete-cat', category_type: 'accessories' } });
    const delTmpCat = await request(`/api/admin/categories/${tmpCat.data.category_id}`, { method: 'DELETE', headers: adminH });
    check('Taxonomy Category: Delete unused category succeeds (200)', tmpCat.status === 201 && delTmpCat.status === 200);

    // ─── 3. BLANK CATALOGUE TEMPLATE (prod_code) & IMPORT + SINGLE FRAME AUTO-ID ───
    const blankTplRes = await request('/api/admin/imports/catalogue/template', { headers: adminH });
    const sampleTplRes = await request('/api/admin/imports/catalogue/sample', { headers: adminH });
    const parsedBlank = parseSpreadsheetText(String(blankTplRes.data || ''));
    const headers = parsedBlank.headers;
    const forbiddenHeaders = ['master_sku', 'variant_sku', 'color_code', 'color_hex', 'status'];
    const hasForbidden = forbiddenHeaders.some(h => headers.includes(h));
    const hasMeasurements = ['lens_width_mm', 'bridge_width_mm', 'temple_length_mm', 'frame_height_mm', 'total_width_mm'].every(h => headers.includes(h));

    const staffImportRows = [
      {
        rowNumber: 2,
        prod_code: 'FR-100',
        product_name: 'Classic Rectangle',
        brand_name: 'Optii Atelier',
        category_name: 'Eyeglasses',
        shape_name: 'Round',
        material: 'Acetate',
        frame_type: 'Full Rim',
        frame_fit: 'Medium',
        gender: 'unisex',
        base_price_inr: '1499',
        description: 'Everyday lightweight frame',
        color_name: 'Matte Black',
        opening_stock: '10',
        lens_width_mm: '52',
        bridge_width_mm: '18',
        temple_length_mm: '145',
        frame_height_mm: '38',
        total_width_mm: '140'
      },
      {
        rowNumber: 3,
        prod_code: 'FR-100',
        product_name: 'Classic Rectangle',
        brand_name: 'Optii Atelier',
        category_name: 'Eyeglasses',
        shape_name: 'Round',
        material: 'Acetate',
        frame_type: 'Full Rim',
        frame_fit: 'Medium',
        gender: 'unisex',
        base_price_inr: '1499',
        description: 'Everyday lightweight frame',
        color_name: 'Tortoise',
        opening_stock: '5',
        lens_width_mm: '52',
        bridge_width_mm: '18',
        temple_length_mm: '145',
        frame_height_mm: '38',
        total_width_mm: '140'
      }
    ];
    const staffImportCommit = await request('/api/admin/imports/catalogue/commit', {
      method: 'POST', headers: adminH,
      body: { source_type: 'csv', source_name: 'blank_template.csv', rows: staffImportRows }
    });
    const fr100 = await db.get("SELECT id, frame_type, is_active FROM products WHERE sku = 'FR-100'");
    const fr100Vars = fr100 ? await db.all('SELECT sku, color_name, color_hex FROM product_variants WHERE product_id = ?', [fr100.id]) : [];

    const singleProdAutoRes = await request('/api/admin/products', {
      method: 'POST', headers: adminH,
      body: {
        name: 'Staff Wizard Frame',
        prod_code: 'STF-WIZ-01',
        brand_id: 1,
        category_id: 1,
        shape_id: 1,
        base_price_inr: 3990,
        gender: 'unisex',
        material: 'Bio-Acetate',
        frame_fit: 'Medium',
        frame_type: 'Full Rim',
        lens_width_mm: 50,
        bridge_width_mm: 20,
        temple_length_mm: 145,
        frame_height_mm: 42,
        total_width_mm: 138,
        initial_variant: { color_name: 'Havana', stock_quantity: 7 }
      }
    });
    const singleProdVar = singleProdAutoRes.data?.variant_id
      ? await db.get('SELECT sku, color_hex FROM product_variants WHERE id = ?', [singleProdAutoRes.data.variant_id])
      : null;

    check('Blank Template, prod_code Import & Single Frame Auto-ID: Blank CSV (0 rows), no legacy sample route, auto-generated variant_sku/hex/status',
      blankTplRes.status === 200 &&
      sampleTplRes.status === 404 &&
      parsedBlank.rows.length === 0 &&
      headers.includes('prod_code') &&
      !hasForbidden &&
      hasMeasurements &&
      staffImportCommit.status === 201 &&
      !!fr100 && fr100.frame_type === 'Full Rim' && fr100.is_active === 1 &&
      fr100Vars.length === 2 && fr100Vars[0].sku.startsWith('FR-100-') &&
      singleProdAutoRes.status === 201 &&
      !!singleProdVar && singleProdVar.sku === 'STF-WIZ-01-HAV' && /^#[0-9A-F]{6}$/i.test(singleProdVar.color_hex),
      { tpl: blankTplRes.status, sample: sampleTplRes.status, commit: staffImportCommit.status, fr100, fr100Vars, singleProdAutoRes: singleProdAutoRes.status, singleProdVar }
    );

    // ─── 4. LENS PRICING STEPS 1, 2, 3, 4 ───
    const lensesPublic1 = await request('/api/lenses');
    const step2Update = await request('/api/admin/lenses/prescription-options/2', {
      method: 'PUT', headers: adminH,
      body: { name: 'Manual Rx Input', fee_inr: 150, pd_min: 52, pd_max: 74, is_active: 1 }
    });
    const calcWithStep2 = await request('/api/lenses/calculate', {
      method: 'POST',
      body: { product_id: prodId, variant_id: varId, usage_id: 1, prescription_method: 'manual', thickness_id: 1, coating_id: 1 }
    });
    const addUsageRes = await request('/api/admin/lenses/usages', {
      method: 'POST', headers: adminH,
      body: { name: 'Bifocal Reading', base_price_inr: 2200, description: 'Dual distance + near segment' }
    });

    check('Lens Pricing 4-Step Completeness: Step 2 exposed, configurable fee applied in calculation & usage creation works',
      lensesPublic1.status === 200 &&
      Array.isArray(lensesPublic1.data.steps.step2_prescription_options) &&
      lensesPublic1.data.steps.step2_prescription_options.length >= 3 &&
      step2Update.status === 200 &&
      calcWithStep2.status === 200 &&
      calcWithStep2.data.calculation.lens_prescription_inr === 150 &&
      calcWithStep2.data.calculation.grand_total_inr === 8050 &&
      addUsageRes.status === 201,
      { calc: calcWithStep2.data?.calculation, addUsage: addUsageRes.status }
    );

    // ─── 5. STORE SETTINGS, LOGO & STOREFRONT SYNC ───
    const logoUpload = await multipartRequest('/api/admin/settings/logo', adminH, [
      { name: 'logo', filename: 'store_logo.png', contentType: 'image/png', value: pngBuf }
    ]);
    if (logoUpload.data?.logo_url) {
      cleanupDiskFiles.push(path.join(__dirname, '../public', logoUpload.data.logo_url.replace(/^\//, '')));
    }
    const settingsSave = await request('/api/admin/settings', {
      method: 'PUT', headers: adminH,
      body: {
        name: 'Vision Opticals Flagship',
        address: '45 Bazaar Street, Thiruvarur',
        city: 'Thiruvarur',
        phone: '+91 98765 43210',
        whatsapp_number: '+91 98765 43210',
        email: 'hello@visionopticals.in',
        description: 'Trusted family eye clinic since 1998.',
        announcement_text: 'Free digital eye exam this week!',
        hours: [{ day_of_week: 1, open_time: '09:30', close_time: '20:30', is_closed: 0 }]
      }
    });
    const publicSettings = await request('/api/settings');
    const waEnquiry = await request('/api/enquiries/whatsapp', {
      method: 'POST',
      body: { product_name: 'Nordic Titan Pro', sku: 'NRD-TTN-01-BLK', price_inr: 7900 }
    });
    const staffSettingsBlock = await request('/api/admin/settings', {
      method: 'PUT', headers: staffH,
      body: { name: 'Hacked Name', address: 'Nowhere St', phone: '9999999999' }
    });

    check('Store Settings & Sync: Logo upload, full identity + hours persist, public /api/settings & WhatsApp sync, RBAC blocks staff (403)',
      logoUpload.status === 200 && settingsSave.status === 200 && publicSettings.status === 200 &&
      publicSettings.data.store.name === 'Vision Opticals Flagship' &&
      publicSettings.data.store.logo_url === logoUpload.data.logo_url &&
      publicSettings.data.settings.announcement_text === 'Free digital eye exam this week!' &&
      String(waEnquiry.data?.whatsapp_url || '').includes('919876543210') &&
      staffSettingsBlock.status === 403,
      { logo: logoUpload.status, save: settingsSave.status, pub: publicSettings.data?.store?.name, wa: waEnquiry.data?.whatsapp_url }
    );

    // ─── 6. SECURITY GUARDS ───
    const unauthEnq = await request('/api/enquiries');
    const rxUp = await multipartRequest('/api/prescriptions/upload', {}, [
      { name: 'prescription', filename: 'rx.png', contentType: 'image/png', value: pngBuf }
    ]);
    const unauthDelRx = await request(`/api/prescriptions/${rxUp.data.prescription_token}`, { method: 'DELETE' });
    const authDelRx = await request(`/api/prescriptions/${rxUp.data.prescription_token}`, {
      method: 'DELETE',
      headers: { 'x-prescription-token': rxUp.data.prescription_token }
    });

    check('Security: GET /api/enquiries requires auth (401) & DELETE /api/prescriptions/:token rejects unauthenticated (403) and allows owner token (200)',
      unauthEnq.status === 401 && rxUp.status === 201 && unauthDelRx.status === 403 && authDelRx.status === 200,
      { enq: unauthEnq.status, rxUp: rxUp.status, unauthDel: unauthDelRx.status, authDel: authDelRx.status }
    );
  } catch (err) {
    console.error('Fatal error in test_admin_improvements:', err);
    check('No fatal test runner exception', false, err.message);
  } finally {
    if (server) server.close();
    await db.close();
    for (const f of cleanupDiskFiles) {
      if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (_) {} }
    }
    for (const ext of ['', '-wal', '-shm']) {
      const f = TEST_DB_PATH + ext;
      if (fs.existsSync(f)) { try { fs.unlinkSync(f); } catch (_) {} }
    }
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n===============================================================`);
  console.log(`ADMIN IMPROVEMENTS SUITE: ${results.length} CHECKS | PASSED: ${passed} | FAILED: ${failed}`);
  console.log(`===============================================================\n`);
  process.exit(failed === 0 ? 0 : 1);
}

runTests();
