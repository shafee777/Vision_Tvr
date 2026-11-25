/**
 * Optii Phase 4 Automated Test Suite
 * Validating: Shopping Bag, Checkout, Order Creation, Stock Decrement,
 * Promo Validation, Public Order Tracking, and Concurrency-Safe Appointment Booking.
 */

const http = require('http');
const db = require('../server/db/database');

const PORT = 5050;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let postData = null;

    if (body) {
      postData = typeof body === 'string' ? body : JSON.stringify(body);
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
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (_) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING OPTII PHASE 4 INTEGRATION TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`✓ [PASS] Check ${total}: ${message}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] Check ${total}: ${message}`);
      process.exitCode = 1;
    }
  }

  try {
    // 1. Promo Code Validation - Invalid Code
    const promoInvalid = await request('POST', '/api/orders/validate-promo', {
      code: 'INVALID_CODE',
      subtotal_inr: 5000
    });
    assert(promoInvalid.status === 404 && promoInvalid.data.valid === false, 'Rejects invalid promo code with HTTP 404');

    // 2. Promo Code Validation - Below Minimum Order Value
    const promoMinCheck = await request('POST', '/api/orders/validate-promo', {
      code: 'WELCOME500',
      subtotal_inr: 1500 // Min required is 3000
    });
    assert(promoMinCheck.status === 400 && promoMinCheck.data.valid === false, 'Rejects WELCOME500 when subtotal < min threshold with HTTP 400');

    // 3. Promo Code Validation - Valid WELCOME500
    const promoValid = await request('POST', '/api/orders/validate-promo', {
      code: 'WELCOME500',
      subtotal_inr: 9500
    });
    assert(promoValid.status === 200 && promoValid.data.discount_inr === 500, 'Applies WELCOME500 giving exact ₹500 discount');

    // 4. Promo Code Validation - Valid Percentage OPTII10
    const promoPercent = await request('POST', '/api/orders/validate-promo', {
      code: 'OPTII10',
      subtotal_inr: 9500
    });
    assert(promoPercent.status === 200 && promoPercent.data.discount_inr === 950, 'Applies OPTII10 giving exact 10% discount (₹950 on ₹9,500)');

    // 5. Order Placement - Field Validation Rejection
    const orderMissingFields = await request('POST', '/api/orders', {
      customer_name: '',
      customer_phone: '123' // Invalid
    });
    assert(orderMissingFields.status === 400 && orderMissingFields.data.success === false, 'Rejects order with missing fields / invalid phone');

    // 6. Check Initial Inventory Stock for Variant 1 (Tigerwood)
    const db = require('../server/db/database');
    const initialVariant = await db.get('SELECT stock_quantity FROM product_variants WHERE id = 1');
    const initialStock = initialVariant.stock_quantity;
    assert(initialStock > 0, `Tigerwood variant has active stock (${initialStock} units)`);

    // 7. Order Placement - Excessive Quantity Rejection
    const orderExcessive = await request('POST', '/api/orders', {
      customer_name: 'Test Patron',
      customer_phone: '9876543210',
      shipping_address: '12 Temple Street',
      city: 'Thiruvarur',
      state: 'Tamil Nadu',
      pincode: '610001',
      items: [
        {
          variant_id: 1,
          product_name: 'Henry Round Acetate',
          price_inr: 9500,
          quantity: 9999 // Exceeds stock
        }
      ]
    });
    assert(orderExcessive.status === 400 && orderExcessive.data.error_code === 'INSUFFICIENT_STOCK', 'Rejects order exceeding available inventory with INSUFFICIENT_STOCK');

    // 8. Place Valid Order with Promo Code & Inventory Decrement
    const orderPlacement = await request('POST', '/api/orders', {
      customer_name: 'Shafeeq Ahmed',
      customer_phone: '9876543210',
      customer_email: 'shafeeq@example.com',
      shipping_address: '12 Kamalalayam West',
      city: 'Thiruvarur',
      state: 'Tamil Nadu',
      pincode: '610001',
      delivery_method: 'express',
      payment_method: 'online',
      promo_code: 'WELCOME500',
      items: [
        {
          variant_id: 1,
          product_name: 'Henry Round Acetate',
          color_name: 'Tigerwood',
          sku: 'OPT-HEN-01-TIG',
          price_inr: 9500,
          total_price_inr: 15200,
          quantity: 1,
          configured_lenses: {
            usage_name: 'Single Vision Distance',
            thickness_name: '1.67 Super Thin',
            coating_name: 'Anti-Reflective'
          }
        }
      ]
    });

    assert(orderPlacement.status === 201 && orderPlacement.data.success === true, 'Successfully places valid optical order');
    const placedOrder = orderPlacement.data.order;
    assert(placedOrder.order_number && placedOrder.order_number.startsWith('OPT-ORD-'), `Generates formatted order number: ${placedOrder.order_number}`);
    assert(placedOrder.discount_inr === 500 && placedOrder.total_amount_inr === 14700, 'Accurately computes ₹15,200 - ₹500 discount = ₹14,700');
    assert(placedOrder.tracking_number && placedOrder.tracking_number.startsWith('BLUEDART-OPT-'), `Generates insured consignment number: ${placedOrder.tracking_number}`);

    // 9. Verify Inventory Stock Decremented Atomically
    const postVariant = await db.get('SELECT stock_quantity FROM product_variants WHERE id = 1');
    assert(postVariant.stock_quantity === initialStock - 1, `Variant stock successfully decremented by 1 (${initialStock} -> ${postVariant.stock_quantity})`);

    // 10. Public Real-Time Order Tracking Endpoint
    const trackRes = await request('GET', `/api/orders/track/${placedOrder.order_number}`);
    assert(trackRes.status === 200 && trackRes.data.success === true, 'Retrieves public order tracking details');
    const trackOrder = trackRes.data.order;
    assert(trackOrder.stages && trackOrder.stages.length === 5, 'Returns 5 optical glazing & transit milestones');
    assert(trackOrder.stages[0].completed === true, 'First milestone (Order Confirmed) is completed');

    // 11. Multi-Item Shopping Bag WhatsApp Enquiry
    const waEnquiry = await request('POST', '/api/enquiries/whatsapp', {
      customer_name: 'Shafeeq',
      customer_phone: '9876543210',
      total_price_inr: 14700,
      items: [
        {
          product_name: 'Henry Round Acetate',
          color_name: 'Tigerwood',
          total_price_inr: 14700,
          quantity: 1,
          configured_lenses: {
            usage_name: 'Single Vision Distance',
            thickness_name: '1.67 Super Thin'
          }
        }
      ]
    });
    assert(waEnquiry.status === 200 && waEnquiry.data.whatsapp_url.includes('wa.me'), 'Generates valid multi-item WhatsApp bag inquiry link');

    // 12. In-Store Eye Test Concurrency Collision Protection Test
    // Pick unique date and slot, clean up slot first for idempotency
    const testDate = '2026-12-15';
    const testSlot = '11:00';
    await db.run('DELETE FROM appointments WHERE appointment_date = ?', [testDate]);

    // First booking attempt
    const book1 = await request('POST', '/api/appointments', {
      store_id: 1,
      customer_name: 'Patient Alpha',
      customer_phone: '9876543211',
      appointment_date: testDate,
      start_time: testSlot
    });
    assert(book1.status === 201 && book1.data.success === true, 'First patient successfully books appointment slot');

    // Second booking attempt on EXACT same slot (simulating race condition)
    const book2 = await request('POST', '/api/appointments', {
      store_id: 1,
      customer_name: 'Patient Beta (Concurrent Collision)',
      customer_phone: '9876543212',
      appointment_date: testDate,
      start_time: testSlot
    });
    assert(book2.status === 409 && book2.data.error_code === 'SLOT_ALREADY_BOOKED', 'Rejects concurrent double-booking with HTTP 409 SLOT_ALREADY_BOOKED');

    // 13. Query Slots for the Date & Verify Slot is Marked Unavailable
    const slotsRes = await request('GET', `/api/stores/1/slots?date=${testDate}`);
    assert(slotsRes.status === 200 && slotsRes.data.slots.length > 0, 'Retrieves slot availability for branch');
    const targetSlot = slotsRes.data.slots.find(s => s.start_time === testSlot);
    assert(targetSlot && targetSlot.is_available === false, `Booked slot ${testSlot} is accurately marked is_available = false`);

    // 14. HTML Pages Accessibility Verification
    const homeHtml = await request('GET', '/');
    assert(homeHtml.status === 200 && homeHtml.text.includes('Optii'), 'Homepage HTML loads successfully');

    const pdpHtml = await request('GET', '/product/henry-round-acetate');
    assert(pdpHtml.status === 200 && pdpHtml.text.includes('Select Lenses'), 'Product Detail Page HTML loads successfully');

    const trackHtml = await request('GET', '/track');
    assert(trackHtml.status === 200 && trackHtml.text.includes('Track Your Optical Order'), 'Dedicated Track Order page loads successfully');

    // Summary
    console.log('\n======================================================');
    console.log(`🏁 PHASE 4 TEST RESULTS: ${passed}/${total} PASSED`);
    console.log('======================================================\n');

  } catch (err) {
    console.error('Test Suite Error:', err);
    process.exit(1);
  }
}

runTests().then(() => {
  process.exit(process.exitCode || 0);
});
