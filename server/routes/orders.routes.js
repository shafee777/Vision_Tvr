const express = require('express');
const router = express.Router();
const db = require('../db/database');
const config = require('../config');
const { getPublicStoreSettings } = require('../services/storeSettingsService');
const { authenticateToken } = require('../middleware/auth');
const { orderLimiter, trackingLimiter } = require('../middleware/rateLimiter');
const { validateBody } = require('../middleware/validate');
const { orderCreateSchema } = require('../validators/schemas');

// Ensure required columns exist in orders table
let columnsEnsured = false;
async function ensureOrderColumns() {
  if (columnsEnsured) return;
  try {
    const cols = await db.all('PRAGMA table_info(orders);');
    const names = cols.map(c => c.name);
    if (!names.includes('delivery_method')) {
      await db.run("ALTER TABLE orders ADD COLUMN delivery_method TEXT DEFAULT 'express'");
    }
    if (!names.includes('promo_code')) {
      await db.run("ALTER TABLE orders ADD COLUMN promo_code TEXT");
    }
    if (!names.includes('estimated_delivery')) {
      await db.run("ALTER TABLE orders ADD COLUMN estimated_delivery TEXT");
    }
    if (!names.includes('is_simulated_payment')) {
      await db.run("ALTER TABLE orders ADD COLUMN is_simulated_payment INTEGER DEFAULT 1");
    }
    if (!names.includes('payment_gateway_name')) {
      await db.run("ALTER TABLE orders ADD COLUMN payment_gateway_name TEXT DEFAULT 'simulated_sandbox'");
    }
    if (!names.includes('payment_gateway_ref')) {
      await db.run("ALTER TABLE orders ADD COLUMN payment_gateway_ref TEXT DEFAULT NULL");
    }
    if (!names.includes('payment_gateway_order_id')) {
      await db.run("ALTER TABLE orders ADD COLUMN payment_gateway_order_id TEXT DEFAULT NULL");
    }
    if (!names.includes('refund_amount_inr')) {
      await db.run("ALTER TABLE orders ADD COLUMN refund_amount_inr REAL DEFAULT 0");
    }
    if (!names.includes('refund_reason')) {
      await db.run("ALTER TABLE orders ADD COLUMN refund_reason TEXT DEFAULT NULL");
    }
    if (!names.includes('refund_gateway_ref')) {
      await db.run("ALTER TABLE orders ADD COLUMN refund_gateway_ref TEXT DEFAULT NULL");
    }
    columnsEnsured = true;
  } catch (e) {
    console.error('[Optii Orders] Error ensuring table columns:', e.message);
  }
}

// POST /api/orders/validate-promo - Check promotional discount voucher
router.post('/validate-promo', async (req, res) => {
  try {
    const { code, subtotal_inr = 0 } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Promotional code is required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const promo = await db.get(
      'SELECT * FROM promo_codes WHERE UPPER(code) = ? AND is_active = 1',
      [cleanCode]
    );

    if (!promo) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: 'Invalid or expired promotional privilege code.'
      });
    }

    const subtotal = Number(subtotal_inr) || 0;
    if (subtotal < (promo.min_order_amount_inr || 0)) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: `Privilege code '${promo.code}' requires a minimum order value of ₹${promo.min_order_amount_inr.toLocaleString('en-IN')}.`
      });
    }

    let discountInr = 0;
    if (promo.discount_type === 'percentage') {
      discountInr = Math.round(subtotal * (promo.discount_value / 100));
      if (promo.max_discount_inr && discountInr > promo.max_discount_inr) {
        discountInr = promo.max_discount_inr;
      }
    } else {
      discountInr = Number(promo.discount_value);
    }

    // Ensure discount does not exceed subtotal
    discountInr = Math.min(discountInr, subtotal);

    res.json({
      success: true,
      valid: true,
      code: promo.code,
      discount_inr: discountInr,
      description: promo.description,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value
    });
  } catch (err) {
    console.error('Validate Promo Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST /api/orders - Place an optical order with atomic inventory decrement & verification
router.post('/', orderLimiter, validateBody(orderCreateSchema), async (req, res) => {
  try {
    await ensureOrderColumns();

    const {
      customer_name,
      customer_phone,
      customer_email,
      shipping_address,
      city,
      state,
      pincode,
      delivery_method = 'express',
      payment_method = 'online',
      promo_code,
      items,
      subtotal_inr,
      prescription_file_url,
      prescription_data
    } = req.body;

    // Strict validation
    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ success: false, message: 'Full customer name is required.' });
    }
    if (!customer_phone || !customer_phone.trim()) {
      return res.status(400).json({ success: false, message: 'Contact phone number is required.' });
    }
    if (!shipping_address || !shipping_address.trim()) {
      return res.status(400).json({ success: false, message: 'Shipping address is required.' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Shopping bag is empty. Please add items before checkout.' });
    }

    // Validate phone number format (standard 10-digit Indian mobile)
    const cleanPhone = customer_phone.trim().replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid 10-digit contact mobile number.'
      });
    }

    // Recalculate subtotal strictly server-side from DB records (ignore all client-sent prices)
    let calculatedSubtotal = 0;
    const pricedItems = [];
    for (const it of items) {
      let frameRow = null;
      if (it.variant_id) {
        frameRow = await db.get(
          `SELECT p.id AS product_id, p.name AS product_name, v.id AS variant_id,
                  COALESCE(v.price_override_inr, p.base_price_inr) AS frame_price_inr
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           WHERE v.id = ? AND v.is_active = 1 AND p.is_active = 1`,
          [it.variant_id]
        );
      } else if (it.sku) {
        frameRow = await db.get(
          `SELECT p.id AS product_id, p.name AS product_name, v.id AS variant_id,
                  COALESCE(v.price_override_inr, p.base_price_inr) AS frame_price_inr
           FROM product_variants v
           JOIN products p ON p.id = v.product_id
           WHERE v.sku = ? AND v.is_active = 1 AND p.is_active = 1`,
          [it.sku]
        );
      }
      if (!frameRow && it.product_id) {
        frameRow = await db.get(
          `SELECT id AS product_id, name AS product_name, NULL AS variant_id,
                  base_price_inr AS frame_price_inr
           FROM products
           WHERE id = ? AND is_active = 1`,
          [it.product_id]
        );
      }

      if (!frameRow || frameRow.frame_price_inr == null) {
        return res.status(400).json({
          success: false,
          error_code: 'INVALID_ORDER_ITEM',
          message: `Unable to verify product pricing for ${it.product_name || it.name || 'order item'}.`
        });
      }

      const framePrice = Number(frameRow.frame_price_inr);
      let lensPrice = 0;
      const lenses = it.configured_lenses;
      if (lenses && typeof lenses === 'object') {
        const usageLabel = String(lenses.usage_name || lenses.usage || '').trim();
        const isFrameOnly = !usageLabel || usageLabel.toLowerCase().includes('frame only');
        if (!isFrameOnly) {
          let usageRow = null;
          if (lenses.usage_id) {
            usageRow = await db.get('SELECT id, base_price_inr FROM lens_usages WHERE id = ? AND is_active = 1', [Number(lenses.usage_id)]);
          } else if (usageLabel) {
            usageRow = await db.get('SELECT id, base_price_inr FROM lens_usages WHERE LOWER(name) = LOWER(?) AND is_active = 1', [usageLabel]);
          }
          if (usageRow) lensPrice += Number(usageRow.base_price_inr || 0);

          const thickLabel = String(lenses.thickness_name || lenses.index || '').trim();
          const indexMatch = thickLabel.match(/\b(1\.\d{2})\b/);
          let thickRow = null;
          if (lenses.thickness_id) {
            thickRow = await db.get('SELECT price_inr FROM lens_thicknesses WHERE id = ? AND is_active = 1', [Number(lenses.thickness_id)]);
          } else if (thickLabel) {
            if (usageRow) {
              thickRow = await db.get(
                'SELECT price_inr FROM lens_thicknesses WHERE usage_id = ? AND (LOWER(name) = LOWER(?) OR LOWER(name) LIKE LOWER(?)) AND is_active = 1 LIMIT 1',
                [usageRow.id, thickLabel, `%${thickLabel}%`]
              );
            }
            if (!thickRow) {
              thickRow = await db.get(
                'SELECT price_inr FROM lens_thicknesses WHERE (LOWER(name) = LOWER(?) OR LOWER(name) LIKE LOWER(?)) AND is_active = 1 LIMIT 1',
                [thickLabel, `%${thickLabel}%`]
              );
            }
            if (!thickRow && indexMatch) {
              thickRow = await db.get(
                'SELECT price_inr FROM lens_thicknesses WHERE index_rating = ? AND is_active = 1 LIMIT 1',
                [Number(indexMatch[1])]
              );
            }
          }
          if (thickRow) lensPrice += Number(thickRow.price_inr || 0);

          const coatLabel = String(lenses.coating_name || lenses.coating || '').trim();
          let coatRow = null;
          if (lenses.coating_id) {
            coatRow = await db.get('SELECT price_inr FROM lens_coatings WHERE id = ? AND is_active = 1', [Number(lenses.coating_id)]);
          } else if (coatLabel && coatLabel.toLowerCase() !== 'none') {
            coatRow = await db.get(
              'SELECT price_inr FROM lens_coatings WHERE (LOWER(name) = LOWER(?) OR LOWER(name) LIKE LOWER(?)) AND is_active = 1 LIMIT 1',
              [coatLabel, `%${coatLabel}%`]
            );
          }
          if (coatRow) lensPrice += Number(coatRow.price_inr || 0);
        }
      }

      const unitPrice = framePrice + lensPrice;
      const qty = Math.max(1, Number(it.quantity) || 1);
      calculatedSubtotal += (unitPrice * qty);
      pricedItems.push({
        ...it,
        product_id: frameRow.product_id,
        variant_id: it.variant_id || frameRow.variant_id || undefined,
        frame_price_inr: framePrice,
        lens_price_inr: lensPrice,
        price_inr: unitPrice,
        total_price_inr: unitPrice * qty
      });
    }

    // Validate and apply promo code discount server-side if provided
    let calculatedDiscount = 0;
    let appliedPromo = null;
    if (promo_code && promo_code.trim()) {
      const cleanCode = promo_code.trim().toUpperCase();
      const promo = await db.get(
        'SELECT * FROM promo_codes WHERE UPPER(code) = ? AND is_active = 1',
        [cleanCode]
      );
      if (promo && calculatedSubtotal >= (promo.min_order_amount_inr || 0)) {
        appliedPromo = promo.code;
        if (promo.discount_type === 'percentage') {
          calculatedDiscount = Math.round(calculatedSubtotal * (promo.discount_value / 100));
          if (promo.max_discount_inr && calculatedDiscount > promo.max_discount_inr) {
            calculatedDiscount = promo.max_discount_inr;
          }
        } else {
          calculatedDiscount = Number(promo.discount_value);
        }
        calculatedDiscount = Math.min(calculatedDiscount, calculatedSubtotal);
      }
    }

    const calculatedTotal = Math.max(0, calculatedSubtotal - calculatedDiscount);

    // Generate unique order number: OPT-ORD-YYYY-XXXX
    const year = new Date().getFullYear();
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderNumber = `OPT-ORD-${year}-${randomSuffix}`;

    // Generate tracking carrier reference: BLUEDART-OPT-XXXXXXXX
    const trackingSuffix = Math.floor(100000 + Math.random() * 900000);
    const trackingNumber = `BLUEDART-OPT-${trackingSuffix}`;

    // Estimated delivery calculation (3-5 business days post glazing)
    const estDate = new Date();
    estDate.setDate(estDate.getDate() + 5);
    const estimatedDelivery = estDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const itemsJson = JSON.stringify(pricedItems);

    // Atomic transaction: inventory verification, decrement, movement audit, and order record
    let orderId = null;
    try {
      await db.transaction(async () => {
        // Re-verify inventory within transaction to prevent race conditions
        for (const item of items) {
          const qty = Math.max(1, Number(item.quantity) || 1);
          if (item.variant_id) {
            const variant = await db.get(
              'SELECT id, sku, color_name, stock_quantity FROM product_variants WHERE id = ?',
              [item.variant_id]
            );
            if (!variant || variant.stock_quantity < qty) {
              const stockErr = new Error(`Insufficient inventory for ${item.product_name || 'Frame'} (${variant ? variant.color_name : 'Unknown'}). Only ${variant ? variant.stock_quantity : 0} available in atelier stock.`);
              stockErr.code = 'INSUFFICIENT_STOCK';
              throw stockErr;
            }
          }
        }

        // Decrement inventory within transaction
        for (const item of items) {
          const qty = Math.max(1, Number(item.quantity) || 1);
          if (item.variant_id) {
            await db.run(
              'UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?',
              [qty, item.variant_id]
            );
            await db.run(
              `INSERT INTO inventory_movements (variant_id, product_id, user_id, username, change_quantity, previous_quantity, new_quantity, movement_type, reason)
               VALUES (?, ?, ?, ?, ?, 0, 0, 'order_sale', ?)`,
              [item.variant_id, item.product_id || 1, null, 'Customer Checkout', -qty, `Order placed: #${orderNumber}`]
            );
          }
        }

        // Determine payment state and simulation flags
        const isSimulated = (config.PAYMENT_MODE === 'live' && payment_method === 'online') ? 0 : 1;
        const initialPaymentStatus = payment_method === 'online'
          ? (config.PAYMENT_MODE === 'live' ? 'pending' : 'paid')
          : 'pending';
        const gatewayName = payment_method === 'online'
          ? (isSimulated ? 'simulated_sandbox' : 'razorpay')
          : 'in_store_settlement';
        const gatewayRef = (payment_method === 'online' && isSimulated) ? `sim_pay_${randomSuffix}` : null;
        const gatewayOrderId = (payment_method === 'online' && isSimulated) ? `sim_ord_${orderNumber}` : null;

        // Insert order record with payment integrity fields
        const result = await db.run(
          `INSERT INTO orders (
             order_number, customer_name, customer_phone, customer_email,
             shipping_address, city, state, pincode, delivery_method,
             subtotal_inr, discount_inr, promo_code, total_amount_inr,
             payment_method, payment_status, order_status, items_json,
             prescription_file_url, prescription_data, tracking_number, estimated_delivery,
             is_simulated_payment, payment_gateway_name, payment_gateway_ref, payment_gateway_order_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'placed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderNumber,
            customer_name.trim(),
            cleanPhone,
            customer_email ? customer_email.trim() : null,
            shipping_address.trim(),
            city ? city.trim() : null,
            state ? state.trim() : null,
            pincode ? pincode.trim() : null,
            delivery_method || 'express',
            calculatedSubtotal,
            calculatedDiscount,
            appliedPromo,
            calculatedTotal,
            payment_method,
            initialPaymentStatus,
            itemsJson,
            prescription_file_url || null,
            prescription_data ? JSON.stringify(prescription_data) : null,
            trackingNumber,
            estimatedDelivery,
            isSimulated,
            gatewayName,
            gatewayRef,
            gatewayOrderId
          ]
        );
        orderId = result.lastID;
      });
    } catch (txErr) {
      if (txErr.code === 'INSUFFICIENT_STOCK') {
        return res.status(400).json({
          success: false,
          error_code: 'INSUFFICIENT_STOCK',
          message: txErr.message
        });
      }
      throw txErr;
    }

    // Build prefilled WhatsApp confirmation link for the order
    const { store: storeSettings } = await getPublicStoreSettings();
    const storeDisplayName = storeSettings.name || 'Vision Opticals';
    const businessPhone = String(storeSettings.whatsapp_number || storeSettings.phone || config.WHATSAPP_PHONE).replace(/[^0-9]/g, '');
    const waLines = [
      `*${storeDisplayName} Order Confirmation*`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `• *Order Number:* ${orderNumber}`,
      `• *Customer:* ${customer_name.trim()} (${cleanPhone})`,
      `• *Delivery Mode:* ${delivery_method === 'pickup' ? 'Store Pickup (Thiruvarur)' : 'Express Insured Courier'}`,
      `• *Payment Method:* ${payment_method.toUpperCase()}`,
      `• *Total Amount:* ₹${calculatedTotal.toLocaleString('en-IN')}`,
      `• *Estimated Dispatch:* ${estimatedDelivery}`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `*Items in Order:*`
    ];

    items.forEach((it, idx) => {
      const lensDesc = it.configured_lenses 
        ? `${it.configured_lenses.usage_name || 'Clear'} (${it.configured_lenses.thickness_name || 'Standard'})`
        : 'Frame Only';
      waLines.push(`${idx + 1}. ${it.product_name || 'Frame'} [${it.color_name || 'Standard'}] — ${lensDesc} (Qty: ${it.quantity || 1})`);
    });

    waLines.push(`━━━━━━━━━━━━━━━━━━━━`);
    waLines.push(`_Hello ${storeDisplayName}, I have confirmed my optical order #${orderNumber}. Please proceed with lens glazing._`);

    const waText = encodeURIComponent(waLines.join('\n'));
    const whatsappUrl = `https://wa.me/${businessPhone}?text=${waText}`;

    const isSimulatedResponse = (config.PAYMENT_MODE === 'live' && payment_method === 'online') ? false : true;
    const initialPaymentStatusResponse = payment_method === 'online'
      ? (config.PAYMENT_MODE === 'live' ? 'pending' : 'paid')
      : 'pending';

    res.status(201).json({
      success: true,
      message: 'Order placed successfully.',
      order: {
        id: orderId,
        order_number: orderNumber,
        customer_name: customer_name.trim(),
        customer_phone: cleanPhone,
        customer_email: customer_email ? customer_email.trim() : null,
        shipping_address: shipping_address.trim(),
        city: city ? city.trim() : null,
        state: state ? state.trim() : null,
        pincode: pincode ? pincode.trim() : null,
        delivery_method: delivery_method || 'express',
        subtotal_inr: calculatedSubtotal,
        discount_inr: calculatedDiscount,
        promo_code: appliedPromo,
        total_amount_inr: calculatedTotal,
        payment_method,
        payment_status: initialPaymentStatusResponse,
        payment_mode_note: isSimulatedResponse
          ? 'Demonstration Sandbox Mode — No live card charged'
          : 'Live Production Transaction',
        is_simulated_payment: isSimulatedResponse,
        order_status: 'placed',
        tracking_number: trackingNumber,
        tracking_carrier: 'BlueDart Express (Simulated Dispatch)',
        estimated_delivery: estimatedDelivery,
        whatsapp_url: whatsappUrl,
        items: pricedItems
      }
    });
  } catch (err) {
    console.error('Place Order Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/orders/track/:orderNumber - Public real-time optical order tracking (Medical Privacy Protected)
router.get('/track/:orderNumber', trackingLimiter, async (req, res) => {
  try {
    await ensureOrderColumns();
    const orderNumber = req.params.orderNumber.trim();
    const order = await db.get(
      `SELECT id, order_number, customer_name, customer_phone, customer_email,
              shipping_address, city, state, pincode, delivery_method,
              subtotal_inr, discount_inr, promo_code, total_amount_inr,
              payment_method, payment_status, order_status, items_json,
              tracking_number, estimated_delivery, created_at
       FROM orders WHERE order_number = ?`,
      [orderNumber]
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order reference number not found.' });
    }

    try {
      const parsedItems = JSON.parse(order.items_json);
      // Strictly sanitize items to strip any medical prescription tokens or file paths
      order.items = parsedItems.map(it => ({
        product_name: it.product_name,
        color_name: it.color_name,
        quantity: it.quantity,
        price_inr: it.total_price_inr || it.price_inr,
        configured_lenses: it.configured_lenses ? {
          usage_name: it.configured_lenses.usage_name,
          thickness_name: it.configured_lenses.thickness_name,
          coating_name: it.configured_lenses.coating_name
        } : null
      }));
    } catch (_) {
      order.items = [];
    }
    delete order.items_json;

    // Define optical production & delivery lifecycle stages
    const stages = [
      { key: 'placed', label: 'Order Confirmed', description: 'Order logged & frame reserved in atelier stock', completed: true },
      { key: 'processing', label: 'Prescription Verified', description: 'Optometrist reviewed sphere, cylinder & PD metrics', completed: ['processing', 'lab_glazing', 'shipped', 'delivered'].includes(order.order_status) },
      { key: 'lab_glazing', label: 'Precision Lab Glazing', description: 'Computerized robotic edging and multi-coat application', completed: ['lab_glazing', 'shipped', 'delivered'].includes(order.order_status) },
      { key: 'shipped', label: 'Dispatched with Courier', description: `In transit via ${order.tracking_number || 'BlueDart Express (Simulated)'}`, completed: ['shipped', 'delivered'].includes(order.order_status) },
      { key: 'delivered', label: 'Delivered', description: 'Safely delivered to customer address', completed: order.order_status === 'delivered' }
    ];

    res.json({
      success: true,
      order: {
        ...order,
        stages
      }
    });
  } catch (err) {
    console.error('Track Order Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PATCH /api/orders/:orderNumber/status - Staff update order status (Protected & Duplicate-Cancellation Safe)
router.patch('/:orderNumber/status', authenticateToken, async (req, res) => {
  try {
    await ensureOrderColumns();
    const orderNumber = req.params.orderNumber.trim();
    const { order_status, tracking_number } = req.body;

    const validStatuses = ['placed', 'processing', 'lab_glazing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(order_status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid order status. Must be one of: [${validStatuses.join(', ')}]`
      });
    }

    const order = await db.get('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found.' });
    }

    // Atomic Duplicate Cancellation Guard
    if (order_status === 'cancelled') {
      const cancelUpdate = await db.run(
        `UPDATE orders SET order_status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE order_number = ? AND order_status != 'cancelled'`,
        [orderNumber]
      );
      if (cancelUpdate.changes > 0) {
        try {
          const items = JSON.parse(order.items_json);
          for (const item of items) {
            const qty = Math.max(1, Number(item.quantity) || 1);
            if (item.variant_id) {
              await db.run(
                'UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?',
                [qty, item.variant_id]
              );
              await db.run(
                `INSERT INTO inventory_movements (variant_id, product_id, user_id, username, change_quantity, previous_quantity, new_quantity, movement_type, reason)
                 VALUES (?, ?, ?, ?, ?, 0, 0, 'order_cancellation', ?)`,
                [item.variant_id, item.product_id || 1, (req.user ? req.user.id : null), req.user ? req.user.username : 'Staff', qty, `Restocked from cancelled order #${orderNumber}`]
              );
            }
          }
        } catch (e) {
          console.error('Error restoring stock on cancellation:', e);
        }
      }
    } else {
      await db.run(
        `UPDATE orders SET order_status = ?, tracking_number = COALESCE(?, tracking_number), updated_at = CURRENT_TIMESTAMP WHERE order_number = ?`,
        [order_status, tracking_number || null, orderNumber]
      );
    }

    res.json({
      success: true,
      message: `Order ${orderNumber} updated to ${order_status}.`
    });
  } catch (err) {
    console.error('Update Order Status Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/orders - List all orders (Protected)
router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureOrderColumns();
    const orders = await db.all('SELECT * FROM orders ORDER BY created_at DESC');
    const parsedOrders = orders.map(o => {
      try { o.items = JSON.parse(o.items_json); } catch (_) { o.items = []; }
      return o;
    });
    res.json({ success: true, count: parsedOrders.length, orders: parsedOrders });
  } catch (err) {
    console.error('List Orders Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
