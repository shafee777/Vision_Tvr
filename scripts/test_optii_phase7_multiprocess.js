/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII PLATFORM — PHASE 7 MULTI-PROCESS & CONCURRENCY TEST SUITE
 * Validates cross-process SQLite concurrency, locks & atomic boundaries
 * ═════════════════════════════════════════════════════════════════════
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const db = require('../server/db/database');

const PORT_A = 5050; // Primary process
const PORT_B = 5051; // Secondary independent process

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function request(port, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqHeaders = { 'Accept': 'application/json', 'x-bypass-rate-limit': 'true', ...headers };
    let postData = null;

    if (body && typeof body === 'object') {
      postData = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw), headers: res.headers });
        } catch (_) {
          resolve({ status: res.statusCode, raw, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function waitForServer(port, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await request(port, 'GET', '/api/health');
      if (res.status === 200) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Server on port ${port} failed to start within timeout.`);
}

async function runMultiProcessSuite() {
  console.log('\n======================================================');
  console.log('🔄 RUNNING OPTII PHASE 7: MULTI-PROCESS CONCURRENCY SUITE');
  console.log('======================================================\n');

  // Verify Process A is active
  console.log(`[Process A] Checking primary instance on port ${PORT_A}...`);
  await waitForServer(PORT_A);
  console.log(`[Process A] ✓ Primary process online at port ${PORT_A}\n`);

  // Spawn Process B on port 5051 connected to the same database
  console.log(`[Process B] Spawning secondary independent Node.js process on port ${PORT_B}...`);
  const serverPath = path.resolve(__dirname, '../server/index.js');
  const procB = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: PORT_B, NODE_ENV: process.env.NODE_ENV || 'test' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  procB.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('ExperimentalWarning')) {
      // console.error('[Process B ERR]', msg);
    }
  });

  await waitForServer(PORT_B);
  console.log(`[Process B] ✓ Secondary independent process online at port ${PORT_B}\n`);

  // Obtain admin token on both processes
  const loginA = await request(PORT_A, 'POST', '/api/auth/login', { username: 'admin', password: 'optii123' });
  const tokenA = loginA.data.token;
  const loginB = await request(PORT_B, 'POST', '/api/auth/login', { username: 'admin', password: 'optii123' });
  const tokenB = loginB.data.token;

  assert(tokenA && tokenB, 'Admin authentication verified independently across both Node.js processes');

  // ── TEST 1: Simultaneous Purchases of Last Available Unit Across Processes ──
  console.log('\n--- Test 1: Simultaneous Purchases of Last Unit Across Processes ---');
  {
    const raceSku = `PILOT-RACE-${Date.now().toString().slice(-4)}`;
    const createVar = await db.run(
      'INSERT INTO product_variants (product_id, color_name, color_hex, sku, stock_quantity, is_default, is_active) VALUES (1, "Pilot Titanium", "#333333", ?, 1, 0, 1)',
      [raceSku]
    );
    const varId = createVar.lastID;

    // Concurrently fire Order A to Process A and Order B to Process B
    const reqA = request(PORT_A, 'POST', '/api/orders', {
      customer_name: 'Pilot Patron Alpha',
      customer_phone: '9876543201',
      shipping_address: '100 Process A Way',
      items: [{ variant_id: varId, product_name: 'Aura Titanium', quantity: 1, price_inr: 12500 }]
    });

    const reqB = request(PORT_B, 'POST', '/api/orders', {
      customer_name: 'Pilot Patron Beta',
      customer_phone: '9876543202',
      shipping_address: '200 Process B Way',
      items: [{ variant_id: varId, product_name: 'Aura Titanium', quantity: 1, price_inr: 12500 }]
    });

    const [resA, resB] = await Promise.all([reqA, reqB]);

    const successes = [resA, resB].filter(r => r.status === 201);
    const rejections = [resA, resB].filter(r => r.status === 400 && r.data.error_code === 'INSUFFICIENT_STOCK');

    assert(successes.length === 1, `Cross-process simultaneous race: Exactly 1 purchase succeeded (HTTP 201)`);
    assert(rejections.length === 1, `Cross-process competing order cleanly rejected with HTTP 400 INSUFFICIENT_STOCK`);

    const finalStock = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [varId]);
    assert(finalStock.stock_quantity === 0, `Cross-process atomic transaction guarantees final stock is exactly 0 (no negative inventory)`);

    // ── TEST 2: Order Cancellation & Inventory Restoration Across Processes ──
    console.log('\n--- Test 2: Order Cancellation & Idempotent Restock Across Processes ---');
    const orderNum = successes[0].data.order.order_number;

    // Process A cancels order
    const cancelA = await request(PORT_A, 'PATCH', `/api/admin/orders/${orderNum}/status`, { order_status: 'cancelled' }, { 'Authorization': `Bearer ${tokenA}` });
    assert(cancelA.status === 200, `Process A transitions order ${orderNum} to cancelled and restores inventory`);

    const stockAfterCancel = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [varId]);
    assert(stockAfterCancel.stock_quantity === 1, `Inventory restored to exactly 1 unit`);

    // Process B attempts duplicate cancellation
    const cancelB = await request(PORT_B, 'PATCH', `/api/admin/orders/${orderNum}/status`, { order_status: 'cancelled' }, { 'Authorization': `Bearer ${tokenB}` });
    const stockAfterDupCancel = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [varId]);
    assert(stockAfterDupCancel.stock_quantity === 1, `Process B duplicate cancellation does NOT restock inventory again (idempotent restock across processes)`);
  }

  // ── TEST 3: Concurrent Stock Adjustments Across Processes ──
  console.log('\n--- Test 3: Concurrent Stock Adjustments Across Processes ---');
  {
    const adjSku = `PILOT-ADJ-${Date.now().toString().slice(-4)}`;
    const createVar = await db.run(
      'INSERT INTO product_variants (product_id, color_name, color_hex, sku, stock_quantity, is_default, is_active) VALUES (1, "Adjustable Grey", "#777777", ?, 20, 0, 1)',
      [adjSku]
    );
    const varId = createVar.lastID;

    // Concurrently adjust stock from Process A (+5) and Process B (+10)
    const adjA = request(PORT_A, 'POST', '/api/admin/inventory/adjust', {
      variant_id: varId,
      change_quantity: 5,
      movement_type: 'replenishment',
      reason: 'Physical atelier shipment received via Process A'
    }, { 'Authorization': `Bearer ${tokenA}` });

    const adjB = request(PORT_B, 'POST', '/api/admin/inventory/adjust', {
      variant_id: varId,
      change_quantity: 10,
      movement_type: 'replenishment',
      reason: 'Lab stock adjustment via Process B'
    }, { 'Authorization': `Bearer ${tokenB}` });

    const [resAdjA, resAdjB] = await Promise.all([adjA, adjB]);

    assert(resAdjA.status === 200 && resAdjB.status === 200, 'Both concurrent stock adjustments across separate processes completed successfully (HTTP 200)');

    const finalAdjStock = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [varId]);
    assert(finalAdjStock.stock_quantity === 35, `Final inventory is precisely 20 + 5 + 10 = 35 units (no lost updates)`);

    const movements = await db.all('SELECT change_quantity, reason FROM inventory_movements WHERE variant_id = ? ORDER BY id ASC', [varId]);
    assert(movements.length === 2, `Audit trail recorded exactly 2 distinct movements across both processes`);
  }

  // ── TEST 4: Simultaneous Appointment Booking for Exact Same Slot Across Processes ──
  console.log('\n--- Test 4: Simultaneous Appointment Booking for Exact Same Slot ---');
  {
    const testDate = '2026-12-15';
    const testTime = '11:00';

    // Clear any prior booking on that slot
    await db.run('DELETE FROM appointments WHERE appointment_date = ? AND start_time = ?', [testDate, testTime]);

    // Send booking A to Process A and booking B to Process B at the exact same millisecond
    const bookA = request(PORT_A, 'POST', '/api/appointments', {
      customer_name: 'Patient A (Process A)',
      customer_phone: '9876543291',
      store_id: 1,
      appointment_date: testDate,
      start_time: testTime,
      consultation_type: 'Comprehensive Optical Exam'
    });

    const bookB = request(PORT_B, 'POST', '/api/appointments', {
      customer_name: 'Patient B (Process B)',
      customer_phone: '9876543292',
      store_id: 1,
      appointment_date: testDate,
      start_time: testTime,
      consultation_type: 'Comprehensive Optical Exam'
    });

    const [resBookA, resBookB] = await Promise.all([bookA, bookB]);

    const bookSuccesses = [resBookA, resBookB].filter(r => r.status === 201);
    const bookCollisions = [resBookA, resBookB].filter(r => r.status === 409 && (r.data.error_code === 'SLOT_ALREADY_BOOKED' || r.data.code === 'SLOT_ALREADY_BOOKED'));

    assert(bookSuccesses.length === 1, 'Cross-process appointment race: Exactly 1 patient booked the slot (HTTP 201)');
    assert(bookCollisions.length === 1, 'Cross-process competing appointment cleanly rejected with HTTP 409 SLOT_ALREADY_BOOKED');

    const confirmedCount = await db.get('SELECT COUNT(*) as count FROM appointments WHERE appointment_date = ? AND start_time = ? AND status != "cancelled"', [testDate, testTime]);
    assert(confirmedCount.count === 1, 'Database constraint guarantees exactly 1 non-cancelled booking exists for the slot');
  }

  // ── TEST 5: Graceful Shutdown of Worker Process ──
  console.log('\n--- Test 5: Graceful Shutdown & Process Lifecycle ---');
  {
    const shutdownPromise = new Promise((resolve) => {
      procB.on('exit', (code, signal) => {
        resolve({ code, signal });
      });
    });

    procB.kill('SIGTERM');
    const exitResult = await Promise.race([
      shutdownPromise,
      new Promise(r => setTimeout(() => r({ timeout: true }), 4000))
    ]);

    assert(!exitResult.timeout, 'Process B responded to SIGTERM and terminated cleanly within timeout window');
  }

  // Summary
  console.log('\n======================================================');
  console.log(`📊 PHASE 7 MULTI-PROCESS RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runMultiProcessSuite().catch(err => {
  console.error('Fatal multi-process test execution error:', err);
  process.exit(1);
});
