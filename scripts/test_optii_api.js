const http = require('http');
const { app } = require('../server');
const db = require('../server/db/database');

const TEST_PORT = 5055;
let server = null;

function request(path, options = {}) {
  return new Promise((resolve) => {
    const method = options.method || 'GET';
    const headers = { ...(options.headers || {}) };
    let body = options.body;

    if (body && typeof body === 'object' && !(body instanceof Buffer)) {
      body = JSON.stringify(body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    if (body) {
      headers['Content-Length'] = Buffer.byteLength(body);
    } else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      headers['Content-Length'] = 0;
    }

    const req = http.request({
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method,
      headers,
      timeout: 5000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch (_) {
          parsed = data;
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 408, error: 'Request Timeout' });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });

    if (body) req.write(body);
    req.end();
  });
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('🔬 STARTING COMPLETE OPTII GREENFIELD API & SCHEMA VALIDATION');
  console.log('===============================================================\n');

  // Start temporary test server
  server = app.listen(TEST_PORT);
  await new Promise(r => setTimeout(r, 400));

  const results = [];
  function record(name, endpoint, passed, details, status) {
    results.push({ name, endpoint, passed, details, status });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${mark} | [${status || 'ERR'}] ${name.padEnd(40)} (${endpoint})`);
    if (!passed) {
      console.log(`   -> Error Details:`, typeof details === 'object' ? JSON.stringify(details) : details);
    }
  }

  try {
    // 1. Health Check
    const health = await request('/api/health');
    record('Health Check & DB Status', '/api/health', 
      health.status === 200 && health.data.status === 'ok' && health.data.tables_active >= 17, 
      health.data, health.status
    );

    // 2. Auth Login
    const login = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'admin', password: 'optii123' }
    });
    const token = login.data && login.data.token;
    record('Admin Auth Login (JWT)', '/api/auth/login', 
      login.status === 200 && !!token && login.data.user.role === 'admin', 
      login.data, login.status
    );

    const authHeader = { 'Authorization': `Bearer ${token}` };

    // 3. Auth Me
    const me = await request('/api/auth/me', { headers: authHeader });
    record('Admin Auth Profile Verification', '/api/auth/me', 
      me.status === 200 && me.data.user && me.data.user.username === 'admin', 
      me.data, me.status
    );

    // 4. Optical Frame Shapes (Ace & Tate Filter Drawer)
    const shapes = await request('/api/shapes');
    record('Frame Shapes with Line-Art SVGs', '/api/shapes', 
      shapes.status === 200 && shapes.data.count >= 6 && shapes.data.shapes[0].icon_svg.includes('<svg'), 
      shapes.data, shapes.status
    );

    // 5. Optical Brands
    const brands = await request('/api/brands');
    record('Optical Brands Directory', '/api/brands', 
      brands.status === 200 && brands.data.count >= 6, 
      brands.data, brands.status
    );

    // 6. Categories
    const categories = await request('/api/categories');
    record('Product Categories', '/api/categories', 
      categories.status === 200 && categories.data.count >= 6, 
      categories.data, categories.status
    );

    // 7. Product Listing (PLP) & 1:1 Images
    const products = await request('/api/products');
    const firstProd = products.data.products && products.data.products[0];
    const hasImagePairs = firstProd && firstProd.default_variant && firstProd.default_variant.primary_image;
    record('Product Listing & 1:1 Image Pairs', '/api/products', 
      products.status === 200 && products.data.count >= 6 && hasImagePairs, 
      products.data, products.status
    );

    // 8. PLP Filter by Shape (Round)
    const shapeFilter = await request('/api/products?shape=round');
    record('PLP Filter by Shape (Round)', '/api/products?shape=round', 
      shapeFilter.status === 200 && shapeFilter.data.products.every(p => p.shape_slug === 'round'), 
      shapeFilter.data, shapeFilter.status
    );

    // 9. PLP Sort by Price Ascending
    const sortFilter = await request('/api/products?sort=price_asc');
    const prices = sortFilter.data.products ? sortFilter.data.products.map(p => p.base_price_inr) : [];
    const isSorted = prices.slice(1).every((p, i) => p >= prices[i]);
    record('PLP Sort by Price (Ascending)', '/api/products?sort=price_asc', 
      sortFilter.status === 200 && isSorted, 
      prices, sortFilter.status
    );

    // 10. Product Detail Page (PDP) & Millimeter Specs
    const pdp = await request('/api/products/henry-round-acetate');
    const hasMm = pdp.data.product && pdp.data.product.dimensions && pdp.data.product.dimensions.display_string === '51-20-150 mm';
    record('PDP & Millimeter Specs (51-20-150 mm)', '/api/products/henry-round-acetate', 
      pdp.status === 200 && hasMm, 
      pdp.data, pdp.status
    );

    // 11. Progressive 4-Step Optical Lens Hierarchy
    const lenses = await request('/api/lenses');
    const steps = lenses.data && lenses.data.steps;
    record('Progressive 4-Step Lens Tiers', '/api/lenses', 
      lenses.status === 200 && steps && steps.step1_usages.length >= 4 && steps.step3_thicknesses.length === 4 && steps.step4_coatings.length === 4, 
      lenses.data, lenses.status
    );

    // 12. Dynamic Optical Pricing Calculation
    // Frame: 9500 + Progressive Usage (2500) + 1.67 Super Thin (2400) + Blue Shield (800) = 15200
    const calc = await request('/api/lenses/calculate', {
      method: 'POST',
      body: {
        frame_price_inr: 9500,
        usage_id: 3,       // Progressive: 2500
        thickness_id: 3,   // 1.67 Super Thin: 2400
        coating_id: 2      // Blue Light Shield: 800
      }
    });
    const expectedTotal = 9500 + 2500 + 2400 + 800; // 15200
    const calcMatch = calc.data.calculation && calc.data.calculation.grand_total_inr === expectedTotal;
    record('Dynamic Optical Math (Frame + 4 Lenses)', '/api/lenses/calculate', 
      calc.status === 200 && calcMatch, 
      calc.data, calc.status
    );

    // 13. Stores & Available 30-Min Slot Calculation
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const slots = await request(`/api/stores/1/slots?date=${dateStr}`);
    record('Store 30-Min Available Slots Engine', `/api/stores/1/slots?date=${dateStr}`, 
      slots.status === 200 && slots.data.total_slots > 0 && Array.isArray(slots.data.slots), 
      slots.data, slots.status
    );

    // 14. In-Store Eye Test Booking (Clean up test slot first for idempotency)
    const testDate = '2028-05-15';
    const testTime = '11:00';
    await db.run('DELETE FROM appointments WHERE appointment_date = ?', [testDate]);

    const book1 = await request('/api/appointments', {
      method: 'POST',
      body: {
        store_id: 1,
        customer_name: 'Priya Sundaram',
        customer_phone: '+919486552324',
        customer_email: 'priya@example.com',
        appointment_date: testDate,
        start_time: testTime,
        notes: 'Annual vision check'
      }
    });
    record('Book In-Store Eye Test', '/api/appointments', 
      book1.status === 201 && book1.data.appointment && book1.data.appointment.appointment_number.startsWith('OPT-APP'), 
      book1.data, book1.status
    );

    // 15. Atomic Slot Collision Lock (Prevent Overlapping Confirmed Bookings)
    const bookDuplicate = await request('/api/appointments', {
      method: 'POST',
      body: {
        store_id: 1,
        customer_name: 'Rajesh Kumar',
        customer_phone: '+919876543210',
        appointment_date: testDate,
        start_time: testTime // EXACT SAME SLOT
      }
    });
    record('Slot Collision Prevention (409 Conflict)', '/api/appointments', 
      bookDuplicate.status === 409 && bookDuplicate.data.error_code === 'SLOT_ALREADY_BOOKED', 
      bookDuplicate.data, bookDuplicate.status
    );

    // 16. WhatsApp Pre-filled Order Inquiry Generator
    const wa = await request('/api/enquiries/whatsapp', {
      method: 'POST',
      body: {
        product_id: 1,
        product_name: 'Henry Round Acetate',
        sku: 'OPT-HEN-01-TIG',
        color_name: 'Tigerwood',
        dimensions: '51-20-150 mm',
        lens_usage: 'Single Vision Distance',
        lens_thickness: '1.67 Super Thin Index',
        lens_coating: 'Blue Light Shield',
        total_price_inr: 12700,
        customer_name: 'Vikram Seth',
        customer_phone: '+919486552324'
      }
    });
    const waValid = wa.data && wa.data.whatsapp_url && wa.data.whatsapp_url.includes('wa.me') && wa.data.enquiry_id;
    record('WhatsApp Prefilled Link & Lead Logging', '/api/enquiries/whatsapp', 
      wa.status === 200 && waValid, 
      wa.data, wa.status
    );

    // 17. Optical Order Placement
    const order = await request('/api/orders', {
      method: 'POST',
      body: {
        customer_name: 'Ananya Sharma',
        customer_phone: '+919486552324',
        customer_email: 'ananya@example.com',
        shipping_address: '42 MG Road, Anna Nagar',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600040',
        items: [
          {
            product_id: 1,
            name: 'Henry Round Acetate',
            sku: 'OPT-HEN-01-TIG',
            price_inr: 9500,
            quantity: 1,
            configured_lenses: {
              usage: 'Single Vision Distance',
              index: '1.67 Super Thin',
              coating: 'Blue Light Shield',
              lens_price_inr: 3200
            },
            total_price_inr: 12700
          }
        ],
        subtotal_inr: 12700,
        discount_inr: 0,
        payment_method: 'online'
      }
    });
    const orderNo = order.data.order && order.data.order.order_number;
    record('Place Optical Order', '/api/orders', 
      order.status === 201 && !!orderNo && orderNo.startsWith('OPT-ORD'), 
      order.data, order.status
    );

    // 17b. Server-Side Price Integrity (Tampered Client Price Ignored)
    const tamperedOrder = await request('/api/orders', {
      method: 'POST',
      body: {
        customer_name: 'Tamper Audit',
        customer_phone: '+919486552324',
        shipping_address: '42 MG Road, Anna Nagar',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600040',
        items: [
          {
            product_id: 1,
            sku: 'OPT-HEN-01-TIG',
            price_inr: 1,
            item_price_inr: 1,
            total_price_inr: 1,
            quantity: 1,
            configured_lenses: {
              usage: 'Single Vision Distance',
              index: '1.67 Super Thin',
              coating: 'Blue Light Shield',
              lens_price_inr: 0
            }
          }
        ],
        subtotal_inr: 1,
        payment_method: 'online'
      }
    });
    const tamperedTotal = tamperedOrder.data && tamperedOrder.data.order && tamperedOrder.data.order.total_amount_inr;
    record('Server Ignores Tampered Client Price (12700 INR)', '/api/orders',
      tamperedOrder.status === 201 && tamperedTotal === 12700,
      { expected: 12700, actual: tamperedTotal }, tamperedOrder.status
    );

    // 18. Public Order Tracking
    const track = await request(`/api/orders/track/${orderNo}`);
    record('Public Optical Order Tracking', `/api/orders/track/${orderNo}`, 
      track.status === 200 && track.data.order && track.data.order.order_number === orderNo, 
      track.data, track.status
    );

    // 19. Admin Dashboard Summary Metrics
    const summary = await request('/api/admin/summary', { headers: authHeader });
    const metrics = summary.data && summary.data.metrics;
    record('Admin Dashboard Summary KPIs', '/api/admin/summary', 
      summary.status === 200 && metrics && metrics.active_products >= 6 && metrics.total_appointments >= 2, 
      summary.data, summary.status
    );

    // 20. Admin Inventory Variant Matrix
    const inventory = await request('/api/admin/inventory', { headers: authHeader });
    record('Admin Inventory Variant Matrix', '/api/admin/inventory', 
      inventory.status === 200 && Array.isArray(inventory.data.inventory) && inventory.data.inventory.length >= 9, 
      inventory.data, inventory.status
    );

    // 21. Admin Clinic Settings Update (Authenticated + Zod Validation)
    const badSettings = await request('/api/admin/settings', {
      method: 'PUT',
      headers: authHeader,
      body: { name: 'A', address: '123', phone: 'bad' }
    });
    const origSettings = await request('/api/admin/settings', { headers: authHeader });
    const origStore = origSettings.data && origSettings.data.store;
    const goodSettings = await request('/api/admin/settings', {
      method: 'PUT',
      headers: authHeader,
      body: {
        name: origStore ? origStore.name : 'Optii Flagship Clinic',
        address: origStore ? origStore.address : '12 Kamalalayam West Bank, Thiruvarur',
        phone: origStore ? origStore.phone : '+919486552324'
      }
    });
    record('Admin Clinic Settings (Zod + Persist)', '/api/admin/settings',
      badSettings.status === 400 && goodSettings.status === 200 && goodSettings.data.success === true,
      { bad: badSettings.status, good: goodSettings.status }, goodSettings.status
    );

  } catch (err) {
    console.error('Fatal Test Exception:', err);
  } finally {
    if (server) server.close();
  }

  const passedCount = results.filter(r => r.passed).length;
  const totalCount = results.length;

  console.log('\n===============================================================');
  console.log(`TOTAL AUDIT CHECKS: ${totalCount} | PASSED: ${passedCount} | FAILED: ${totalCount - passedCount}`);
  console.log('===============================================================\n');

  if (passedCount === totalCount) {
    console.log('✨ PHASE 1 COMPLETE: Optii fresh database, migrations, seed data, and API contracts are 100% verified!\n');
    process.exit(0);
  } else {
    console.error('❌ PHASE 1 VALIDATION FAILED: Some tests did not pass.\n');
    process.exit(1);
  }
}

runTestSuite();
