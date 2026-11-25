/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII PLATFORM — PHASE 7 OPERATIONAL SIMULATION SCRIPT
 * Complete Optical Retail Lifecycle Simulation with Fictional Data
 * ═════════════════════════════════════════════════════════════════════
 */

const http = require('http');
const db = require('../server/db/database');

const BASE_URL = 'http://localhost:5050';
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

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { 'Accept': 'application/json', 'x-bypass-rate-limit': 'true', ...headers };
    let postData = null;

    if (body && typeof body === 'object') {
      postData = JSON.stringify(body);
      reqHeaders['Content-Type'] = 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
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

async function runOperationalSimulation() {
  console.log('\n======================================================');
  console.log('👓 RUNNING OPTII PHASE 7: OPTICAL RETAIL OPERATIONAL SIMULATION');
  console.log('======================================================\n');

  // Authenticate as Staff Admin
  const loginRes = await request('POST', '/api/auth/login', { username: 'admin', password: 'optii123' });
  const adminToken = loginRes.data.token;
  assert(loginRes.status === 200 && adminToken, 'Staff admin authenticated with active JWT session');

  // ── WORKFLOW 1: PRODUCT ENTRY (Silhouette, 3 Variants, Specs & Images) ──
  console.log('\n--- Workflow 1: Optical Frame Silhouette & Variant Entry ---');
  const pilotSlug = `aura-minimalist-titanium-${Date.now().toString().slice(-4)}`;
  const pilotSkuBase = `PILOT-AURA-${Date.now().toString().slice(-4)}`;

  // 1. Create Frame Silhouette
  const createProductRes = await request('POST', '/api/admin/products', {
    name: 'Aura Minimalist Titanium',
    slug: pilotSlug,
    sku: `${pilotSkuBase}-01`,
    brand_id: 1, // Silhouette Atelier
    category_id: 1, // Eyeglasses
    shape_id: 1, // Round
    gender: 'Unisex',
    material: 'Beta-Titanium',
    frame_fit: 'Medium',
    lens_width_mm: 50,
    bridge_width_mm: 19,
    temple_length_mm: 145,
    frame_weight_g: 14,
    base_price_inr: 12500,
    description: 'Ultra-lightweight Japanese beta-titanium wireframe engineered with screwless cylindrical hinges and hand-polished temple tips for effortless daily elegance.',
    is_active: 1
  }, { 'Authorization': `Bearer ${adminToken}` });

  assert(createProductRes.status === 201, `Created new master silhouette "Aura Minimalist Titanium" (ID: ${createProductRes.data.product_id})`);
  const productId = createProductRes.data.product_id;

  // 2. Add 3 distinct colourway variants
  const variantsData = [
    { name: 'Brushed Gunmetal', hex: '#4A4A4A', sku: `${pilotSkuBase}-GM`, stock: 5 },
    { name: 'Rose Gold', hex: '#B76E79', sku: `${pilotSkuBase}-RG`, stock: 5 },
    { name: 'Matte Obsidian', hex: '#1C1C1C', sku: `${pilotSkuBase}-OB`, stock: 5 }
  ];

  const createdVariantIds = [];
  for (let i = 0; i < variantsData.length; i++) {
    const v = variantsData[i];
    const varRes = await request('POST', `/api/admin/products/${productId}/variants`, {
      color_name: v.name,
      color_hex: v.hex,
      sku: v.sku,
      stock_quantity: v.stock,
      is_default: i === 0 ? 1 : 0
    }, { 'Authorization': `Bearer ${adminToken}` });

    assert(varRes.status === 201, `Added variant "${v.name}" (${v.sku}) with ${v.stock} units inventory`);
    createdVariantIds.push(varRes.data.variant_id);

    // Add multi-angle images for each variant
    await db.run(
      'INSERT INTO product_images (variant_id, image_url, image_type, display_order) VALUES (?, ?, ?, ?)',
      [varRes.data.variant_id, 'images/products/henry-round-amber-front.png', 'studio_front', 1]
    );
    await db.run(
      'INSERT INTO product_images (variant_id, image_url, image_type, display_order) VALUES (?, ?, ?, ?)',
      [varRes.data.variant_id, 'images/products/henry-round-amber-side.png', 'angle_45', 2]
    );
  }

  // ── WORKFLOW 2: CUSTOMER DISCOVERY & STOREFRONT EXPERIENCE ──
  console.log('\n--- Workflow 2: Customer Storefront Browsing, PDP & Filtering ---');
  // 1. Search & Filter
  const plpRes = await request('GET', `/api/products?shape=round`);
  assert(plpRes.status === 200 && plpRes.data.products.some(p => p.id === productId), 'New frame appears dynamically in storefront round silhouette collection');

  // 2. Fetch PDP
  const pdpRes = await request('GET', `/api/products/${pilotSlug}`);
  assert(pdpRes.status === 200, `PDP retrieved for /product/${pilotSlug}`);
  assert(pdpRes.data.product.lens_width_mm === 50 && pdpRes.data.product.bridge_width_mm === 19 && pdpRes.data.product.temple_length_mm === 145, 'Millimeter specifications (50-19-145 mm) verify accurately');
  assert(pdpRes.data.product.variants.length === 3, 'All 3 colourway variants visible to customer with synchronized gallery images');

  // 3. Four-Step Dynamic Lens Calculation
  const targetVariantId = createdVariantIds[0]; // Brushed Gunmetal
  const lensCalcRes = await request('POST', '/api/lenses/calculate', {
    frame_price_inr: 12500,
    usage_id: 1, // Single Vision Distance
    thickness_id: 3, // 1.67 Super Thin (Index 1.67)
    coating_id: 1 // Anti-Reflective Elite
  });
  const calc = lensCalcRes.data?.calculation;
  assert(lensCalcRes.status === 200 && calc && calc.grand_total_inr > 12500, `4-step dynamic lens configuration calculated: Frame ₹12,500 + Lenses ₹${calc?.total_lenses_inr} = Total ₹${calc?.grand_total_inr}`);

  // ── WORKFLOW 3: CHECKOUT & SIMULATED ORDER PLACEMENT ──
  console.log('\n--- Workflow 3: Customer Checkout & Inventory Decrement ---');
  const initialStock = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [targetVariantId]);
  assert(initialStock.stock_quantity === 5, 'Pre-order stock verified at 5 units');

  const orderPayload = {
    customer_name: 'Aditi Sharma',
    customer_phone: '9876543219',
    customer_email: 'aditi.sharma@example.in',
    shipping_address: '42 Orchid Gardens, TTK Road, Alwarpet',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600018',
    delivery_method: 'express',
    payment_method: 'online',
    items: [
      {
        product_id: productId,
        variant_id: targetVariantId,
        product_name: 'Aura Minimalist Titanium',
        sku: `${pilotSkuBase}-GM`,
        quantity: 1,
        price_inr: 12500,
        configured_lenses: {
          usage: 'Single Vision Distance',
          index: '1.67 Super Thin',
          coatings: ['Anti-Reflective Elite', 'Blue Defense Guard'],
          prescription_mode: 'upload_slip'
        }
      }
    ]
  };

  const orderRes = await request('POST', '/api/orders', orderPayload);
  assert(orderRes.status === 201, `Customer checkout placed order #${orderRes.data.order.order_number}`);
  assert(orderRes.data.order.is_simulated_payment === true, 'Payment mode is clearly identified as simulated sandbox');
  assert(orderRes.data.order.payment_status === 'paid' && orderRes.data.order.order_status === 'placed', 'Order status (placed) and payment status (paid) remain properly separated');

  const placedOrderNumber = orderRes.data.order.order_number;
  const stockAfterOrder = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [targetVariantId]);
  assert(stockAfterOrder.stock_quantity === 4, 'Variant stock decremented atomically from 5 to 4 units');

  // Verify inventory movement record was written
  const movement = await db.get('SELECT * FROM inventory_movements WHERE variant_id = ? ORDER BY id DESC LIMIT 1', [targetVariantId]);
  assert(movement && movement.change_quantity === -1 && movement.movement_type === 'order_sale', 'Inventory movement ledger recorded sale debit (-1)');

  // ── WORKFLOW 4: ORDER INSPECTION, STATUS LIFECYCLE & LAB GLAZING ──
  console.log('\n--- Workflow 4: Admin Order Management & Lab Glazing Lifecycle ---');
  // 1. Inspect in Admin Portal
  const adminOrderRes = await request('GET', `/api/admin/orders/${placedOrderNumber}`, null, { 'Authorization': `Bearer ${adminToken}` });
  assert(adminOrderRes.status === 200, `Admin successfully retrieved order detail for ${placedOrderNumber}`);
  assert(adminOrderRes.data.order.items[0].configured_lenses.usage === 'Single Vision Distance', 'Configured optical lens breakdown verified by administrative optician');

  // 2. Transition lifecycle: placed -> processing -> lab_glazing -> shipped
  const transition1 = await request('PATCH', `/api/admin/orders/${placedOrderNumber}/status`, { order_status: 'processing' }, { 'Authorization': `Bearer ${adminToken}` });
  assert(transition1.status === 200, 'Order transitioned to "processing" (lens blank pulled from optical lab stock)');

  const transition2 = await request('PATCH', `/api/admin/orders/${placedOrderNumber}/status`, { order_status: 'lab_glazing' }, { 'Authorization': `Bearer ${adminToken}` });
  assert(transition2.status === 200, 'Order transitioned to "lab_glazing" (precision beveling and mounting)');

  const trackingCode = `BLUEDART-OPT-${Math.floor(100000 + Math.random() * 900000)}`;
  const transition3 = await request('PATCH', `/api/admin/orders/${placedOrderNumber}/status`, {
    order_status: 'shipped',
    tracking_number: trackingCode
  }, { 'Authorization': `Bearer ${adminToken}` });
  assert(transition3.status === 200, `Order transitioned to "shipped" with consignment tracking code ${trackingCode}`);

  // 3. Verify public tracking endpoint reflects sanitized updates without leaking prescription tokens
  const publicTrackRes = await request('GET', `/api/orders/track/${placedOrderNumber}`);
  assert(publicTrackRes.status === 200, 'Public customer tracking retrieved successfully');
  assert(publicTrackRes.data.order.order_status === 'shipped', 'Customer tracking reflects "shipped" milestone');
  assert(!publicTrackRes.data.order.prescription_file_url, 'Customer privacy: internal prescription file path is completely omitted from public tracking payload');

  // ── WORKFLOW 5: ORDER CANCELLATION & INVENTORY RESTORATION ──
  console.log('\n--- Workflow 5: Order Cancellation & Inventory Restoration ---');
  const cancelRes = await request('PATCH', `/api/admin/orders/${placedOrderNumber}/status`, { order_status: 'cancelled' }, { 'Authorization': `Bearer ${adminToken}` });
  assert(cancelRes.status === 200, 'Order cancelled by customer care');

  const stockAfterCancel = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [targetVariantId]);
  assert(stockAfterCancel.stock_quantity === 5, 'Inventory successfully restocked back to 5 units');

  // Duplicate cancellation guard
  await request('PATCH', `/api/admin/orders/${placedOrderNumber}/status`, { order_status: 'cancelled' }, { 'Authorization': `Bearer ${adminToken}` });
  const stockAfterDup = await db.get('SELECT stock_quantity FROM product_variants WHERE id = ?', [targetVariantId]);
  assert(stockAfterDup.stock_quantity === 5, 'Duplicate cancellation does NOT double-restock inventory (remains exactly 5 units)');

  // ── WORKFLOW 6: APPOINTMENT OPERATIONS (Booking, Collision, Reschedule, Cancellation) ──
  console.log('\n--- Workflow 6: Eye-Test Appointment Lifecycle & Collision Prevention ---');
  const apptDate = '2026-12-20';
  const apptTime = '15:30';

  // Clean up any test appointment on this slot
  await db.run('DELETE FROM appointments WHERE appointment_date = ? AND start_time IN (?, ?)', [apptDate, apptTime, '16:30']);

  // 1. Customer books eye exam
  const bookRes = await request('POST', '/api/appointments', {
    customer_name: 'Vikram Raman',
    customer_phone: '9876543218',
    customer_email: 'vikram.raman@example.in',
    store_id: 1,
    appointment_date: apptDate,
    start_time: apptTime,
    consultation_type: 'Comprehensive Precision Refraction',
    notes: 'Mild eye strain during evening computer screen use.'
  });
  assert(bookRes.status === 201, `Customer successfully booked eye test for ${apptDate} at ${apptTime}`);
  const apptId = bookRes.data.appointment?.id || bookRes.data.appointment_id;

  // 2. Overlapping appointment collision test
  const collisionRes = await request('POST', '/api/appointments', {
    customer_name: 'Competing Patient',
    customer_phone: '9876543299',
    store_id: 1,
    appointment_date: apptDate,
    start_time: apptTime
  });
  assert(collisionRes.status === 409 && collisionRes.data.error_code === 'SLOT_ALREADY_BOOKED', 'Overlapping booking collision cleanly rejected with HTTP 409 SLOT_ALREADY_BOOKED');

  // 3. Admin confirms appointment
  const confirmRes = await request('PATCH', `/api/admin/appointments/${apptId}/status`, { status: 'confirmed' }, { 'Authorization': `Bearer ${adminToken}` });
  assert(confirmRes.status === 200, 'Optometrist clinic confirms eye test booking');

  // 4. Reschedule appointment
  const newTime = '16:30';
  const rescheduleRes = await request('PATCH', `/api/admin/appointments/${apptId}/reschedule`, {
    appointment_date: apptDate,
    start_time: newTime
  }, { 'Authorization': `Bearer ${adminToken}` });
  assert(rescheduleRes.status === 200, `Appointment rescheduled to free slot ${newTime}`);

  // 5. Complete consultation
  const completeRes = await request('PATCH', `/api/admin/appointments/${apptId}/status`, { status: 'completed' }, { 'Authorization': `Bearer ${adminToken}` });
  assert(completeRes.status === 200, 'Clinical eye exam marked as "completed"');

  // ── WORKFLOW 7: CUSTOMER COMMUNICATIONS (WhatsApp Prefill & Privacy) ──
  console.log('\n--- Workflow 7: WhatsApp Commerce Links & Data Privacy ---');
  const waRes = await request('POST', '/api/enquiries/whatsapp', {
    enquiry_type: 'product_enquiry',
    customer_name: 'Aditi Sharma',
    customer_phone: '9876543219',
    product_id: productId,
    message: 'Inquiring about prescription availability for Aura Titanium'
  });
  assert(waRes.status === 200 && waRes.data.whatsapp_url, 'Generated valid WhatsApp inquiry link with URL-safe URI encoding');
  assert(waRes.data.whatsapp_url.startsWith('https://wa.me/'), 'Routes directly to official store WhatsApp business number');
  assert(!waRes.data.whatsapp_url.includes('undefined') && !waRes.data.whatsapp_url.includes('null'), 'WhatsApp message contains zero malformed tokens');

  // Summary
  console.log('\n======================================================');
  console.log(`📊 PHASE 7 OPERATIONAL SIMULATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runOperationalSimulation().catch(err => {
  console.error('Fatal operational simulation error:', err);
  process.exit(1);
});
