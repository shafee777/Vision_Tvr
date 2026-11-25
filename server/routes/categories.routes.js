const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/categories - List optical categories (eyeglasses, sunglasses, etc.)
router.get('/', async (req, res) => {
  try {
    const categories = await db.all(
      `SELECT c.id, c.name, c.slug, c.category_type, c.gender, c.display_order,
              COUNT(p.id) as product_count
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
       WHERE c.is_active = 1
       GROUP BY c.id
       ORDER BY c.display_order ASC`
    );
    res.json({ success: true, count: categories.length, categories });
  } catch (err) {
    console.error('Categories Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
