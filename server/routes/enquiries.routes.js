const express = require('express');
const router = express.Router();
const db = require('../db/database');
const config = require('../config');

// POST /api/enquiries/whatsapp - Log customer WhatsApp enquiry & generate prefilled deep-link
router.post('/whatsapp', async (req, res) => {
  try {
    const {
      product_id,
      variant_id,
      product_name,
      sku,
      color_name,
      dimensions,
      lens_usage,
      lens_thickness,
      lens_coating,
      total_price_inr,
      customer_name,
      customer_phone,
      items
    } = req.body;

    const color = color_name || req.body.color || 'Standard';
    const price = total_price_inr || req.body.price_inr;

    let lines = [];

    // Support both Multi-Item Shopping Bag Inquiries and Single Frame Inquiries
    if (items && Array.isArray(items) && items.length > 0) {
      lines = [
        `*Optii Optical — Shopping Bag Inquiry*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `• *Patron:* ${customer_name || 'Guest Patron'}`,
        customer_phone ? `• *Phone:* ${customer_phone}` : null,
        `• *Items in Bag:* (${items.length})`
      ].filter(Boolean);

      items.forEach((it, idx) => {
        const lensStr = it.configured_lenses 
          ? `${it.configured_lenses.usage_name || 'Lenses'} · ${it.configured_lenses.thickness_name || 'Standard'}`
          : 'Frame Only';
        lines.push(`  ${idx + 1}. *${it.product_name || 'Frame'}* (${it.color_name || 'Standard'})`);
        lines.push(`     Options: ${lensStr}`);
        lines.push(`     Qty: ${it.quantity || 1} · ₹${Number(it.total_price_inr || it.price_inr || it.item_price_inr || 0).toLocaleString('en-IN')}`);
      });

      lines.push(`━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`• *Estimated Bag Total:* ₹${Number(price || 0).toLocaleString('en-IN')}`);
      lines.push(`_Hello Optii Atelier, I would like to inquire about stock availability & placing this order via WhatsApp._`);
    } else {
      lines = [
        `*Optii Optical Order Inquiry*`,
        `━━━━━━━━━━━━━━━━━━━━`,
        `• *Frame:* ${product_name || 'Optical Frame'} (${sku || 'N/A'})`,
        `• *Colorway:* ${color}`,
        dimensions ? `• *Dimensions:* ${dimensions}` : null,
        lens_usage ? `• *Lens Usage:* ${lens_usage}` : null,
        lens_thickness ? `• *Lens Index:* ${lens_thickness}` : null,
        lens_coating ? `• *Coating:* ${lens_coating}` : null,
        price ? `• *Total Price:* ₹${Number(price).toLocaleString('en-IN')}` : null,
        `━━━━━━━━━━━━━━━━━━━━`,
        `_I would like to inquire about stock availability & order processing for this frame._`
      ].filter(Boolean);
    }

    const prefilledText = lines.join('\n');
    const cleanPhone = config.WHATSAPP_PHONE.replace(/[^0-9]/g, '');
    const encodedText = encodeURIComponent(prefilledText);
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;

    // Store lead record asynchronously in customer_enquiries table
    const enquiryPayload = JSON.stringify({
      product_name,
      sku,
      color_name: color,
      dimensions,
      lens_usage,
      lens_thickness,
      lens_coating,
      total_price_inr: price,
      items: items || null,
      prefilled_text: prefilledText
    });

    const result = await db.run(
      `INSERT INTO customer_enquiries (
         channel, customer_name, customer_phone, product_id, variant_id, enquiry_payload, status
       ) VALUES ('whatsapp', ?, ?, ?, ?, ?, 'new')`,
      [
        customer_name || 'WhatsApp Visitor',
        customer_phone || null,
        product_id || null,
        variant_id || null,
        enquiryPayload
      ]
    );

    res.json({
      success: true,
      enquiry_id: result.lastID,
      whatsapp_url: whatsappUrl,
      prefilled_text: prefilledText
    });
  } catch (err) {
    console.error('WhatsApp Enquiry Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/enquiries - List inquiries (Protected)
router.get('/', async (req, res) => {
  try {
    const enquiries = await db.all('SELECT * FROM customer_enquiries ORDER BY created_at DESC');
    res.json({ success: true, count: enquiries.length, enquiries });
  } catch (err) {
    console.error('List Enquiries Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
