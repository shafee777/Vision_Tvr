const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/brands - List active optical brands
router.get('/', async (req, res) => {
  try {
    const brands = await db.all(
      `SELECT b.id, b.name, b.slug, b.description, b.logo_url, COUNT(p.id) as product_count
       FROM brands b
       LEFT JOIN products p ON p.brand_id = b.id AND p.is_active = 1
       WHERE b.is_active = 1
       GROUP BY b.id
       ORDER BY b.name ASC`
    );
    res.json({ success: true, count: brands.length, brands });
  } catch (err) {
    console.error('Brands Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
