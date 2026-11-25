/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — PHASE 5 AUTOMATED INTEGRATION TEST SUITE
 * Admin Management, RBAC Clearance, Stock Movements & Clinical Controls
 * ═════════════════════════════════════════════════════════════════════
 */

const http = require('http');
const db = require('../server/db/database');

const BASE_URL = 'http://localhost:5050';

let passedTests = 0;
let failedTests = 0;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = { 'Accept': 'application/json', 'x-bypass-rate-limit': 'true' };
    let postData = null;

    if (body) {
      postData = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers
    }, (res) => {
      let rawData = '';
      res.on('data', chunk => rawData += chunk);
      res.on('end', () => {
        try {
          const parsed = rawData ? JSON.parse(rawData) : {};
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (err) {
          resolve({ status: res.statusCode, raw: rawData });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runPhase5Tests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING OPTII PHASE 5: DEDICATED ADMIN TEST SUITE');
  console.log('======================================================\n');

  let adminToken = '';
  let optometristToken = '';
  let staffToken = '';

  // ── TEST 1: Staff Authentication & Role Clearance ──
  console.log('--- Test Group 1: Staff Authentication & Credentials ---');
  {
    // Invalid credentials
    const badLogin = await request('POST', '/api/auth/login', { username: 'admin', password: 'wrongpassword' });
    assert(badLogin.status === 401, 'Invalid password returns HTTP 401 Unauthorized');

    // Admin login
    const adminLogin = await request('POST', '/api/auth/login', { username: 'admin', password: 'optii123' });
    assert(adminLogin.status === 200 && adminLogin.data.success, 'Admin login succeeds with valid credentials');
    assert(adminLogin.data.user.role === 'admin', 'Admin user has role = "admin"');
    adminToken = adminLogin.data.token;

    // Optometrist login
    const optoLogin = await request('POST', '/api/auth/login', { username: 'optometrist', password: 'optii123' });
    assert(optoLogin.status === 200 && optoLogin.data.success, 'Optometrist login succeeds');
    assert(optoLogin.data.user.role === 'optometrist', 'Optometrist user has role = "optometrist"');
    optometristToken = optoLogin.data.token;

    // Staff login
    const staffLogin = await request('POST', '/api/auth/login', { username: 'staff', password: 'optii123' });
    assert(staffLogin.status === 200 && staffLogin.data.success, 'Staff login succeeds');
    assert(staffLogin.data.user.role === 'staff', 'Staff user has role = "staff"');
    staffToken = staffLogin.data.token;
  }

  // ── TEST 2: RBAC Route Authorization Guards ──
  console.log('\n--- Test Group 2: RBAC Route Authorization Guards ---');
  {
    // Unauthenticated request
    const unauth = await request('GET', '/api/admin/summary');
    assert(unauth.status === 401, 'Unauthenticated request to /api/admin/summary blocked with HTTP 401');

    // Admin access to summary
    const adminSummary = await request('GET', '/api/admin/summary', null, adminToken);
    assert(adminSummary.status === 200 && adminSummary.data.success, 'Admin can access /api/admin/summary');
    assert(typeof adminSummary.data.metrics.active_products === 'number', 'Summary returns real operational metrics');

    // Staff forbidden from audit logs
    const staffAudit = await request('GET', '/api/admin/audit-logs', null, staffToken);
    assert(staffAudit.status === 403, 'Staff is blocked from /api/admin/audit-logs with HTTP 403 Forbidden');

    // Staff forbidden from user management
    const staffUsers = await request('POST', '/api/admin/users', { username: 'hacker' }, staffToken);
    assert(staffUsers.status === 403, 'Staff is blocked from creating users with HTTP 403 Forbidden');

    // Optometrist allowed to view appointments
    const optoAppts = await request('GET', '/api/admin/appointments', null, optometristToken);
    assert(optoAppts.status === 200 && optoAppts.data.success, 'Optometrist can access consultation queue');

    // Optometrist forbidden from clinic settings
    const optoSettings = await request('PUT', '/api/admin/settings/clinic_hours', { value: '9-5' }, optometristToken);
    assert(optoSettings.status === 403, 'Optometrist is blocked from modifying settings with HTTP 403');
  }

  // ── TEST 3: Product Silhouette & Variant Management ──
  console.log('\n--- Test Group 3: Frame Silhouettes & Variant Management ---');
  let createdProductId = null;
  const testSku = `OPT-TEST-${Date.now().toString().slice(-4)}`;
  const testVariantSku = `${testSku}-BLK`;
  {
    // Create new frame silhouette
    const newProduct = await request('POST', '/api/admin/products', {
      name: 'Test Atelier Round Frame',
      slug: `test-atelier-round-${Date.now()}`,
      sku: testSku,
      brand_id: 1,
      category_id: 1,
      shape_id: 1,
      base_price_inr: 8900,
      material: 'Custom Japanese Titanium',
      frame_fit: 'Medium',
      lens_width_mm: 49,
      bridge_width_mm: 20,
      temple_length_mm: 145,
      description: 'Test optical silhouette for Phase 5 verification.'
    }, adminToken);
    assert(newProduct.status === 201 && newProduct.data.success, 'Admin can create new frame silhouette');
    createdProductId = newProduct.data.productId;

    // Add variant
    const newVariant = await request('POST', `/api/admin/products/${createdProductId}/variants`, {
      color_name: 'Obsidian Black',
      color_hex: '#111111',
      sku: testVariantSku,
      stock_quantity: 12,
      is_default: 1
    }, adminToken);
    assert(newVariant.status === 201 && newVariant.data.success, 'Can add colorway variant to silhouette');

    // Duplicate SKU guard
    const dupVariant = await request('POST', `/api/admin/products/${createdProductId}/variants`, {
      color_name: 'Duplicate Black',
      color_hex: '#111111',
      sku: testVariantSku,
      stock_quantity: 5,
      is_default: 0
    }, adminToken);
    assert((dupVariant.status === 409 || dupVariant.status === 400) && dupVariant.data.message.includes('already exists'), 'Duplicate SKU is rejected with HTTP 409 Conflict');
  }

  // ── TEST 4: Stock Adjustment & Mandatory Audit Reason ──
  console.log('\n--- Test Group 4: Stock Adjustments & Movement Audit Trail ---');
  {
    // Fetch variant to get ID
    const prodDetail = await request('GET', `/api/admin/products/${createdProductId}`, null, adminToken);
    const variantId = prodDetail.data.product.variants[0].id;
    const initialStock = prodDetail.data.product.variants[0].stock_quantity;

    // Reject adjustment without mandatory reason
    const noReason = await request('POST', '/api/admin/inventory/adjust', {
      variant_id: variantId,
      change_quantity: 5,
      movement_type: 'replenishment',
      reason: '   ' // whitespace only
    }, staffToken);
    assert(noReason.status === 400, 'Adjustment without mandatory reason rejected with HTTP 400');

    // Commit valid adjustment with reason
    const validAdjust = await request('POST', '/api/admin/inventory/adjust', {
      variant_id: variantId,
      change_quantity: 8,
      movement_type: 'replenishment',
      reason: 'Phase 5 verification replenishment batch from Tokyo lab.'
    }, staffToken);
    assert(validAdjust.status === 200 && validAdjust.data.success, 'Staff can commit stock adjustment with reason');
    assert(validAdjust.data.new_quantity === initialStock + 8, `Stock quantity updated correctly from ${initialStock} to ${initialStock + 8}`);

    // Verify inventory movement record in DB
    const movement = await db.get(
      'SELECT * FROM inventory_movements WHERE variant_id = ? ORDER BY id DESC LIMIT 1',
      [variantId]
    );
    assert(movement && movement.reason.includes('Phase 5 verification'), 'Inventory movement table recorded the change with reason');
    assert(movement.change_quantity === 8, 'Inventory movement recorded exact delta quantity (+8)');
  }

  // ── TEST 5: Taxonomy Protection & Referential Integrity Guard ──
  console.log('\n--- Test Group 5: Taxonomy Referential Integrity Guards ---');
  {
    // Brand ID 1 is referenced by active products. Attempt to delete must fail.
    const delBrand = await request('DELETE', '/api/admin/brands/1', null, adminToken);
    assert(delBrand.status === 409 && delBrand.data.message.includes('referenced by'), 'Referenced brand deletion blocked with HTTP 409 Conflict');

    // Shape ID 1 is referenced by active frames. Attempt to delete must fail.
    const delShape = await request('DELETE', '/api/admin/shapes/1', null, adminToken);
    assert(delShape.status === 409 && delShape.data.message.includes('referenced by'), 'Referenced shape deletion blocked with HTTP 409 Conflict');
  }

  // ── TEST 6: Lens Pricing Configuration ──
  console.log('\n--- Test Group 6: 4-Step Lens Configurator Pricing ---');
  {
    // Optometrist updates lens usage price
    const updateUsage = await request('PUT', '/api/admin/lenses/usages/1', {
      base_price_inr: 1650
    }, optometristToken);
    assert(updateUsage.status === 200 && updateUsage.data.success, 'Optometrist can update lens usage price');

    // Verify change reflected in public lens endpoint
    const lensList = await request('GET', '/api/lenses');
    const usages = lensList.data.steps?.step1_usages || lensList.data.usages || [];
    const u1 = usages.find(u => u.id === 1);
    assert(u1 && u1.base_price_inr === 1650, 'Updated lens price is immediately visible to storefront customers');
  }

  // ── TEST 7: Order Lifecycle Staging & Inspection ──
  console.log('\n--- Test Group 7: Order Inspection & Fulfillment Lifecycle ---');
  {
    const ordersRes = await request('GET', '/api/admin/orders', null, adminToken);
    assert(ordersRes.status === 200 && Array.isArray(ordersRes.data.orders), 'Admin can retrieve optical orders queue');

    if (ordersRes.data.orders.length > 0) {
      const targetOrder = ordersRes.data.orders[0];
      const trackingCode = `BLUEDART-OPT-${Date.now().toString().slice(-6)}`;

      // Transition order status
      const transition = await request('PATCH', `/api/admin/orders/${targetOrder.order_number}/status`, {
        order_status: 'lab_glazing',
        tracking_number: trackingCode
      }, adminToken);
      assert(transition.status === 200 && transition.data.success, 'Can transition order status to lab_glazing');

      // Verify order detail reflects change
      const detail = await request('GET', `/api/admin/orders/${targetOrder.order_number}`, null, adminToken);
      assert(detail.data.order.order_status === 'lab_glazing', 'Order detail reflects updated status "lab_glazing"');
      assert(detail.data.order.tracking_number === trackingCode, 'Order detail reflects assigned tracking code');
    } else {
      console.log('  ℹ No existing orders to transition; skipping detail check');
    }
  }

  // ── TEST 8: Appointment Queue & Reschedule Collision Guard ──
  console.log('\n--- Test Group 8: Appointment Rescheduling & Collision Prevention ---');
  {
    // Clean up test slots first for idempotence
    await db.run('DELETE FROM appointments WHERE appointment_date = ?', ['2026-11-28']);

    // Create 2 test appointments for slot collision check
    const appt1Res = await request('POST', '/api/appointments', {
      store_id: 1,
      appointment_date: '2026-11-28',
      start_time: '14:00',
      end_time: '14:45',
      customer_name: 'Slot Collision Test 1',
      customer_email: 'test1@optii.local',
      customer_phone: '+919876500001'
    });
    assert(appt1Res.status === 201, 'Created first test appointment at 2026-11-28 14:00');

    const appt2Res = await request('POST', '/api/appointments', {
      store_id: 1,
      appointment_date: '2026-11-28',
      start_time: '15:00',
      end_time: '15:45',
      customer_name: 'Slot Collision Test 2',
      customer_email: 'test2@optii.local',
      customer_phone: '+919876500002'
    });
    assert(appt2Res.status === 201, 'Created second test appointment at 2026-11-28 15:00');

    const appt2Id = appt2Res.data.appointment.id;

    // Attempt to reschedule appt2 to 14:00 (which is booked by appt1)
    const collideRes = await request('PATCH', `/api/admin/appointments/${appt2Id}/reschedule`, {
      appointment_date: '2026-11-28',
      start_time: '14:00'
    }, optometristToken);
    assert(collideRes.status === 409 && (collideRes.data.code === 'SLOT_ALREADY_BOOKED' || collideRes.data.error_code === 'SLOT_ALREADY_BOOKED'), 'Rescheduling into already booked slot blocked with HTTP 409 SLOT_ALREADY_BOOKED');

    // Reschedule appt2 to free slot 16:00
    const successResched = await request('PATCH', `/api/admin/appointments/${appt2Id}/reschedule`, {
      appointment_date: '2026-11-28',
      start_time: '16:00'
    }, optometristToken);
    assert(successResched.status === 200 && successResched.data.success, 'Rescheduling into free slot 16:00 succeeds with HTTP 200');
  }

  // ── TEST 9: Password Change Flow & Audit Logs ──
  console.log('\n--- Test Group 9: Self Password Updates & Audit Log Trail ---');
  {
    // Test staff password change with wrong old password
    const badPass = await request('PATCH', '/api/admin/profile/password', {
      current_password: 'wrongpassword',
      new_password: 'newoptiipass123'
    }, staffToken);
    assert(badPass.status === 401, 'Password update with wrong current password rejected with HTTP 401');

    // Admin audit trail inspection
    const auditRes = await request('GET', '/api/admin/audit-logs', null, adminToken);
    assert(auditRes.status === 200 && Array.isArray(auditRes.data.logs), 'Admin can view immutable audit logs');
    assert(auditRes.data.logs.length > 0, `Audit log contains ${auditRes.data.logs.length} logged administrative operations`);
  }

  // Summary
  console.log('\n======================================================');
  console.log(`📊 PHASE 5 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase5Tests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
