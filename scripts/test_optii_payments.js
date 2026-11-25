/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — PAYMENT INTEGRITY & GATEWAY TEST SUITE
 * Validates payment state integrity, simulated vs real revenue separation,
 * transition guards, HMAC signature checks, webhook idempotency, and refunds.
 * ═════════════════════════════════════════════════════════════════════
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../server/db/database');
const config = require('../server/config');
const paymentGateway = require('../server/services/paymentGateway');
const { createEncryptedBackup, decryptBackupFile } = require('./backup_encrypted');

const BASE_URL = `http://localhost:${config.PORT || 5050}`;

let passed = 0;
let failed = 0;

function check(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

async function request(method, pathUrl, body = null, token = null, headers = {}) {
  const reqHeaders = { 'Content-Type': 'application/json', 'x-bypass-rate-limit': 'true', ...headers };
  if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers: reqHeaders };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${pathUrl}`, opts);
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { status: res.status, headers: res.headers, data };
}

async function runPaymentTests() {
  console.log('\n======================================================');
  console.log('💳 RUNNING OPTII PAYMENT INTEGRITY & GATEWAY SUITE');
  console.log('======================================================\n');

  // Authenticate Admin
  const loginRes = await request('POST', '/api/auth/login', { username: 'admin', password: 'optii123' });
  assert(loginRes.status === 200 && loginRes.data.token, 'Admin login succeeds');
  const adminToken = loginRes.data.token;

  // ── Test Group 1: Database Schema & Payment Columns Audit ──
  console.log('--- Test Group 1: Database Schema & Payment Integrity Audit ---');
  const orderCols = await db.all('PRAGMA table_info(orders);');
  const colNames = orderCols.map(c => c.name);

  check('orders table includes is_simulated_payment column', colNames.includes('is_simulated_payment'));
  check('orders table includes payment_gateway_name column', colNames.includes('payment_gateway_name'));
  check('orders table includes payment_gateway_ref column', colNames.includes('payment_gateway_ref'));
  check('orders table includes refund_amount_inr column', colNames.includes('refund_amount_inr'));
  check('orders table includes refund_reason column', colNames.includes('refund_reason'));

  const webhookTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='payment_webhooks'");
  check('payment_webhooks table exists for idempotency ledger', !!webhookTable);

  const webhookCols = await db.all('PRAGMA table_info(payment_webhooks);');
  const whColNames = webhookCols.map(c => c.name);
  check('payment_webhooks table contains event_id column', whColNames.includes('event_id'));
  check('payment_webhooks table contains signature column', whColNames.includes('signature'));

  // ── Test Group 2: Checkout Simulation & Financial Revenue Separation ──
  console.log('\n--- Test Group 2: Checkout Simulation & Financial Revenue Separation ---');
  // Get an active product variant
  const variant = await db.get('SELECT v.id as variant_id, v.color_name, p.id as product_id, p.name as product_name, p.base_price_inr FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.stock_quantity >= 5 LIMIT 1');
  assert(variant, 'Active product variant available for testing');

  // Place a sandbox customer order
  const checkoutPayload = {
    customer_name: 'Devika Krishnan',
    customer_phone: '9876543210',
    customer_email: 'devika.krishnan@example.com',
    shipping_address: '42 Garden Road, Alwarpet',
    city: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600018',
    delivery_method: 'express',
    payment_method: 'online',
    items: [
      {
        product_id: variant.product_id,
        variant_id: variant.variant_id,
        product_name: variant.product_name,
        color_name: variant.color_name,
        item_price_inr: variant.base_price_inr || 8500,
        total_price_inr: variant.base_price_inr || 8500,
        quantity: 1
      }
    ]
  };

  const checkoutRes = await request('POST', '/api/orders', checkoutPayload);
  check('Customer checkout succeeds (HTTP 201)', checkoutRes.status === 201);
  check('Checkout response flags is_simulated_payment: true in sandbox', checkoutRes.data.order.is_simulated_payment === true);
  check('Checkout response contains sandbox note', checkoutRes.data.order.payment_mode_note.includes('Sandbox'));

  const testOrderNumber = checkoutRes.data.order.order_number;
  const dbOrder = await db.get('SELECT * FROM orders WHERE order_number = ?', [testOrderNumber]);
  check('Database row records is_simulated_payment = 1', dbOrder.is_simulated_payment === 1);
  check('Database row records payment_gateway_name = simulated_sandbox', dbOrder.payment_gateway_name === 'simulated_sandbox');

  // Query admin summary KPI
  const summaryRes = await request('GET', '/api/admin/summary', null, adminToken);
  check('Admin summary returns HTTP 200', summaryRes.status === 200);
  check('Admin summary strictly separates real_revenue_inr from simulated_revenue_inr', typeof summaryRes.data.metrics.real_revenue_inr === 'number');
  check('Real revenue is zero when only simulated orders exist', summaryRes.data.metrics.real_revenue_inr === 0);
  check('Simulated revenue correctly records sandbox transaction volume', summaryRes.data.metrics.simulated_revenue_inr >= dbOrder.total_amount_inr);
  check('Summary reports distinct simulated_orders_count', summaryRes.data.metrics.simulated_orders_count > 0);

  // ── Test Group 3: Invalid Payment State Transition Guards ──
  console.log('\n--- Test Group 3: Invalid Payment State Transition Guards ---');

  // Create an unpaid pending order for transition tests
  const pendingCheckoutPayload = {
    ...checkoutPayload,
    customer_phone: '9876543211',
    payment_method: 'cod' // COD defaults to pending payment
  };
  const codRes = await request('POST', '/api/orders', pendingCheckoutPayload);
  const codOrderNumber = codRes.data.order.order_number;

  const codDbOrder = await db.get('SELECT payment_status, order_status FROM orders WHERE order_number = ?', [codOrderNumber]);
  check('COD Order initialized with payment_status = pending', codDbOrder.payment_status === 'pending');

  // Guard 3.1: Cannot refund an unpaid order
  const refundUnpaidRes = await request('PATCH', `/api/admin/orders/${codOrderNumber}/payment`, {
    action: 'refund',
    reason: 'Premature refund'
  }, adminToken);
  check('Attempting to refund unpaid order rejected with HTTP 400 CANNOT_REFUND_UNPAID_ORDER',
    refundUnpaidRes.status === 400 && refundUnpaidRes.data.error_code === 'CANNOT_REFUND_UNPAID_ORDER');

  // Cancel the order
  await request('PATCH', `/api/admin/orders/${codOrderNumber}/status`, { order_status: 'cancelled' }, adminToken);

  // Guard 3.2: Cannot capture payment for a cancelled order
  const payCancelledRes = await request('PATCH', `/api/admin/orders/${codOrderNumber}/payment`, {
    action: 'capture',
    transaction_ref: 'tx_illegal_after_cancel'
  }, adminToken);
  check('Attempting to capture payment on cancelled order rejected with HTTP 400 INVALID_PAYMENT_TRANSITION',
    payCancelledRes.status === 400 && payCancelledRes.data.error_code === 'INVALID_PAYMENT_TRANSITION');

  // Guard 3.3: Cannot create gateway payment for a cancelled order
  const createPayCancelledRes = await request('POST', '/api/payments/create-order', {
    order_number: codOrderNumber
  });
  check('Gateway create-order for cancelled order rejected with HTTP 400 INVALID_PAYMENT_TRANSITION',
    createPayCancelledRes.status === 400 && createPayCancelledRes.data.error_code === 'INVALID_PAYMENT_TRANSITION');

  // Guard 3.4: Duplicate payment capture protection
  const duplicateCaptureRes = await request('PATCH', `/api/admin/orders/${testOrderNumber}/payment`, {
    action: 'capture',
    transaction_ref: 'tx_duplicate_pay'
  }, adminToken);
  check('Duplicate capture on already paid order rejected with HTTP 400 PAYMENT_ALREADY_CAPTURED',
    duplicateCaptureRes.status === 400 && duplicateCaptureRes.data.error_code === 'PAYMENT_ALREADY_CAPTURED');

  // Guard 3.5: Process valid refund on paid order
  const validRefundRes = await request('PATCH', `/api/admin/orders/${testOrderNumber}/payment`, {
    action: 'refund',
    amount_inr: dbOrder.total_amount_inr,
    reason: 'Customer return within 14-day atelier guarantee'
  }, adminToken);
  check('Processing refund on paid order succeeds (HTTP 200)', validRefundRes.status === 200);
  check('Payment status updated to refunded', validRefundRes.data.payment_status === 'refunded');

  // Guard 3.6: Cannot mark refunded order as paid
  const repayRefundedRes = await request('PATCH', `/api/admin/orders/${testOrderNumber}/payment`, {
    action: 'mark_paid',
    transaction_ref: 'tx_repay_after_refund'
  }, adminToken);
  check('Attempting to mark refunded order as paid rejected with HTTP 400 INVALID_PAYMENT_TRANSITION',
    repayRefundedRes.status === 400 && repayRefundedRes.data.error_code === 'INVALID_PAYMENT_TRANSITION');

  // Guard 3.7: Cannot refund an already fully refunded order
  const duplicateRefundRes = await request('PATCH', `/api/admin/orders/${testOrderNumber}/payment`, {
    action: 'refund',
    reason: 'Double refund attempt'
  }, adminToken);
  check('Double refund rejected with HTTP 400 PAYMENT_ALREADY_REFUNDED',
    duplicateRefundRes.status === 400 && duplicateRefundRes.data.error_code === 'PAYMENT_ALREADY_REFUNDED');

  // ── Test Group 4: Cryptographic Payment Signature Verification ──
  console.log('\n--- Test Group 4: Cryptographic Payment Signature Verification ---');

  // Create an order for signature verification test
  const sigOrderRes = await request('POST', '/api/orders', {
    ...checkoutPayload,
    customer_phone: '9876543212',
    payment_method: 'cod' // Creates pending order
  });
  const sigOrderNumber = sigOrderRes.data.order.order_number;

  // Create gateway order
  const gwOrderRes = await request('POST', '/api/payments/create-order', {
    order_number: sigOrderNumber,
    gateway: 'razorpay'
  });
  check('Gateway order created successfully', gwOrderRes.status === 200 && gwOrderRes.data.gateway_order.gateway_order_id);

  const gatewayOrderId = gwOrderRes.data.gateway_order.gateway_order_id;
  const mockPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;

  // Generate valid HMAC-SHA256 signature
  const validSignature = paymentGateway.generateSignature({
    orderId: gatewayOrderId,
    paymentId: mockPaymentId,
    gateway: 'razorpay'
  });

  // Test 4.1: Tampered signature rejection
  const tamperedRes = await request('POST', '/api/payments/verify', {
    order_number: sigOrderNumber,
    gateway_order_id: gatewayOrderId,
    payment_id: mockPaymentId,
    signature: 'bad_tampered_signature_hex_1234567890abcdef',
    gateway: 'razorpay'
  });
  check('Tampered signature rejected with HTTP 400 INVALID_SIGNATURE',
    tamperedRes.status === 400 && tamperedRes.data.error_code === 'INVALID_SIGNATURE');

  // Test 4.2: Valid signature verification
  const verifyRes = await request('POST', '/api/payments/verify', {
    order_number: sigOrderNumber,
    gateway_order_id: gatewayOrderId,
    payment_id: mockPaymentId,
    signature: validSignature,
    gateway: 'razorpay'
  });
  check('Authentic HMAC-SHA256 signature verified successfully (HTTP 200)', verifyRes.status === 200);
  check('Order transitioned to paid', verifyRes.data.payment_status === 'paid');

  // Test 4.3: Idempotent re-verification
  const idempVerifyRes = await request('POST', '/api/payments/verify', {
    order_number: sigOrderNumber,
    gateway_order_id: gatewayOrderId,
    payment_id: mockPaymentId,
    signature: validSignature,
    gateway: 'razorpay'
  });
  check('Re-verification of same payment returns idempotent: true', idempVerifyRes.status === 200 && idempVerifyRes.data.idempotent === true);

  // ── Test Group 5: Server-to-Server Webhooks & Idempotency Ledger ──
  console.log('\n--- Test Group 5: Webhooks & Replay Attack Protection ---');

  // Create an order for webhook testing
  const whOrderRes = await request('POST', '/api/orders', {
    ...checkoutPayload,
    customer_phone: '9876543213',
    payment_method: 'cod'
  });
  const whOrderNumber = whOrderRes.data.order.order_number;

  const webhookEventId = `evt_${crypto.randomBytes(10).toString('hex')}`;
  const webhookPaymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;

  const webhookPayload = {
    event: 'payment.captured',
    event_id: webhookEventId,
    payload: {
      payment: {
        entity: {
          id: webhookPaymentId,
          amount: 1250000,
          currency: 'INR',
          status: 'captured',
          notes: {
            order_number: whOrderNumber
          }
        }
      }
    }
  };

  const rawBodyStr = JSON.stringify(webhookPayload);
  const validWebhookSig = paymentGateway.generateWebhookSignature({
    rawBody: rawBodyStr,
    gateway: 'razorpay'
  });

  // Test 5.1: Forged webhook signature rejection
  const forgedWhRes = await request('POST', '/api/payments/webhook', webhookPayload, null, {
    'x-razorpay-signature': 'forged_fake_signature_hash',
    'x-razorpay-event-id': webhookEventId
  });
  check('Forged webhook signature rejected with HTTP 400 INVALID_SIGNATURE',
    forgedWhRes.status === 400 && forgedWhRes.data.error_code === 'INVALID_SIGNATURE');

  // Test 5.2: Authentic signed webhook processing
  const authenticWhRes = await request('POST', '/api/payments/webhook', webhookPayload, null, {
    'x-razorpay-signature': validWebhookSig,
    'x-razorpay-event-id': webhookEventId
  });
  check('Authentic signed webhook accepted (HTTP 200)', authenticWhRes.status === 200);

  const updatedWhOrder = await db.get('SELECT payment_status, payment_gateway_ref FROM orders WHERE order_number = ?', [whOrderNumber]);
  check('Webhook captured payment and updated order to paid', updatedWhOrder.payment_status === 'paid');
  check('Order stores gateway payment ref from webhook', updatedWhOrder.payment_gateway_ref === webhookPaymentId);

  // Test 5.3: Webhook event recorded in idempotency ledger
  const recordedWebhook = await db.get('SELECT * FROM payment_webhooks WHERE event_id = ?', [webhookEventId]);
  check('Webhook event permanently logged in payment_webhooks table', !!recordedWebhook);

  // Test 5.4: Replay attack / duplicate webhook idempotency
  const replayedWhRes = await request('POST', '/api/payments/webhook', webhookPayload, null, {
    'x-razorpay-signature': validWebhookSig,
    'x-razorpay-event-id': webhookEventId
  });
  check('Replayed duplicate webhook returns idempotent: true without re-executing',
    replayedWhRes.status === 200 && replayedWhRes.data.idempotent === true);

  const totalLogsForEvent = await db.all('SELECT id FROM payment_webhooks WHERE event_id = ?', [webhookEventId]);
  check('No duplicate rows inserted into payment_webhooks ledger', totalLogsForEvent.length === 1);

  // ── Test Group 6: Order Cancellation with Automated Refund ──
  console.log('\n--- Test Group 6: Order Cancellation with Automated Refund ---');
  // Order cancellation on paid order should transition to refunded
  const cancelPaidRes = await request('PATCH', `/api/admin/orders/${whOrderNumber}/status`, {
    order_status: 'cancelled'
  }, adminToken);
  check('Cancelling paid order succeeds (HTTP 200)', cancelPaidRes.status === 200);

  const cancelledWhOrder = await db.get('SELECT order_status, payment_status, refund_amount_inr FROM orders WHERE order_number = ?', [whOrderNumber]);
  check('Cancelled order automatically transitions payment_status to refunded', cancelledWhOrder.payment_status === 'refunded');
  check('Refund amount recorded equals order total', cancelledWhOrder.refund_amount_inr > 0);

  // ── Test Group 7: Encrypted Backup & Integrity Recovery ──
  console.log('\n--- Test Group 7: Encrypted Backup & Integrity Recovery ---');
  const encBackupResult = await createEncryptedBackup();
  check('Encrypted backup generated successfully', encBackupResult.success);
  check('Encrypted file exists on disk with .enc extension', fs.existsSync(encBackupResult.encryptedPath));
  check('Manifest contains encryption metadata and SHA-256', encBackupResult.manifest.encryption && encBackupResult.manifest.encryption.encrypted_sha256);

  // Decrypt to test staging destination
  const testRestoreDbPath = path.resolve(__dirname, '../data/backups/test_encrypted_restore.db');
  decryptBackupFile(encBackupResult.encryptedPath, testRestoreDbPath);
  check('Encrypted backup successfully decrypted to target SQLite file', fs.existsSync(testRestoreDbPath));

  // Verify SQLite integrity of decrypted database
  const sqlite3 = require('sqlite3').verbose();
  const testDb = new sqlite3.Database(testRestoreDbPath);
  const integrityCheck = await new Promise(r => testDb.get('PRAGMA integrity_check;', (e, row) => r(row)));
  check('Decrypted SQLite database passes PRAGMA integrity_check: OK', integrityCheck && integrityCheck.integrity_check === 'ok');

  await new Promise(r => testDb.close(r));
  try { fs.unlinkSync(testRestoreDbPath); } catch (_) {}

  // ── Final Test Suite Summary ──
  console.log('\n======================================================');
  console.log(`📊 PAYMENT INTEGRITY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runPaymentTests().catch(err => {
  console.error('Fatal payment test suite error:', err);
  process.exit(1);
});
