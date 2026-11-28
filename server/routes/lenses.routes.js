const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/lenses - All progressive 4-step lens tiers & Step 2 prescription options
router.get('/', async (req, res) => {
  try {
    const [usages, prescriptionOptions, thicknesses, coatings] = await Promise.all([
      db.all('SELECT * FROM lens_usages WHERE is_active = 1 ORDER BY display_order ASC, id ASC'),
      db.all('SELECT * FROM lens_prescription_options WHERE is_active = 1 ORDER BY display_order ASC, id ASC'),
      db.all('SELECT * FROM lens_thicknesses WHERE is_active = 1 ORDER BY display_order ASC, id ASC'),
      db.all('SELECT * FROM lens_coatings WHERE is_active = 1 ORDER BY display_order ASC, id ASC')
    ]);

    res.json({
      success: true,
      steps: {
        step1_usages: usages,
        step2_prescription_options: prescriptionOptions,
        step3_thicknesses: thicknesses,
        step4_coatings: coatings
      }
    });
  } catch (err) {
    console.error('Lenses Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST /api/lenses/calculate - Dynamic optical pricing tally
router.post('/calculate', async (req, res) => {
  try {
    const {
      frame_price_inr = 0,
      product_id,
      variant_id,
      usage_id,
      prescription_method,
      thickness_id,
      coating_id
    } = req.body;

    let usage = null;
    let prescriptionOption = null;
    let thickness = null;
    let coating = null;
    let frameBase = Number(frame_price_inr) || 0;

    if (variant_id) {
      const variant = await db.get(
        `SELECT v.price_override_inr, p.base_price_inr
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = ? AND v.is_active = 1 AND p.is_active = 1`,
        [Number(variant_id)]
      );
      if (variant) {
        frameBase = Number(variant.price_override_inr || variant.base_price_inr || 0);
      }
    } else if (product_id) {
      const product = await db.get('SELECT base_price_inr FROM products WHERE id = ? AND is_active = 1', [Number(product_id)]);
      if (product) frameBase = Number(product.base_price_inr || 0);
    }

    if (usage_id) {
      usage = await db.get('SELECT * FROM lens_usages WHERE id = ? AND is_active = 1', [usage_id]);
    }
    if (prescription_method) {
      prescriptionOption = await db.get('SELECT * FROM lens_prescription_options WHERE method_key = ? AND is_active = 1', [String(prescription_method)]);
    }
    if (thickness_id) {
      thickness = await db.get('SELECT * FROM lens_thicknesses WHERE id = ? AND is_active = 1', [thickness_id]);
    }
    if (coating_id) {
      coating = await db.get('SELECT * FROM lens_coatings WHERE id = ? AND is_active = 1', [coating_id]);
    }

    const usageFee = usage ? Number(usage.base_price_inr || 0) : 0;
    const prescriptionFee = prescriptionOption ? Number(prescriptionOption.fee_inr || 0) : 0;
    const thicknessFee = thickness ? Number(thickness.price_inr || 0) : 0;
    const coatingFee = coating ? Number(coating.price_inr || 0) : 0;

    const totalLenses = usageFee + prescriptionFee + thicknessFee + coatingFee;
    const grandTotal = frameBase + totalLenses;

    res.json({
      success: true,
      calculation: {
        frame_base_inr: frameBase,
        lens_usage_inr: usageFee,
        lens_prescription_inr: prescriptionFee,
        lens_thickness_inr: thicknessFee,
        lens_coating_inr: coatingFee,
        total_lenses_inr: totalLenses,
        grand_total_inr: grandTotal,
        summary_text: `Frame (₹${frameBase}) + Lenses (₹${totalLenses}) = Total ₹${grandTotal}`,
        selected_options: {
          usage: usage ? usage.name : 'None',
          prescription: prescriptionOption ? prescriptionOption.name : 'Standard',
          thickness: thickness ? `${thickness.name} (${thickness.index_rating})` : 'Standard',
          coating: coating ? coating.name : 'Standard Anti-Reflective'
        }
      }
    });
  } catch (err) {
    console.error('Lens Calculation Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
