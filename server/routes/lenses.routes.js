const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/lenses - All progressive 4-step lens tiers with prices
router.get('/', async (req, res) => {
  try {
    const usages = await db.all('SELECT * FROM lens_usages WHERE is_active = 1 ORDER BY display_order ASC');
    const thicknesses = await db.all('SELECT * FROM lens_thicknesses WHERE is_active = 1 ORDER BY display_order ASC');
    const coatings = await db.all('SELECT * FROM lens_coatings WHERE is_active = 1 ORDER BY display_order ASC');

    res.json({
      success: true,
      steps: {
        step1_usages: usages,
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
    const { frame_price_inr = 0, usage_id, thickness_id, coating_id } = req.body;

    let usage = null;
    let thickness = null;
    let coating = null;

    if (usage_id) {
      usage = await db.get('SELECT * FROM lens_usages WHERE id = ? AND is_active = 1', [usage_id]);
    }
    if (thickness_id) {
      thickness = await db.get('SELECT * FROM lens_thicknesses WHERE id = ? AND is_active = 1', [thickness_id]);
    }
    if (coating_id) {
      coating = await db.get('SELECT * FROM lens_coatings WHERE id = ? AND is_active = 1', [coating_id]);
    }

    const frameBase = Number(frame_price_inr) || 0;
    const usageFee = usage ? usage.base_price_inr : 0;
    const thicknessFee = thickness ? thickness.price_inr : 0;
    const coatingFee = coating ? coating.price_inr : 0;

    const totalLenses = usageFee + thicknessFee + coatingFee;
    const grandTotal = frameBase + totalLenses;

    res.json({
      success: true,
      calculation: {
        frame_base_inr: frameBase,
        lens_usage_inr: usageFee,
        lens_thickness_inr: thicknessFee,
        lens_coating_inr: coatingFee,
        total_lenses_inr: totalLenses,
        grand_total_inr: grandTotal,
        summary_text: `Frame (₹${frameBase}) + Lenses (₹${totalLenses}) = Total ₹${grandTotal}`,
        selected_options: {
          usage: usage ? usage.name : 'None',
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
