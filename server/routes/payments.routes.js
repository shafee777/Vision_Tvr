const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db/database');
const config = require('../config');
const paymentGateway = require('../services/paymentGateway');

// GET /api/payments/config - Public payment gateway configuration
router.get('/config', (req, res) => {
  res.json({
    success: true,
    payment_mode: config.PAYMENT_MODE,
    is_live: config.PAYMENT_MODE === 'live',
    is_sandbox: config.PAYMENT_MODE !== 'live',
    razorpay_key_id: config.RAZORPAY_KEY_ID,
    cashfree_app_id: config.CASHFREE_APP_ID,
    supported_gateways: ['razorpay', 'cashfree']
  });
});

// POST /api/payments/create-order - Initialize gateway order for an optical order
router.post('/create-order', async (req, res) => {
  try {
    const { order_number, gateway = 'razorpay' } = req.body;
    if (!order_number) {
      return res.status(400).json({ success: false, message: 'order_number is required.' });
    }

    const order = await db.get('SELECT * FROM orders WHERE order_number = ?', [order_number]);
    if (!order) {
      return res.status(404).json({ success: false, message: `Order #${order_number} not found.` });
    }

    // Invalid state guards
    if (order.order_status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PAYMENT_TRANSITION',
        message: `Cannot initiate payment for cancelled order #${order_number}.`
      });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({
        success: false,
        error_code: 'PAYMENT_ALREADY_CAPTURED',
        message: `Order #${order_number} has already been paid.`
      });
    }

    const gatewayOrder = await paymentGateway.createOrder({
      amount: order.total_amount_inr,
      currency: 'INR',
      orderNumber: order.order_number,
      customerInfo: {
        name: order.customer_name,
        phone: order.customer_phone,
        email: order.customer_email
      },
      gateway
    });

    // Save gateway order reference
    await db.run(
      'UPDATE orders SET payment_gateway_order_id = ?, payment_gateway_name = ?, updated_at = CURRENT_TIMESTAMP WHERE order_number = ?',
      [gatewayOrder.gateway_order_id, gateway, order_number]
    );

    res.json({
      success: true,
      order_number,
      gateway_order: gatewayOrder
    });
  } catch (err) {
    console.error('Payment Create Order Error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

// POST /api/payments/verify - Verify client payment signature & transition payment state
router.post('/verify', async (req, res) => {
  try {
    const { order_number, gateway_order_id, payment_id, signature, gateway = 'razorpay' } = req.body;

    if (!order_number || !gateway_order_id || !payment_id || !signature) {
      return res.status(400).json({
        success: false,
        message: 'order_number, gateway_order_id, payment_id, and signature are required.'
      });
    }

    const order = await db.get('SELECT * FROM orders WHERE order_number = ?', [order_number]);
    if (!order) {
      return res.status(404).json({ success: false, message: `Order #${order_number} not found.` });
    }

    // Guard: Cancelled order payment is strictly rejected
    if (order.order_status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PAYMENT_TRANSITION',
        message: 'Cannot process payment capture for a cancelled order.'
      });
    }

    // Guard: Refunded order cannot be paid
    if (order.payment_status === 'refunded') {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PAYMENT_TRANSITION',
        message: 'Cannot process payment capture for an already refunded order.'
      });
    }

    // Guard: Idempotent return if already marked paid
    if (order.payment_status === 'paid') {
      return res.status(200).json({
        success: true,
        message: 'Payment already verified and captured for this order.',
        idempotent: true,
        order_number,
        payment_status: 'paid'
      });
    }

    // Verify cryptographic HMAC-SHA256 signature
    const verifyResult = paymentGateway.verifyPaymentSignature({
      orderId: gateway_order_id,
      paymentId: payment_id,
      signature,
      gateway
    });

    if (!verifyResult.valid) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_SIGNATURE',
        message: verifyResult.reason || 'Cryptographic signature verification failed.'
      });
    }

    const isSimulated = config.PAYMENT_MODE === 'live' ? 0 : 1;

    // Atomically transition payment status
    await db.transaction(async () => {
      await db.run(
        `UPDATE orders SET
           payment_status = 'paid',
           payment_gateway_ref = ?,
           payment_gateway_order_id = ?,
           payment_gateway_name = ?,
           is_simulated_payment = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE order_number = ?`,
        [payment_id, gateway_order_id, gateway, isSimulated, order_number]
      );

      // Audit log entry
      await db.run(
        `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details_json)
         VALUES (?, ?, 'PAYMENT_VERIFIED', 'orders', ?, ?)`,
        [
          null,
          'Payment Gateway',
          String(order.id),
          JSON.stringify({
            order_number,
            gateway,
            payment_id,
            gateway_order_id,
            is_simulated: isSimulated === 1
          })
        ]
      );
    });

    res.json({
      success: true,
      message: 'Payment verified and captured successfully.',
      order_number,
      payment_status: 'paid',
      payment_gateway_ref: payment_id,
      is_simulated_payment: isSimulated === 1
    });
  } catch (err) {
    console.error('Payment Verify Error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

// POST /api/payments/webhook - Server-to-server webhook receiver with idempotency ledger
router.post('/webhook', async (req, res) => {
  try {
    const gateway = req.query.gateway || (req.headers['x-razorpay-signature'] ? 'razorpay' : 'cashfree');
    const signature = req.headers['x-razorpay-signature'] || req.headers['x-webhook-signature'];

    const rawBody = req.body;
    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

    // Verify webhook signature
    const isSignatureValid = paymentGateway.verifyWebhookSignature({
      rawBody: bodyStr,
      signature,
      gateway
    });

    if (!isSignatureValid) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_SIGNATURE',
        message: 'Invalid webhook HMAC signature.'
      });
    }

    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const eventId = req.headers['x-razorpay-event-id'] || payload.event_id || payload.id || crypto.createHash('sha256').update(bodyStr).digest('hex');
    const eventType = payload.event || payload.type || 'payment.captured';

    // Idempotency Check: Reject replay attacks
    const existingWebhook = await db.get('SELECT id, status FROM payment_webhooks WHERE event_id = ?', [eventId]);
    if (existingWebhook) {
      return res.status(200).json({
        success: true,
        message: 'Webhook event has already been processed.',
        idempotent: true,
        event_id: eventId
      });
    }

    // Extract order reference
    let orderNumber = null;
    let paymentRef = null;
    let amountInr = 0;

    if (gateway === 'razorpay') {
      const paymentEntity = payload.payload?.payment?.entity || payload.entity || {};
      orderNumber = paymentEntity.notes?.order_number || paymentEntity.receipt || payload.order_number;
      paymentRef = paymentEntity.id;
      amountInr = (paymentEntity.amount || 0) / 100;
    } else {
      orderNumber = payload.order_number || payload.data?.order?.order_id;
      paymentRef = payload.data?.payment?.cf_payment_id || payload.payment_id;
      amountInr = payload.data?.order?.order_amount || payload.amount || 0;
    }

    // Process event atomically
    await db.transaction(async () => {
      // Record webhook event in idempotency table
      await db.run(
        `INSERT INTO payment_webhooks (gateway, event_id, event_type, payload_json, signature, order_number, status)
         VALUES (?, ?, ?, ?, ?, ?, 'processed')`,
        [gateway, eventId, eventType, bodyStr, signature, orderNumber]
      );

      if (orderNumber) {
        const order = await db.get('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
        if (order) {
          if (eventType === 'payment.captured' || eventType === 'order.paid') {
            if (order.order_status !== 'cancelled' && order.payment_status !== 'paid') {
              const isSimulated = config.PAYMENT_MODE === 'live' ? 0 : 1;
              await db.run(
                `UPDATE orders SET
                   payment_status = 'paid',
                   payment_gateway_ref = ?,
                   payment_gateway_name = ?,
                   is_simulated_payment = ?,
                   updated_at = CURRENT_TIMESTAMP
                 WHERE order_number = ?`,
                [paymentRef, gateway, isSimulated, orderNumber]
              );
            }
          } else if (eventType === 'payment.failed') {
            if (order.payment_status !== 'paid') {
              await db.run(
                "UPDATE orders SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE order_number = ?",
                [orderNumber]
              );
            }
          } else if (eventType === 'refund.processed') {
            await db.run(
              `UPDATE orders SET
                 payment_status = 'refunded',
                 refund_amount_inr = ?,
                 refund_gateway_ref = ?,
                 updated_at = CURRENT_TIMESTAMP
               WHERE order_number = ?`,
              [amountInr || order.total_amount_inr, paymentRef, orderNumber]
            );
          }
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully.',
      event_id: eventId,
      event_type: eventType
    });
  } catch (err) {
    console.error('Payment Webhook Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
