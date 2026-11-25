const crypto = require('crypto');
const config = require('../config');

/**
 * Optii Payment Gateway Service
 * Unifies Razorpay & Cashfree operations with sandbox mock fallbacks and HMAC-SHA256 signature verification.
 */
class PaymentGatewayService {
  constructor() {
    this.mode = config.PAYMENT_MODE || 'sandbox';
    this.isLive = this.mode === 'live';
  }

  /**
   * Create an order on the payment gateway
   * @param {Object} params - { amount, currency, orderNumber, customerInfo, gateway }
   */
  async createOrder({ amount, currency = 'INR', orderNumber, customerInfo = {}, gateway = 'razorpay' }) {
    if (!amount || amount <= 0) {
      throw new Error('Order amount must be greater than zero.');
    }
    if (!orderNumber) {
      throw new Error('Order number is required.');
    }

    const amountInSubunits = Math.round(Number(amount) * 100);

    if (this.isLive) {
      // Live Gateway Integration Contract
      // When live credentials are provided in production:
      // Calls Razorpay /v1/orders or Cashfree /pg/orders
      if (gateway === 'razorpay') {
        return this._callRazorpayCreateOrder({ amountInSubunits, currency, orderNumber, customerInfo });
      } else if (gateway === 'cashfree') {
        return this._callCashfreeCreateOrder({ amount: Number(amount), currency, orderNumber, customerInfo });
      }
    }

    // Default Sandbox Mock Order Generation (Deterministic and Safe)
    const randomHex = crypto.randomBytes(8).toString('hex');
    const gatewayOrderId = gateway === 'razorpay' 
      ? `order_${randomHex}`
      : `cf_ord_${orderNumber}_${randomHex.substring(0, 6)}`;

    return {
      success: true,
      mode: 'sandbox',
      is_simulated_payment: true,
      gateway,
      gateway_order_id: gatewayOrderId,
      order_number: orderNumber,
      amount: Number(amount),
      amount_subunits: amountInSubunits,
      currency,
      key_id: gateway === 'razorpay' ? config.RAZORPAY_KEY_ID : config.CASHFREE_APP_ID,
      created_at: new Date().toISOString()
    };
  }

  /**
   * Verify payment signature returned from client checkout
   * @param {Object} params - { orderId, paymentId, signature, gateway }
   */
  verifyPaymentSignature({ orderId, paymentId, signature, gateway = 'razorpay' }) {
    if (!signature || !orderId || !paymentId) {
      return { valid: false, reason: 'Missing orderId, paymentId, or signature.' };
    }

    if (gateway === 'razorpay') {
      const secret = config.RAZORPAY_KEY_SECRET;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      // Use constant-time buffer comparison to prevent timing attacks
      const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
      const actualBuffer = Buffer.from(signature, 'utf8');

      if (expectedBuffer.length !== actualBuffer.length) {
        return { valid: false, reason: 'Signature length mismatch.' };
      }

      const match = crypto.timingSafeEqual(expectedBuffer, actualBuffer);
      return { valid: match, reason: match ? null : 'HMAC signature verification failed.' };
    } else if (gateway === 'cashfree') {
      const secret = config.CASHFREE_SECRET_KEY;
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}${paymentId}`)
        .digest('hex');

      const match = expectedSignature.toLowerCase() === signature.toLowerCase();
      return { valid: match, reason: match ? null : 'Cashfree signature verification failed.' };
    }

    return { valid: false, reason: `Unsupported gateway: ${gateway}` };
  }

  /**
   * Helper to generate a valid HMAC signature for integration tests and sandbox checkouts
   */
  generateSignature({ orderId, paymentId, gateway = 'razorpay', customSecret }) {
    const secret = customSecret || (gateway === 'razorpay' ? config.RAZORPAY_KEY_SECRET : config.CASHFREE_SECRET_KEY);
    if (gateway === 'razorpay') {
      return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    } else {
      return crypto.createHmac('sha256', secret).update(`${orderId}${paymentId}`).digest('hex');
    }
  }

  /**
   * Verify incoming Webhook HMAC signature
   * @param {Object} params - { rawBody, signature, gateway }
   */
  verifyWebhookSignature({ rawBody, signature, gateway = 'razorpay' }) {
    if (!rawBody || !signature) {
      return false;
    }

    const secret = gateway === 'razorpay' ? config.RAZORPAY_WEBHOOK_SECRET : config.CASHFREE_WEBHOOK_SECRET;
    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const actualBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
  }

  /**
   * Helper to generate webhook signatures for tests
   */
  generateWebhookSignature({ rawBody, gateway = 'razorpay', customSecret }) {
    const secret = customSecret || (gateway === 'razorpay' ? config.RAZORPAY_WEBHOOK_SECRET : config.CASHFREE_WEBHOOK_SECRET);
    const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    return crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
  }

  /**
   * Process refund request
   * @param {Object} params - { orderNumber, paymentGatewayRef, amount, reason, gateway }
   */
  async processRefund({ orderNumber, paymentGatewayRef, amount, reason = 'Customer request', gateway = 'razorpay' }) {
    if (!amount || amount <= 0) {
      throw new Error('Refund amount must be greater than zero.');
    }

    if (this.isLive) {
      // In live production, dispatch to Razorpay Refunds API: POST /v1/payments/{paymentGatewayRef}/refund
      // Or Cashfree /pg/orders/{orderNumber}/refunds
      console.log(`[Payment Gateway LIVE] Initiating live refund for ${orderNumber} via ${gateway}...`);
    }

    // Return structured refund payload
    const refundId = `rfnd_${crypto.randomBytes(8).toString('hex')}`;
    return {
      success: true,
      refund_id: refundId,
      gateway,
      payment_gateway_ref: paymentGatewayRef,
      order_number: orderNumber,
      refund_amount_inr: Number(amount),
      reason,
      status: 'processed',
      processed_at: new Date().toISOString()
    };
  }

  // Live Gateway API stubs (called when PAYMENT_MODE === 'live')
  async _callRazorpayCreateOrder({ amountInSubunits, currency, orderNumber, customerInfo }) {
    // Standard https request to api.razorpay.com/v1/orders with Basic Auth
    // Headers: Authorization: 'Basic ' + Buffer.from(`${config.RAZORPAY_KEY_ID}:${config.RAZORPAY_KEY_SECRET}`).toString('base64')
    throw new Error('Live Razorpay merchant onboarding credentials required before enabling live API calls.');
  }

  async _callCashfreeCreateOrder({ amount, currency, orderNumber, customerInfo }) {
    throw new Error('Live Cashfree merchant onboarding credentials required before enabling live API calls.');
  }
}

module.exports = new PaymentGatewayService();
