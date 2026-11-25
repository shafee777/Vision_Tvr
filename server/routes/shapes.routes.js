const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/shapes - List active frame shapes with SVG icons and active product count
router.get('/', async (req, res) => {
  try {
    const sql = `
      SELECT s.id, s.name, s.slug, s.icon_svg, s.display_order,
             COUNT(p.id) as product_count
      FROM frame_shapes s
      LEFT JOIN products p ON p.shape_id = s.id AND p.is_active = 1
      WHERE s.is_active = 1
      GROUP BY s.id
      ORDER BY s.display_order ASC
    `;
    const shapes = await db.all(sql);
    res.json({ success: true, count: shapes.length, shapes });
  } catch (err) {
    console.error('Shapes Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
