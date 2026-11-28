const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const config = require('../config');
const db = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { passwordLimiter } = require('../middleware/rateLimiter');
const { validateBody } = require('../middleware/validate');
const {
  productCreateSchema,
  productUpdateSchema,
  variantInlineSchema,
  variantUpdateSchema,
  brandPayloadSchema,
  shapePayloadSchema,
  categoryPayloadSchema,
  stockAdjustSchema,
  passwordChangeSchema,
  clinicSettingsSchema
} = require('../validators/schemas');
const { getDashboardAnalytics } = require('../services/dashboardService');
const { getPublicStoreSettings } = require('../services/storeSettingsService');
const { buildCsvContent } = require('../utils/csvValidation');
const { processAndStorePublicImage, resolveSafePublicPath, safeUnlink } = require('../utils/imageProcessor');
const adminImportsRoutes = require('./adminImports.routes');

// Secure In-Memory Multer Upload (verified via magic bytes & normalized by Jimp before writing)
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images (max 5 MB) are allowed.'));
    }
  }
});

function handleImageUploadMiddleware(middlewareFn) {
  return (req, res, next) => {
    middlewareFn(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'Image upload rejected.'
        });
      }
      next();
    });
  };
}

// Helper: Administrative Action Audit Logging
async function logAudit(req, action, entity, entityId, details) {
  try {
    const userId = req.user ? req.user.id : null;
    const username = req.user ? req.user.username : 'system';
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    await db.run(
      `INSERT INTO audit_logs (user_id, username, action, entity, entity_id, details_json, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, action, entity, entityId ? String(entityId) : null, details ? JSON.stringify(details) : null, String(ip)]
    );
  } catch (err) {
    console.error('[Audit Log Error]:', err.message);
  }
}

// All admin routes require a verified JWT token
router.use(authenticateToken);

// Mount Bulk Import Routes (/api/admin/imports/*)
router.use('/imports', adminImportsRoutes);

// GET /api/admin/dashboard/analytics - Real SQLite analytics, trend charts, and attention queues
router.get('/dashboard/analytics', async (req, res) => {
  try {
    const analytics = await getDashboardAnalytics(req.query.days);
    res.json({ success: true, analytics });
  } catch (err) {
    console.error('Dashboard Analytics Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 1. DASHBOARD OVERVIEW & OPERATIONAL KPIS
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/summary - Operational Dashboard Metrics
router.get('/summary', async (req, res) => {
  try {
    const [
      productsCount,
      variantsCount,
      lowStockCount,
      outOfStockCount,
      appointmentsToday,
      totalAppointments,
      pendingAppointments,
      ordersCount,
      pendingOrders,
      realRevenue,
      simulatedRevenue,
      realOrders,
      simOrders,
      unhandledEnquiries,
      recentActivity,
      recentMovements
    ] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM products WHERE is_active = 1'),
      db.get('SELECT COUNT(*) as count FROM product_variants WHERE is_active = 1'),
      db.get('SELECT COUNT(*) as count FROM product_variants WHERE is_active = 1 AND stock_quantity > 0 AND stock_quantity <= 5'),
      db.get('SELECT COUNT(*) as count FROM product_variants WHERE is_active = 1 AND stock_quantity = 0'),
      db.get("SELECT COUNT(*) as count FROM appointments WHERE appointment_date = DATE('now') AND status != 'cancelled'"),
      db.get("SELECT COUNT(*) as count FROM appointments WHERE status != 'cancelled'"),
      db.get("SELECT COUNT(*) as count FROM appointments WHERE status = 'pending' OR status = 'confirmed'"),
      db.get('SELECT COUNT(*) as count FROM orders'),
      db.get("SELECT COUNT(*) as count FROM orders WHERE order_status IN ('placed', 'processing', 'lab_glazing')"),
      db.get("SELECT COALESCE(SUM(total_amount_inr - COALESCE(refund_amount_inr, 0)), 0) as revenue FROM orders WHERE (payment_status = 'paid' OR order_status = 'delivered') AND order_status != 'cancelled' AND is_simulated_payment = 0"),
      db.get("SELECT COALESCE(SUM(total_amount_inr - COALESCE(refund_amount_inr, 0)), 0) as revenue FROM orders WHERE (payment_status = 'paid' OR order_status = 'delivered') AND order_status != 'cancelled' AND is_simulated_payment = 1"),
      db.get("SELECT COUNT(*) as count FROM orders WHERE is_simulated_payment = 0"),
      db.get("SELECT COUNT(*) as count FROM orders WHERE is_simulated_payment = 1"),
      db.get("SELECT COUNT(*) as count FROM customer_enquiries WHERE status = 'new'"),
      db.all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 8'),
      db.all(`
        SELECT m.*, p.name as product_name, v.sku, v.color_name
        FROM inventory_movements m
        JOIN products p ON p.id = m.product_id
        JOIN product_variants v ON v.id = m.variant_id
        ORDER BY m.created_at DESC LIMIT 8
      `)
    ]);

    const realRev = realRevenue ? realRevenue.revenue : 0;
    const simRev = simulatedRevenue ? simulatedRevenue.revenue : 0;

    res.json({
      success: true,
      metrics: {
        active_products: productsCount ? productsCount.count : 0,
        active_variants: variantsCount ? variantsCount.count : 0,
        low_stock_variants: lowStockCount ? lowStockCount.count : 0,
        out_of_stock_variants: outOfStockCount ? outOfStockCount.count : 0,
        appointments_today: appointmentsToday ? appointmentsToday.count : 0,
        total_appointments: totalAppointments ? totalAppointments.count : 0,
        pending_appointments: pendingAppointments ? pendingAppointments.count : 0,
        total_orders: ordersCount ? ordersCount.count : 0,
        pending_orders: pendingOrders ? pendingOrders.count : 0,
        total_revenue_inr: realRev,
        real_revenue_inr: realRev,
        simulated_revenue_inr: simRev,
        real_orders_count: realOrders ? realOrders.count : 0,
        simulated_orders_count: simOrders ? simOrders.count : 0,
        new_enquiries: unhandledEnquiries ? unhandledEnquiries.count : 0
      },
      recent_activity: recentActivity || [],
      recent_movements: recentMovements || []
    });
  } catch (err) {
    console.error('Admin Summary Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 2. STAFF PROFILE & RBAC MANAGEMENT
// ═════════════════════════════════════════════════════════════════════

// PATCH /api/admin/profile/password - Authenticated User Self Password Change
router.patch('/profile/password', passwordLimiter, validateBody(passwordChangeSchema), async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters long.' });
    }

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    const newHash = bcrypt.hashSync(new_password, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, req.user.id]);

    await logAudit(req, 'UPDATE_PASSWORD', 'users', req.user.id, { username: req.user.username });
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Change Password Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/admin/users - List Staff Accounts (Admin Only)
router.get('/users', requireRole('admin'), async (req, res) => {
  try {
    const users = await db.all('SELECT id, username, full_name, role, created_at FROM users ORDER BY id ASC');
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST /api/admin/users - Create Staff Account (Admin Only)
router.post('/users', requireRole('admin'), async (req, res) => {
  try {
    const { username, password, full_name, role = 'staff' } = req.body;
    if (!username || !password || !full_name) {
      return res.status(400).json({ success: false, message: 'Username, password, and full name are required.' });
    }
    const validRoles = ['admin', 'optometrist', 'staff'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Must be one of: [${validRoles.join(', ')}]` });
    }

    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username is already in use.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [username.trim(), passwordHash, full_name.trim(), role]
    );

    await logAudit(req, 'CREATE_USER', 'users', result.lastID, { username: username.trim(), role, full_name });
    res.status(201).json({
      success: true,
      message: 'Staff user created successfully.',
      user: { id: result.lastID, username: username.trim(), full_name: full_name.trim(), role }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// DELETE /api/admin/users/:id - Delete Staff Account (Admin Only, cannot delete self)
router.delete('/users/:id', requireRole('admin'), async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own active administrator account.' });
    }

    const user = await db.get('SELECT username FROM users WHERE id = ?', [targetId]);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    await db.run('DELETE FROM users WHERE id = ?', [targetId]);
    await logAudit(req, 'DELETE_USER', 'users', targetId, { deleted_username: user.username });

    res.json({ success: true, message: `User ${user.username} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 3. PRODUCT & VARIANT CATALOG MANAGEMENT
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/products - List products with filters, sorting, pagination & thumbnails
router.get('/products', async (req, res) => {
  try {
    const { search, category, brand, shape, status = 'all', sort = 'newest', limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      conditions.push('(p.name LIKE ? OR p.sku LIKE ? OR p.description LIKE ? OR EXISTS (SELECT 1 FROM product_variants v2 WHERE v2.product_id = p.id AND v2.sku LIKE ?))');
      params.push(term, term, term, term);
    }
    if (category) {
      conditions.push('(c.slug = ? OR c.id = ?)');
      params.push(category, Number(category) || 0);
    }
    if (brand) {
      conditions.push('(b.slug = ? OR b.id = ?)');
      params.push(brand, Number(brand) || 0);
    }
    if (shape) {
      conditions.push('(s.slug = ? OR s.id = ?)');
      params.push(shape, Number(shape) || 0);
    }
    if (status === 'active') {
      conditions.push('p.is_active = 1');
    } else if (status === 'archived') {
      conditions.push('p.is_active = 0');
    }

    let orderBy = 'p.id DESC';
    if (sort === 'name_asc') orderBy = 'p.name ASC';
    else if (sort === 'price_asc') orderBy = 'p.base_price_inr ASC';
    else if (sort === 'price_desc') orderBy = 'p.base_price_inr DESC';
    else if (sort === 'stock_asc') orderBy = 'total_stock ASC, p.id DESC';

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = await db.get(
      `SELECT COUNT(DISTINCT p.id) AS total
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN frame_shapes s ON s.id = p.shape_id
       ${whereClause}`,
      params
    );

    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const parsedOffset = Math.max(Number(offset) || 0, 0);

    const sql = `
      SELECT p.*, b.name as brand_name, b.slug as brand_slug,
             c.name as category_name, c.slug as category_slug,
             s.name as shape_name, s.slug as shape_slug,
             COUNT(DISTINCT v.id) as variant_count,
             COALESCE(SUM(v.stock_quantity), 0) as total_stock,
             (
               SELECT pi.image_url
               FROM product_images pi
               JOIN product_variants pv ON pv.id = pi.variant_id
               WHERE pv.product_id = p.id
               ORDER BY pv.is_default DESC, pi.display_order ASC, pi.id ASC
               LIMIT 1
             ) as primary_image
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN frame_shapes s ON s.id = p.shape_id
      LEFT JOIN product_variants v ON v.product_id = p.id AND v.is_active = 1
      ${whereClause}
      GROUP BY p.id
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;
    const products = await db.all(sql, [...params, parsedLimit, parsedOffset]);
    res.json({
      success: true,
      total: countRow ? countRow.total : products.length,
      count: products.length,
      limit: parsedLimit,
      offset: parsedOffset,
      products
    });
  } catch (err) {
    console.error('List Admin Products Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/admin/products/:id - Detailed Product Master with Variants & Images
router.get('/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const product = await db.get(
      `SELECT p.*, b.name as brand_name, c.name as category_name, s.name as shape_name
       FROM products p
       LEFT JOIN brands b ON b.id = p.brand_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN frame_shapes s ON s.id = p.shape_id
       WHERE p.id = ?`,
      [id]
    );

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // Fetch variants
    const variants = await db.all(
      'SELECT * FROM product_variants WHERE product_id = ? ORDER BY is_default DESC, id ASC',
      [id]
    );

    // Fetch images for each variant
    for (const v of variants) {
      v.images = await db.all(
        'SELECT * FROM product_images WHERE variant_id = ? ORDER BY display_order ASC',
        [v.id]
      );
    }

    product.variants = variants;
    res.json({ success: true, product });
  } catch (err) {
    console.error('Get Product Detail Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

function slugifyProductText(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

const DEFAULT_COLOR_HEX_MAP = {
  black: '#111111',
  matteblack: '#1F2937',
  tortoise: '#70513B',
  havana: '#6B4423',
  brown: '#6E472B',
  gold: '#C5A059',
  silver: '#B8BCC0',
  gunmetal: '#4B5563',
  grey: '#6B7280',
  gray: '#6B7280',
  crystal: '#E5E7EB',
  clear: '#E5E7EB',
  transparent: '#E5E7EB',
  blue: '#1E3A8A',
  navy: '#1E293B',
  green: '#166534',
  olive: '#4D5D3B',
  red: '#991B1B',
  burgundy: '#7F1D1D',
  pink: '#BE185D',
  rose: '#D9777F',
  amber: '#B45309',
  champagne: '#E6D5B8',
  tigerwood: '#7C4A27'
};

function deriveInternalColorHex(colorName) {
  const key = String(colorName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (DEFAULT_COLOR_HEX_MAP[key]) return DEFAULT_COLOR_HEX_MAP[key];
  for (const [name, hex] of Object.entries(DEFAULT_COLOR_HEX_MAP)) {
    if (key.includes(name)) return hex;
  }
  return '#111111';
}

async function generateUniqueVariantSku(masterCode, colorName) {
  const base = String(masterCode || 'FRM').trim().toUpperCase().replace(/[^A-Z0-9-]+/g, '') || 'FRM';
  const suffix = String(colorName || 'CLR').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'CLR';
  let candidate = `${base}-${suffix}`;
  let counter = 2;
  while (await db.get('SELECT id FROM product_variants WHERE sku = ?', [candidate])) {
    candidate = `${base}-${suffix}${counter}`;
    counter++;
  }
  return candidate;
}

// POST /api/admin/products - Create New Master Frame Silhouette (and optional initial variant)
router.post('/products', requireRole('admin'), validateBody(productCreateSchema), async (req, res) => {
  try {
    const {
      brand_id, shape_id, category_id, name, slug, sku, prod_code, description,
      base_price_inr, gender = 'unisex', material, frame_fit, frame_type = 'Full Rim',
      lens_width_mm, bridge_width_mm, temple_length_mm,
      frame_height_mm = null, total_width_mm = null,
      is_active = 1,
      initial_variant = null
    } = req.body;

    const effectiveMasterSku = String(prod_code || sku || '').trim();
    const effectiveSlug = String(slug || '').trim() || slugifyProductText(`${name}-${effectiveMasterSku}`);

    // Reference integrity validation
    const [brandRow, shapeRow, catRow] = await Promise.all([
      db.get('SELECT id FROM brands WHERE id = ?', [Number(brand_id)]),
      db.get('SELECT id FROM frame_shapes WHERE id = ?', [Number(shape_id)]),
      db.get('SELECT id FROM categories WHERE id = ?', [Number(category_id)])
    ]);
    if (!brandRow) return res.status(400).json({ success: false, message: 'Selected brand does not exist.' });
    if (!shapeRow) return res.status(400).json({ success: false, message: 'Selected frame shape does not exist.' });
    if (!catRow) return res.status(400).json({ success: false, message: 'Selected category does not exist.' });

    // Uniqueness validation
    const existing = await db.get('SELECT id FROM products WHERE slug = ? OR sku = ?', [effectiveSlug, effectiveMasterSku]);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Product code (prod_code) or slug already exists.' });
    }

    let resolvedVariantSku = null;
    let resolvedVariantHex = null;
    if (initial_variant) {
      if (initial_variant.sku && initial_variant.sku.trim()) {
        resolvedVariantSku = initial_variant.sku.trim();
        const existingVar = await db.get('SELECT id FROM product_variants WHERE sku = ?', [resolvedVariantSku]);
        if (existingVar) {
          return res.status(409).json({ success: false, message: `Variant SKU '${resolvedVariantSku}' already exists.` });
        }
      } else {
        resolvedVariantSku = await generateUniqueVariantSku(effectiveMasterSku, initial_variant.color_name);
      }
      resolvedVariantHex = (initial_variant.color_hex && initial_variant.color_hex.trim())
        ? initial_variant.color_hex.trim()
        : deriveInternalColorHex(initial_variant.color_name);
    }

    let newId = null;
    let newVariantId = null;
    const activeFlag = is_active ? 1 : 0;

    await db.transaction(async () => {
      const result = await db.run(
        `INSERT INTO products (
           brand_id, shape_id, category_id, name, slug, sku, description,
           base_price_inr, gender, material, frame_fit, frame_type,
           lens_width_mm, bridge_width_mm, temple_length_mm,
           frame_height_mm, total_width_mm, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          brand_id, shape_id, category_id, name.trim(), effectiveSlug, effectiveMasterSku, description || null,
          Number(base_price_inr), gender, material.trim(), frame_fit.trim(), String(frame_type || 'Full Rim').trim(),
          Number(lens_width_mm), Number(bridge_width_mm), Number(temple_length_mm),
          frame_height_mm ? Number(frame_height_mm) : null, total_width_mm ? Number(total_width_mm) : null, activeFlag
        ]
      );
      newId = result.lastID;

      if (initial_variant) {
        const openingStock = Number(initial_variant.stock_quantity || 0);
        const varRes = await db.run(
          `INSERT INTO product_variants (
             product_id, color_name, color_hex, color_secondary_hex, sku,
             price_override_inr, stock_quantity, is_default, is_active
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            newId,
            initial_variant.color_name.trim(),
            resolvedVariantHex,
            initial_variant.color_secondary_hex ? initial_variant.color_secondary_hex.trim() : null,
            resolvedVariantSku,
            initial_variant.price_override_inr ? Number(initial_variant.price_override_inr) : null,
            openingStock
          ]
        );
        newVariantId = varRes.lastID;

        if (openingStock > 0) {
          await db.run(
            `INSERT INTO inventory_movements (
               variant_id, product_id, user_id, username,
               change_quantity, previous_quantity, new_quantity,
               movement_type, reason
             ) VALUES (?, ?, ?, ?, ?, 0, ?, 'replenishment', ?)`,
            [
              newVariantId, newId, req.user ? req.user.id : null, req.user ? req.user.username : 'Admin',
              openingStock, openingStock, `Opening stock on frame creation (${resolvedVariantSku})`
            ]
          );
        }
      }
    });

    await logAudit(req, 'CREATE_PRODUCT', 'products', newId, {
      name,
      prod_code: effectiveMasterSku,
      slug: effectiveSlug,
      base_price_inr,
      initial_variant_sku: resolvedVariantSku
    });

    res.status(201).json({
      success: true,
      message: initial_variant ? 'Frame and initial colourway created successfully.' : 'Frame created successfully.',
      product_id: newId,
      productId: newId,
      variant_id: newVariantId,
      prod_code: effectiveMasterSku,
      variant_sku: resolvedVariantSku
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
      return res.status(409).json({ success: false, message: 'Product code (prod_code), slug, or variant SKU already exists.' });
    }
    console.error('Create Product Error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

// PUT /api/admin/products/:id - Update Master Frame Silhouette (Admin Only)
router.put('/products/:id', requireRole('admin'), validateBody(productUpdateSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      brand_id, shape_id, category_id, name, slug, sku, description,
      base_price_inr, gender, material, frame_fit, frame_type,
      lens_width_mm, bridge_width_mm, temple_length_mm,
      frame_height_mm, total_width_mm, is_featured, is_active
    } = req.body;

    const existing = await db.get('SELECT * FROM products WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    if (slug || sku) {
      const conflict = await db.get(
        'SELECT id FROM products WHERE id != ? AND (slug = ? OR sku = ?)',
        [id, (slug || existing.slug).trim(), (sku || existing.sku).trim()]
      );
      if (conflict) {
        return res.status(409).json({ success: false, message: 'Another product already uses this slug or master SKU.' });
      }
    }

    await db.run(
      `UPDATE products SET
         brand_id = COALESCE(?, brand_id),
         shape_id = COALESCE(?, shape_id),
         category_id = COALESCE(?, category_id),
         name = COALESCE(?, name),
         slug = COALESCE(?, slug),
         sku = COALESCE(?, sku),
         description = ?,
         base_price_inr = COALESCE(?, base_price_inr),
         gender = COALESCE(?, gender),
         material = COALESCE(?, material),
         frame_fit = COALESCE(?, frame_fit),
         frame_type = COALESCE(?, frame_type),
         lens_width_mm = COALESCE(?, lens_width_mm),
         bridge_width_mm = COALESCE(?, bridge_width_mm),
         temple_length_mm = COALESCE(?, temple_length_mm),
         frame_height_mm = ?,
         total_width_mm = ?,
         is_featured = COALESCE(?, is_featured),
         is_active = COALESCE(?, is_active),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        brand_id || null,
        shape_id || null,
        category_id || null,
        name ? name.trim() : null,
        slug ? slug.trim() : null,
        sku ? sku.trim() : null,
        description !== undefined ? description : existing.description,
        base_price_inr !== undefined ? Number(base_price_inr) : null,
        gender || null,
        material ? material.trim() : null,
        frame_fit || null,
        frame_type ? frame_type.trim() : null,
        lens_width_mm !== undefined ? Number(lens_width_mm) : null,
        bridge_width_mm !== undefined ? Number(bridge_width_mm) : null,
        temple_length_mm !== undefined ? Number(temple_length_mm) : null,
        frame_height_mm !== undefined ? (frame_height_mm ? Number(frame_height_mm) : null) : existing.frame_height_mm,
        total_width_mm !== undefined ? (total_width_mm ? Number(total_width_mm) : null) : existing.total_width_mm,
        is_featured !== undefined ? (is_featured ? 1 : 0) : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id
      ]
    );

    await logAudit(req, 'UPDATE_PRODUCT', 'products', id, { name, sku, base_price_inr });
    res.json({ success: true, message: 'Product updated successfully.' });
  } catch (err) {
    console.error('Update Product Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PATCH /api/admin/products/:id/status - Toggle Archive/Active Status
router.patch('/products/:id/status', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { is_active } = req.body;
    if (is_active === undefined) {
      return res.status(400).json({ success: false, message: 'is_active (0 or 1) is required.' });
    }

    const result = await db.run('UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [Number(is_active), id]);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    await logAudit(req, is_active ? 'RESTORE_PRODUCT' : 'ARCHIVE_PRODUCT', 'products', id, { is_active });
    res.json({ success: true, message: `Product ${is_active ? 'activated' : 'archived'} successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 4. COLORWAY VARIANT & PHOTOGRAPHY MANAGEMENT (1-5 ORDERED IMAGES)
// ═════════════════════════════════════════════════════════════════════

// POST /api/admin/products/:id/variants - Add Colorway Variant (with opening stock movement)
router.post('/products/:id/variants', requireRole('admin'), validateBody(variantInlineSchema), async (req, res) => {
  try {
    const productId = Number(req.params.id);
    const product = await db.get('SELECT id FROM products WHERE id = ?', [productId]);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Master product not found.' });
    }

    const {
      color_name, color_hex, color_secondary_hex, sku,
      price_override_inr, stock_quantity = 0, is_default = 0
    } = req.body;

    const existingSku = await db.get('SELECT id FROM product_variants WHERE sku = ?', [sku.trim()]);
    if (existingSku) {
      return res.status(409).json({ success: false, message: 'Variant SKU already exists.' });
    }

    let variantId = null;
    const openingStock = Number(stock_quantity || 0);

    await db.transaction(async () => {
      if (is_default) {
        await db.run('UPDATE product_variants SET is_default = 0 WHERE product_id = ?', [productId]);
      }

      const result = await db.run(
        `INSERT INTO product_variants (
           product_id, color_name, color_hex, color_secondary_hex, sku,
           price_override_inr, stock_quantity, is_default, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          productId, color_name.trim(), color_hex.trim(),
          color_secondary_hex ? color_secondary_hex.trim() : null,
          sku.trim(), price_override_inr ? Number(price_override_inr) : null,
          openingStock, is_default ? 1 : 0
        ]
      );
      variantId = result.lastID;

      if (openingStock > 0) {
        await db.run(
          `INSERT INTO inventory_movements (
             variant_id, product_id, user_id, username,
             change_quantity, previous_quantity, new_quantity,
             movement_type, reason
           ) VALUES (?, ?, ?, ?, ?, 0, ?, 'replenishment', ?)`,
          [
            variantId, productId, req.user ? req.user.id : null, req.user ? req.user.username : 'Admin',
            openingStock, openingStock, `Opening stock on colorway creation (${sku.trim()})`
          ]
        );
      }
    });

    await logAudit(req, 'CREATE_VARIANT', 'product_variants', variantId, { productId, color_name, sku, stock_quantity: openingStock });

    res.status(201).json({
      success: true,
      message: 'Colorway variant added successfully.',
      variant_id: variantId
    });
  } catch (err) {
    console.error('Add Variant Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PUT /api/admin/variants/:variantId - Edit Variant
router.put('/variants/:variantId', requireRole('admin'), validateBody(variantUpdateSchema), async (req, res) => {
  try {
    const variantId = Number(req.params.variantId);
    const { color_name, color_hex, color_secondary_hex, sku, price_override_inr, is_default, is_active } = req.body;

    const variant = await db.get('SELECT * FROM product_variants WHERE id = ?', [variantId]);
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found.' });
    }

    if (sku && sku.trim() !== variant.sku) {
      const conflict = await db.get('SELECT id FROM product_variants WHERE sku = ? AND id != ?', [sku.trim(), variantId]);
      if (conflict) {
        return res.status(409).json({ success: false, message: 'Variant SKU already exists.' });
      }
    }

    if (is_default) {
      await db.run('UPDATE product_variants SET is_default = 0 WHERE product_id = ?', [variant.product_id]);
    }

    const nextPriceOverride = price_override_inr !== undefined
      ? (price_override_inr !== null && price_override_inr !== '' ? Number(price_override_inr) : null)
      : variant.price_override_inr;

    await db.run(
      `UPDATE product_variants SET
         color_name = COALESCE(?, color_name),
         color_hex = COALESCE(?, color_hex),
         color_secondary_hex = ?,
         sku = COALESCE(?, sku),
         price_override_inr = ?,
         is_default = COALESCE(?, is_default),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        color_name ? color_name.trim() : null,
        color_hex ? color_hex.trim() : null,
        color_secondary_hex !== undefined ? (color_secondary_hex || null) : variant.color_secondary_hex,
        sku ? sku.trim() : null,
        nextPriceOverride,
        is_default !== undefined ? (is_default ? 1 : 0) : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        variantId
      ]
    );

    await logAudit(req, 'UPDATE_VARIANT', 'product_variants', variantId, { color_name, sku });
    res.json({ success: true, message: 'Variant updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// DELETE /api/admin/variants/:variantId - Delete Variant (with image disk cleanup)
router.delete('/variants/:variantId', requireRole('admin'), async (req, res) => {
  try {
    const variantId = Number(req.params.variantId);
    const variant = await db.get('SELECT * FROM product_variants WHERE id = ?', [variantId]);
    if (!variant) {
      return res.status(404).json({ success: false, message: 'Variant not found.' });
    }

    const images = await db.all('SELECT image_url FROM product_images WHERE variant_id = ?', [variantId]);
    await db.run('DELETE FROM product_variants WHERE id = ?', [variantId]);
    for (const img of images) {
      if (img.image_url && img.image_url.startsWith('images/products/')) {
        safeUnlink(resolveSafePublicPath(img.image_url));
      }
    }

    await logAudit(req, 'DELETE_VARIANT', 'product_variants', variantId, { sku: variant.sku, product_id: variant.product_id });
    res.json({ success: true, message: `Variant ${variant.sku} deleted.` });
  } catch (err) {
    console.error('Delete Variant Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST /api/admin/variants/:variantId/images - Upload 1 to 5 Product Images (validates MIME + magic bytes, Jimp resizes, max 5 total)
router.post(
  '/variants/:variantId/images',
  requireRole('admin'),
  handleImageUploadMiddleware(uploadMemory.fields([{ name: 'images', maxCount: 5 }, { name: 'image', maxCount: 1 }])),
  async (req, res) => {
    const storedFiles = [];
    try {
      const variantId = Number(req.params.variantId);
      const variant = await db.get('SELECT id, sku FROM product_variants WHERE id = ?', [variantId]);
      if (!variant) {
        return res.status(404).json({ success: false, message: 'Variant not found.' });
      }

      const incomingFiles = [
        ...(req.files?.images || []),
        ...(req.files?.image || [])
      ];

      if (incomingFiles.length === 0) {
        return res.status(400).json({ success: false, message: 'Please select at least 1 image file (JPEG, PNG, or WebP).' });
      }

      const countRow = await db.get('SELECT COUNT(*) as count, COALESCE(MAX(display_order), 0) as maxOrder FROM product_images WHERE variant_id = ?', [variantId]);
      const existingCount = countRow ? countRow.count : 0;
      let nextOrder = (countRow ? countRow.maxOrder : 0) + 1;

      if (existingCount + incomingFiles.length > 5) {
        return res.status(400).json({
          success: false,
          message: `Maximum 5 images allowed per variant colorway (currently ${existingCount}/5, attempted to add ${incomingFiles.length}).`
        });
      }

      const validTypes = ['studio_front', 'model_on_face', 'angle_45', 'hinge_detail', 'packaging'];
      let requestedTypes = req.body.image_types || req.body.image_type || 'studio_front';
      if (typeof requestedTypes === 'string' && requestedTypes.startsWith('[')) {
        try { requestedTypes = JSON.parse(requestedTypes); } catch (_) {}
      }

      const defaultTypeSequence = ['studio_front', 'model_on_face', 'angle_45', 'hinge_detail', 'packaging'];
      const resolvedTypes = incomingFiles.map((_, idx) => {
        const rawT = Array.isArray(requestedTypes) ? requestedTypes[idx] : (incomingFiles.length === 1 ? requestedTypes : defaultTypeSequence[Math.min(existingCount + idx, 4)]);
        const t = String(rawT || 'studio_front').trim();
        if (!validTypes.includes(t)) {
          throw new Error(`Invalid image type '${t}'. Must be one of: [${validTypes.join(', ')}]`);
        }
        return t;
      });

      // Validate & process all files before inserting any DB rows (prevents orphaned DB rows on partial failure)
      const processed = [];
      for (let idx = 0; idx < incomingFiles.length; idx++) {
        const stored = await processAndStorePublicImage(incomingFiles[idx], {
          subdir: 'products',
          prefix: `prod_v${variantId}`,
          maxWidth: 1400
        });
        storedFiles.push(stored.diskPath);
        processed.push({
          stored,
          imgType: resolvedTypes[idx],
          altText: req.body.alt_text || null,
          order: req.body.display_order && incomingFiles.length === 1 ? Number(req.body.display_order) : nextOrder++
        });
      }

      const createdImages = [];
      await db.transaction(async () => {
        for (const item of processed) {
          const result = await db.run(
            `INSERT INTO product_images (variant_id, image_type, image_url, alt_text, display_order)
             VALUES (?, ?, ?, ?, ?)`,
            [variantId, item.imgType, item.stored.imageUrl, item.altText, item.order]
          );
          createdImages.push({
            id: result.lastID,
            variant_id: variantId,
            image_type: item.imgType,
            image_url: item.stored.imageUrl,
            display_order: item.order
          });
        }
      });

      await logAudit(req, 'UPLOAD_IMAGE', 'product_images', createdImages[0]?.id || variantId, {
        variantId,
        count: createdImages.length,
        urls: createdImages.map(i => i.image_url)
      });

      res.status(201).json({
        success: true,
        message: `${createdImages.length} product image(s) uploaded and optimized successfully.`,
        image: createdImages[0],
        images: createdImages
      });
    } catch (err) {
      storedFiles.forEach(p => safeUnlink(p));
      console.error('Image Upload Error:', err);
      const status = err.message && (err.message.includes('Invalid') || err.message.includes('Unsupported')) ? 400 : 500;
      res.status(status).json({ success: false, message: err.message || 'Image upload failed.' });
    }
  }
);

// PUT /api/admin/variants/:variantId/images/reorder - Persist Custom Display Order (1st = Primary)
router.put('/variants/:variantId/images/reorder', requireRole('admin'), async (req, res) => {
  try {
    const variantId = Number(req.params.variantId);
    const { image_ids } = req.body;
    if (!Array.isArray(image_ids) || image_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'image_ids array is required.' });
    }

    const existing = await db.all('SELECT id FROM product_images WHERE variant_id = ?', [variantId]);
    const validIds = new Set(existing.map(r => r.id));
    if (image_ids.some(id => !validIds.has(Number(id)))) {
      return res.status(400).json({ success: false, message: 'One or more image IDs do not belong to this variant.' });
    }

    await db.transaction(async () => {
      for (let i = 0; i < image_ids.length; i++) {
        await db.run(
          'UPDATE product_images SET display_order = ? WHERE id = ? AND variant_id = ?',
          [i + 1, Number(image_ids[i]), variantId]
        );
      }
    });

    const images = await db.all('SELECT * FROM product_images WHERE variant_id = ? ORDER BY display_order ASC, id ASC', [variantId]);
    await logAudit(req, 'REORDER_IMAGES', 'product_variants', variantId, { image_ids });
    res.json({ success: true, message: 'Image order updated (1st image is primary view).', images });
  } catch (err) {
    console.error('Image Reorder Error:', err);
    res.status(500).json({ success: false, message: 'Failed to reorder images.' });
  }
});

// PATCH /api/admin/images/:imageId - Update Image Type or Set Primary
router.patch('/images/:imageId', requireRole('admin'), async (req, res) => {
  try {
    const imageId = Number(req.params.imageId);
    const img = await db.get('SELECT * FROM product_images WHERE id = ?', [imageId]);
    if (!img) return res.status(404).json({ success: false, message: 'Image not found.' });

    const { image_type, alt_text, set_primary } = req.body;
    const validTypes = ['studio_front', 'model_on_face', 'angle_45', 'hinge_detail', 'packaging'];
    if (image_type && !validTypes.includes(image_type)) {
      return res.status(400).json({ success: false, message: 'Invalid image_type.' });
    }

    await db.transaction(async () => {
      if (set_primary) {
        const others = await db.all('SELECT id FROM product_images WHERE variant_id = ? AND id != ? ORDER BY display_order ASC, id ASC', [img.variant_id, imageId]);
        await db.run('UPDATE product_images SET display_order = 1 WHERE id = ?', [imageId]);
        for (let i = 0; i < others.length; i++) {
          await db.run('UPDATE product_images SET display_order = ? WHERE id = ?', [i + 2, others[i].id]);
        }
      }
      if (image_type !== undefined || alt_text !== undefined) {
        await db.run(
          'UPDATE product_images SET image_type = COALESCE(?, image_type), alt_text = COALESCE(?, alt_text) WHERE id = ?',
          [image_type || null, alt_text !== undefined ? alt_text : null, imageId]
        );
      }
    });

    await logAudit(req, 'UPDATE_IMAGE', 'product_images', imageId, { image_type, set_primary });
    res.json({ success: true, message: set_primary ? 'Primary image updated.' : 'Image details updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// DELETE /api/admin/images/:imageId - Delete Product Image
router.delete('/images/:imageId', requireRole('admin'), async (req, res) => {
  try {
    const imageId = Number(req.params.imageId);
    const img = await db.get('SELECT * FROM product_images WHERE id = ?', [imageId]);
    if (!img) {
      return res.status(404).json({ success: false, message: 'Image not found.' });
    }

    if (img.image_url && img.image_url.startsWith('images/products/')) {
      safeUnlink(resolveSafePublicPath(img.image_url));
    }

    await db.run('DELETE FROM product_images WHERE id = ?', [imageId]);
    await logAudit(req, 'DELETE_IMAGE', 'product_images', imageId, { variant_id: img.variant_id });
    res.json({ success: true, message: 'Image deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 5. INVENTORY MANAGEMENT & MOVEMENTS HISTORY
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/inventory - Comprehensive Inventory Grid with Summary & Last Movement
router.get('/inventory', async (req, res) => {
  try {
    const { search, brand_id, category_id, stock_status, sort = 'stock_asc', limit = 100, offset = 0 } = req.query;
    const conditions = ['v.is_active = 1', 'p.is_active = 1'];
    const params = [];

    if (search && search.trim()) {
      conditions.push('(v.sku LIKE ? OR v.color_name LIKE ? OR p.name LIKE ? OR p.sku LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }
    if (brand_id) {
      conditions.push('p.brand_id = ?');
      params.push(Number(brand_id));
    }
    if (category_id) {
      conditions.push('p.category_id = ?');
      params.push(Number(category_id));
    }
    if (stock_status === 'low') {
      conditions.push('v.stock_quantity > 0 AND v.stock_quantity <= 5');
    } else if (stock_status === 'out') {
      conditions.push('v.stock_quantity = 0');
    } else if (stock_status === 'in') {
      conditions.push('v.stock_quantity > 5');
    }

    let orderBy = 'v.stock_quantity ASC, p.name ASC';
    if (sort === 'stock_desc') orderBy = 'v.stock_quantity DESC, p.name ASC';
    else if (sort === 'sku_asc') orderBy = 'v.sku ASC';
    else if (sort === 'name_asc') orderBy = 'p.name ASC, v.sku ASC';

    const whereClause = conditions.join(' AND ');
    const parsedLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const parsedOffset = Math.max(Number(offset) || 0, 0);

    const [summaryRow, filteredCountRow, inventory] = await Promise.all([
      db.get(`
        SELECT COUNT(*) AS total_variants,
               COALESCE(SUM(v.stock_quantity), 0) AS total_units,
               SUM(CASE WHEN v.stock_quantity > 5 THEN 1 ELSE 0 END) AS healthy_variants,
               SUM(CASE WHEN v.stock_quantity > 0 AND v.stock_quantity <= 5 THEN 1 ELSE 0 END) AS low_stock_variants,
               SUM(CASE WHEN v.stock_quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock_variants
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.is_active = 1 AND p.is_active = 1
      `),
      db.get(
        `SELECT COUNT(*) AS total
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE ${whereClause}`,
        params
      ),
      db.all(
        `SELECT v.id as variant_id, v.sku, v.color_name, v.color_hex, v.stock_quantity,
                v.price_override_inr, p.id as product_id, p.name as product_name, p.sku as master_sku,
                p.base_price_inr, COALESCE(v.price_override_inr, p.base_price_inr) as effective_price_inr,
                b.name as brand_name, c.name as category_name,
                (SELECT m.change_quantity FROM inventory_movements m WHERE m.variant_id = v.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) as last_change_quantity,
                (SELECT m.movement_type FROM inventory_movements m WHERE m.variant_id = v.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) as last_movement_type,
                (SELECT m.created_at FROM inventory_movements m WHERE m.variant_id = v.id ORDER BY m.created_at DESC, m.id DESC LIMIT 1) as last_movement_at
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         JOIN brands b ON b.id = p.brand_id
         JOIN categories c ON c.id = p.category_id
         WHERE ${whereClause}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`,
        [...params, parsedLimit, parsedOffset]
      )
    ]);

    res.json({
      success: true,
      total: filteredCountRow ? filteredCountRow.total : inventory.length,
      count: inventory.length,
      limit: parsedLimit,
      offset: parsedOffset,
      summary: {
        total_variants: Number(summaryRow?.total_variants || 0),
        total_units: Number(summaryRow?.total_units || 0),
        healthy_variants: Number(summaryRow?.healthy_variants || 0),
        low_stock_variants: Number(summaryRow?.low_stock_variants || 0),
        out_of_stock_variants: Number(summaryRow?.out_of_stock_variants || 0)
      },
      inventory
    });
  } catch (err) {
    console.error('Inventory Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/admin/inventory/export - Download current filtered inventory as CSV
router.get('/inventory/export', requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { search, brand_id, category_id, stock_status } = req.query;
    const conditions = ['v.is_active = 1', 'p.is_active = 1'];
    const params = [];

    if (search && search.trim()) {
      conditions.push('(v.sku LIKE ? OR v.color_name LIKE ? OR p.name LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }
    if (brand_id) {
      conditions.push('p.brand_id = ?');
      params.push(Number(brand_id));
    }
    if (category_id) {
      conditions.push('p.category_id = ?');
      params.push(Number(category_id));
    }
    if (stock_status === 'low') conditions.push('v.stock_quantity > 0 AND v.stock_quantity <= 5');
    else if (stock_status === 'out') conditions.push('v.stock_quantity = 0');
    else if (stock_status === 'in') conditions.push('v.stock_quantity > 5');

    const rows = await db.all(
      `SELECT v.sku AS variant_sku, p.sku AS master_sku, p.name AS product_name,
              b.name AS brand_name, c.name AS category_name, v.color_name,
              COALESCE(v.price_override_inr, p.base_price_inr) AS retail_price_inr,
              v.stock_quantity,
              CASE WHEN v.stock_quantity = 0 THEN 'Out of Stock'
                   WHEN v.stock_quantity <= 5 THEN 'Low Stock'
                   ELSE 'Healthy' END AS stock_status
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN brands b ON b.id = p.brand_id
       JOIN categories c ON c.id = p.category_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY p.name ASC, v.sku ASC`,
      params
    );

    const csv = buildCsvContent(
      ['variant_sku', 'master_sku', 'product_name', 'brand_name', 'category_name', 'color_name', 'retail_price_inr', 'stock_quantity', 'stock_status'],
      rows.map(r => [r.variant_sku, r.master_sku, r.product_name, r.brand_name, r.category_name, r.color_name, r.retail_price_inr, r.stock_quantity, r.stock_status])
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="optii_inventory_export.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Inventory Export Error:', err);
    res.status(500).json({ success: false, message: 'Failed to export inventory.' });
  }
});

// POST /api/admin/inventory/adjust - Manual Stock Adjustment or Replenishment with Mandatory Reason & Schema Validation
router.post('/inventory/adjust', validateBody(stockAdjustSchema), async (req, res) => {
  try {
    const { variant_id, change_quantity, movement_type = 'manual_adjustment', reason } = req.body;

    if (!variant_id || change_quantity === undefined || !reason || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: 'variant_id, change_quantity (integer), and a non-empty audit reason are strictly required.'
      });
    }

    const delta = Number(change_quantity);
    if (isNaN(delta) || delta === 0) {
      return res.status(400).json({ success: false, message: 'change_quantity must be a non-zero integer.' });
    }

    const validMovements = ['manual_adjustment', 'replenishment', 'damage_writeoff'];
    if (!validMovements.includes(movement_type)) {
      return res.status(400).json({
        success: false,
        message: `movement_type must be one of: [${validMovements.join(', ')}]`
      });
    }

    let resultPayload;
    await db.transaction(async () => {
      const variant = await db.get(
        `SELECT v.*, p.id as product_id, p.name as product_name
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = ?`,
        [Number(variant_id)]
      );

      if (!variant) {
        const err = new Error('Variant not found.');
        err.status = 404;
        throw err;
      }

      const previousQty = variant.stock_quantity;
      const newQty = previousQty + delta;
      if (newQty < 0) {
        const err = new Error(`Cannot decrease stock below 0. Current available stock is ${previousQty} units.`);
        err.status = 400;
        throw err;
      }

      // Atomically update stock
      await db.run('UPDATE product_variants SET stock_quantity = ? WHERE id = ?', [newQty, variant.id]);

      // Record permanent inventory movement history
      await db.run(
        `INSERT INTO inventory_movements (
           variant_id, product_id, user_id, username,
           change_quantity, previous_quantity, new_quantity,
           movement_type, reason
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          variant.id, variant.product_id, req.user ? req.user.id : null, req.user ? req.user.username : 'Staff',
          delta, previousQty, newQty, movement_type, reason.trim()
        ]
      );

      resultPayload = {
        success: true,
        message: `Stock updated for ${variant.product_name} (${variant.sku}). New quantity: ${newQty} units.`,
        variant_id: variant.id,
        previous_quantity: previousQty,
        new_quantity: newQty
      };
    });

    // Audit log
    await logAudit(req, 'INVENTORY_ADJUSTMENT', 'product_variants', Number(variant_id), {
      delta,
      reason: reason.trim()
    });

    res.json(resultPayload);
  } catch (err) {
    if (err.status && err.status < 500) {
      return res.status(err.status).json({ success: false, message: err.message });
    }
    console.error('Inventory Adjustment Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/admin/inventory/movements - View Inventory Movement History Log
router.get('/inventory/movements', async (req, res) => {
  try {
    const { variant_id, limit = 50 } = req.query;
    let conditions = [];
    let params = [];

    if (variant_id) {
      conditions.push('m.variant_id = ?');
      params.push(Number(variant_id));
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT m.*, p.name as product_name, v.sku, v.color_name
      FROM inventory_movements m
      JOIN products p ON p.id = m.product_id
      JOIN product_variants v ON v.id = m.variant_id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ?
    `;
    params.push(Number(limit));

    const movements = await db.all(sql, params);
    res.json({ success: true, count: movements.length, movements });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 6. TAXONOMY MANAGEMENT (BRANDS, SHAPES, CATEGORIES)
// ═════════════════════════════════════════════════════════════════════

function sanitizeShapeSvg(rawSvg) {
  const defaultSvg = '<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="14" cy="12" r="8"/><circle cx="34" cy="12" r="8"/><line x1="22" y1="12" x2="26" y2="12"/></svg>';
  const str = String(rawSvg || '').trim();
  if (!str) return defaultSvg;
  if (!str.toLowerCase().includes('<svg')) {
    throw new Error('Shape icon must be valid inline SVG markup (<svg ...>).');
  }
  if (/<script|on\w+\s*=|javascript:/i.test(str)) {
    throw new Error('Unsafe script or event attribute detected in SVG markup.');
  }
  return str;
}

// Brands: GET, POST, PUT, DELETE + Logo Upload
router.get('/brands', async (req, res) => {
  try {
    const brands = await db.all(`
      SELECT b.*, COUNT(p.id) as product_count
      FROM brands b
      LEFT JOIN products p ON p.brand_id = b.id AND p.is_active = 1
      GROUP BY b.id
      ORDER BY b.name ASC
    `);
    res.json({ success: true, brands });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

router.post('/brands', requireRole('admin'), validateBody(brandPayloadSchema), async (req, res) => {
  try {
    const { name, slug, description, logo_url, is_active = 1 } = req.body;
    const conflict = await db.get('SELECT id FROM brands WHERE LOWER(name) = LOWER(?) OR slug = ?', [name.trim(), slug.trim()]);
    if (conflict) {
      return res.status(409).json({ success: false, message: 'A brand with this name or slug already exists.' });
    }

    const result = await db.run(
      'INSERT INTO brands (name, slug, description, logo_url, is_active) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), slug.trim(), description || null, logo_url || null, is_active ? 1 : 0]
    );
    await logAudit(req, 'CREATE_BRAND', 'brands', result.lastID, { name, slug });
    res.status(201).json({ success: true, message: 'Brand created successfully.', brand_id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

router.put('/brands/:id', requireRole('admin'), validateBody(brandPayloadSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM brands WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Brand not found.' });

    const { name, slug, description, logo_url, is_active } = req.body;
    const conflict = await db.get(
      'SELECT id FROM brands WHERE id != ? AND (LOWER(name) = LOWER(?) OR slug = ?)',
      [id, name.trim(), slug.trim()]
    );
    if (conflict) {
      return res.status(409).json({ success: false, message: 'Another brand already uses this name or slug.' });
    }

    await db.run(
      `UPDATE brands SET
         name = ?,
         slug = ?,
         description = ?,
         logo_url = COALESCE(?, logo_url),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        name.trim(),
        slug.trim(),
        description !== undefined ? (description || null) : existing.description,
        logo_url !== undefined ? (logo_url || null) : existing.logo_url,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        id
      ]
    );
    await logAudit(req, 'UPDATE_BRAND', 'brands', id, { name, slug, is_active });
    res.json({ success: true, message: 'Brand updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

router.post(
  '/brands/:id/logo',
  requireRole('admin'),
  handleImageUploadMiddleware(uploadMemory.single('logo')),
  async (req, res) => {
    let stored = null;
    try {
      const id = Number(req.params.id);
      const brand = await db.get('SELECT * FROM brands WHERE id = ?', [id]);
      if (!brand) return res.status(404).json({ success: false, message: 'Brand not found.' });
      if (!req.file) return res.status(400).json({ success: false, message: 'Brand logo image file is required.' });

      stored = await processAndStorePublicImage(req.file, { subdir: 'brands', prefix: `brand_${id}`, maxWidth: 600 });
      await db.run('UPDATE brands SET logo_url = ? WHERE id = ?', [`/${stored.imageUrl}`, id]);
      if (brand.logo_url && brand.logo_url.startsWith('/images/brands/')) {
        safeUnlink(resolveSafePublicPath(brand.logo_url));
      }
      await logAudit(req, 'UPLOAD_BRAND_LOGO', 'brands', id, { logo_url: `/${stored.imageUrl}` });
      res.json({ success: true, message: 'Brand logo uploaded.', logo_url: `/${stored.imageUrl}` });
    } catch (err) {
      if (stored?.diskPath) safeUnlink(stored.diskPath);
      const status = err.message && (err.message.includes('Invalid') || err.message.includes('Unsupported')) ? 400 : 500;
      res.status(status).json({ success: false, message: err.message || 'Failed to upload brand logo.' });
    }
  }
);

router.delete('/brands/:id/logo', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const brand = await db.get('SELECT * FROM brands WHERE id = ?', [id]);
    if (!brand) return res.status(404).json({ success: false, message: 'Brand not found.' });
    if (brand.logo_url && brand.logo_url.startsWith('/images/brands/')) {
      safeUnlink(resolveSafePublicPath(brand.logo_url));
    }
    await db.run('UPDATE brands SET logo_url = NULL WHERE id = ?', [id]);
    await logAudit(req, 'REMOVE_BRAND_LOGO', 'brands', id, {});
    res.json({ success: true, message: 'Brand logo removed.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

router.delete('/brands/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM brands WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Brand not found.' });

    const ref = await db.get('SELECT COUNT(*) as count FROM products WHERE brand_id = ?', [id]);
    if (ref && ref.count > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete "${existing.name}": ${ref.count} frame(s) are assigned to this brand. Reassign those frames or disable the brand instead.`
      });
    }
    if (existing.logo_url && existing.logo_url.startsWith('/images/brands/')) {
      safeUnlink(resolveSafePublicPath(existing.logo_url));
    }
    await db.run('DELETE FROM brands WHERE id = ?', [id]);
    await logAudit(req, 'DELETE_BRAND', 'brands', id, { name: existing.name });
    res.json({ success: true, message: 'Brand deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Frame Shapes: GET, POST, PUT, DELETE
router.get('/shapes', async (req, res) => {
  try {
    const shapes = await db.all(`
      SELECT s.*, COUNT(p.id) as product_count
      FROM frame_shapes s
      LEFT JOIN products p ON p.shape_id = s.id AND p.is_active = 1
      GROUP BY s.id
      ORDER BY s.display_order ASC, s.name ASC
    `);
    res.json({ success: true, shapes });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

router.post('/shapes', requireRole('admin'), validateBody(shapePayloadSchema), async (req, res) => {
  try {
    const { name, slug, icon_svg, svg_icon_path, display_order = 0, is_active = 1 } = req.body;
    const conflict = await db.get('SELECT id FROM frame_shapes WHERE LOWER(name) = LOWER(?) OR slug = ?', [name.trim(), slug.trim()]);
    if (conflict) {
      return res.status(409).json({ success: false, message: 'A frame shape with this name or slug already exists.' });
    }

    const svgContent = sanitizeShapeSvg(icon_svg || svg_icon_path);
    const result = await db.run(
      'INSERT INTO frame_shapes (name, slug, icon_svg, display_order, is_active) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), slug.trim(), svgContent, Number(display_order), is_active ? 1 : 0]
    );
    await logAudit(req, 'CREATE_SHAPE', 'frame_shapes', result.lastID, { name, slug });
    res.status(201).json({ success: true, message: 'Frame shape created successfully.', shape_id: result.lastID });
  } catch (err) {
    const status = err.message && err.message.includes('SVG') ? 400 : 500;
    res.status(status).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

router.put('/shapes/:id', requireRole('admin'), validateBody(shapePayloadSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM frame_shapes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Frame shape not found.' });

    const { name, slug, icon_svg, svg_icon_path, display_order, is_active } = req.body;
    const conflict = await db.get(
      'SELECT id FROM frame_shapes WHERE id != ? AND (LOWER(name) = LOWER(?) OR slug = ?)',
      [id, name.trim(), slug.trim()]
    );
    if (conflict) {
      return res.status(409).json({ success: false, message: 'Another shape already uses this name or slug.' });
    }

    const rawSvg = icon_svg !== undefined ? icon_svg : svg_icon_path;
    const svgContent = rawSvg !== undefined && rawSvg !== null && String(rawSvg).trim() !== ''
      ? sanitizeShapeSvg(rawSvg)
      : existing.icon_svg;

    await db.run(
      'UPDATE frame_shapes SET name = ?, slug = ?, icon_svg = ?, display_order = ?, is_active = ? WHERE id = ?',
      [
        name.trim(),
        slug.trim(),
        svgContent,
        display_order !== undefined ? Number(display_order) : existing.display_order,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        id
      ]
    );
    await logAudit(req, 'UPDATE_SHAPE', 'frame_shapes', id, { name, slug, is_active });
    res.json({ success: true, message: 'Frame shape updated successfully.' });
  } catch (err) {
    const status = err.message && err.message.includes('SVG') ? 400 : 500;
    res.status(status).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

router.delete('/shapes/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM frame_shapes WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Frame shape not found.' });

    const ref = await db.get('SELECT COUNT(*) as count FROM products WHERE shape_id = ?', [id]);
    if (ref && ref.count > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete "${existing.name}": ${ref.count} frame(s) use this shape. Reassign those frames or disable the shape instead.`
      });
    }
    await db.run('DELETE FROM frame_shapes WHERE id = ?', [id]);
    await logAudit(req, 'DELETE_SHAPE', 'frame_shapes', id, { name: existing.name });
    res.json({ success: true, message: 'Frame shape deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Categories: GET, POST, PUT, DELETE
router.get('/categories', async (req, res) => {
  try {
    const categories = await db.all(`
      SELECT c.*, COUNT(p.id) as product_count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id AND p.is_active = 1
      GROUP BY c.id
      ORDER BY c.display_order ASC, c.name ASC
    `);
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

router.post('/categories', requireRole('admin'), validateBody(categoryPayloadSchema), async (req, res) => {
  try {
    const { name, slug, category_type = 'glasses', gender = 'unisex', description = null, display_order = 0, is_active = 1 } = req.body;
    const conflict = await db.get('SELECT id FROM categories WHERE slug = ?', [slug.trim()]);
    if (conflict) {
      return res.status(409).json({ success: false, message: 'A category with this slug already exists.' });
    }

    const result = await db.run(
      `INSERT INTO categories (name, slug, category_type, gender, description, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), slug.trim(), category_type, gender, description || null, Number(display_order), is_active ? 1 : 0]
    );
    await logAudit(req, 'CREATE_CATEGORY', 'categories', result.lastID, { name, slug, category_type });
    res.status(201).json({ success: true, message: 'Category created successfully.', category_id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

router.put('/categories/:id', requireRole('admin'), validateBody(categoryPayloadSchema), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM categories WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Category not found.' });

    const { name, slug, category_type, gender, description, display_order, is_active } = req.body;
    const conflict = await db.get('SELECT id FROM categories WHERE id != ? AND slug = ?', [id, slug.trim()]);
    if (conflict) {
      return res.status(409).json({ success: false, message: 'Another category already uses this slug.' });
    }

    await db.run(
      `UPDATE categories SET
         name = ?,
         slug = ?,
         category_type = ?,
         gender = ?,
         description = ?,
         display_order = ?,
         is_active = ?
       WHERE id = ?`,
      [
        name.trim(),
        slug.trim(),
        category_type || existing.category_type,
        gender || existing.gender,
        description !== undefined ? (description || null) : existing.description,
        display_order !== undefined ? Number(display_order) : existing.display_order,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        id
      ]
    );
    await logAudit(req, 'UPDATE_CATEGORY', 'categories', id, { name, slug, category_type, is_active });
    res.json({ success: true, message: 'Category updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

router.delete('/categories/:id', requireRole('admin'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = await db.get('SELECT * FROM categories WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Category not found.' });

    const ref = await db.get('SELECT COUNT(*) as count FROM products WHERE category_id = ?', [id]);
    if (ref && ref.count > 0) {
      return res.status(409).json({
        success: false,
        message: `Cannot delete "${existing.name}": ${ref.count} frame(s) belong to this category. Reassign those frames or disable the category instead.`
      });
    }
    await db.run('DELETE FROM categories WHERE id = ?', [id]);
    await logAudit(req, 'DELETE_CATEGORY', 'categories', id, { name: existing.name });
    res.json({ success: true, message: 'Category deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 7. LENS OPTIONS & DYNAMIC PRICING CONFIGURATION (STEPS 1, 2, 3, 4)
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/lenses - All 4-step lens tiers & Step 2 prescription methods
router.get('/lenses', async (req, res) => {
  try {
    const [usages, prescription_options, thicknesses, coatings] = await Promise.all([
      db.all('SELECT * FROM lens_usages ORDER BY display_order ASC, id ASC'),
      db.all('SELECT * FROM lens_prescription_options ORDER BY display_order ASC, id ASC'),
      db.all('SELECT * FROM lens_thicknesses ORDER BY index_rating ASC, id ASC'),
      db.all('SELECT * FROM lens_coatings ORDER BY display_order ASC, id ASC')
    ]);
    res.json({ success: true, usages, prescription_options, thicknesses, coatings });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Step 1: Lens Usages (Create, Update, Delete)
router.post('/lenses/usages', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const { name, slug, description = '', base_price_inr = 0, display_order = 0, is_active = 1 } = req.body;
    if (!name || Number(base_price_inr) < 0 || Number.isNaN(Number(base_price_inr))) {
      return res.status(400).json({ success: false, message: 'Valid name and non-negative base price are required.' });
    }
    const cleanSlug = (slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const result = await db.run(
      'INSERT INTO lens_usages (name, slug, description, base_price_inr, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), cleanSlug, description, Number(base_price_inr), Number(display_order), is_active ? 1 : 0]
    );
    await logAudit(req, 'CREATE_LENS_USAGE', 'lens_usages', result.lastID, { name, base_price_inr });
    res.status(201).json({ success: true, message: 'Lens usage created.', id: result.lastID });
  } catch (err) {
    res.status(err.message && err.message.includes('UNIQUE') ? 409 : 500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

router.put('/lenses/usages/:id', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, base_price_inr, is_active } = req.body;
    if (base_price_inr !== undefined && (Number.isNaN(Number(base_price_inr)) || Number(base_price_inr) < 0)) {
      return res.status(400).json({ success: false, message: 'Price must be non-negative.' });
    }

    const result = await db.run(
      `UPDATE lens_usages SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         base_price_inr = COALESCE(?, base_price_inr),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, description, base_price_inr !== undefined ? Number(base_price_inr) : null, is_active !== undefined ? Number(is_active) : null, id]
    );
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Lens usage not found.' });

    await logAudit(req, 'UPDATE_LENS_USAGE', 'lens_usages', id, { name, base_price_inr, is_active });
    res.json({ success: true, message: 'Lens usage option updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Step 2: Prescription Configuration Options (Update fee, clinical bounds, status)
router.put('/lenses/prescription-options/:id', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, fee_inr, sph_min, sph_max, cyl_min, cyl_max, pd_min, pd_max, is_active } = req.body;
    if (fee_inr !== undefined && (Number.isNaN(Number(fee_inr)) || Number(fee_inr) < 0)) {
      return res.status(400).json({ success: false, message: 'Verification fee must be non-negative.' });
    }

    const result = await db.run(
      `UPDATE lens_prescription_options SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         fee_inr = COALESCE(?, fee_inr),
         sph_min = COALESCE(?, sph_min),
         sph_max = COALESCE(?, sph_max),
         cyl_min = COALESCE(?, cyl_min),
         cyl_max = COALESCE(?, cyl_max),
         pd_min = COALESCE(?, pd_min),
         pd_max = COALESCE(?, pd_max),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        name, description,
        fee_inr !== undefined ? Number(fee_inr) : null,
        sph_min !== undefined ? Number(sph_min) : null,
        sph_max !== undefined ? Number(sph_max) : null,
        cyl_min !== undefined ? Number(cyl_min) : null,
        cyl_max !== undefined ? Number(cyl_max) : null,
        pd_min !== undefined ? Number(pd_min) : null,
        pd_max !== undefined ? Number(pd_max) : null,
        is_active !== undefined ? Number(is_active) : null,
        id
      ]
    );
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Prescription option not found.' });

    await logAudit(req, 'UPDATE_LENS_PRESCRIPTION_OPTION', 'lens_prescription_options', id, { name, fee_inr, is_active });
    res.json({ success: true, message: 'Step 2 prescription configuration updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Step 3: Lens Thicknesses (Create & Update)
router.post('/lenses/thicknesses', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const { usage_id = 1, name, index_rating, description = '', price_inr = 0, recommended_sph_range = '', display_order = 0, is_active = 1 } = req.body;
    if (!name || !index_rating || Number(price_inr) < 0 || Number.isNaN(Number(price_inr))) {
      return res.status(400).json({ success: false, message: 'Name, index_rating, and non-negative price are required.' });
    }
    const result = await db.run(
      `INSERT INTO lens_thicknesses (usage_id, name, index_rating, description, price_inr, recommended_sph_range, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(usage_id), name.trim(), Number(index_rating), description, Number(price_inr), recommended_sph_range, Number(display_order), is_active ? 1 : 0]
    );
    await logAudit(req, 'CREATE_LENS_THICKNESS', 'lens_thicknesses', result.lastID, { name, index_rating, price_inr });
    res.status(201).json({ success: true, message: 'Lens thickness option created.', id: result.lastID });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

router.put('/lenses/thicknesses/:id', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, price_inr, description, index_rating, recommended_sph_range, recommendation_sph, is_active } = req.body;
    const sphGuidance = recommended_sph_range !== undefined ? recommended_sph_range : recommendation_sph;
    if (price_inr !== undefined && (Number.isNaN(Number(price_inr)) || Number(price_inr) < 0)) {
      return res.status(400).json({ success: false, message: 'Price must be non-negative.' });
    }

    const result = await db.run(
      `UPDATE lens_thicknesses SET
         name = COALESCE(?, name),
         index_rating = COALESCE(?, index_rating),
         price_inr = COALESCE(?, price_inr),
         description = COALESCE(?, description),
         recommended_sph_range = COALESCE(?, recommended_sph_range),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, index_rating !== undefined ? Number(index_rating) : null, price_inr !== undefined ? Number(price_inr) : null, description, sphGuidance, is_active !== undefined ? Number(is_active) : null, id]
    );
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Lens thickness not found.' });

    await logAudit(req, 'UPDATE_LENS_THICKNESS', 'lens_thicknesses', id, { name, price_inr, is_active });
    res.json({ success: true, message: 'Lens thickness index updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// Step 4: Lens Coatings (Create & Update)
router.post('/lenses/coatings', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const { name, slug, description = '', price_inr = 0, display_order = 0, is_active = 1 } = req.body;
    if (!name || Number(price_inr) < 0 || Number.isNaN(Number(price_inr))) {
      return res.status(400).json({ success: false, message: 'Name and non-negative price are required.' });
    }
    const cleanSlug = (slug || name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const result = await db.run(
      'INSERT INTO lens_coatings (name, slug, description, price_inr, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), cleanSlug, description, Number(price_inr), Number(display_order), is_active ? 1 : 0]
    );
    await logAudit(req, 'CREATE_LENS_COATING', 'lens_coatings', result.lastID, { name, price_inr });
    res.status(201).json({ success: true, message: 'Lens coating created.', id: result.lastID });
  } catch (err) {
    res.status(err.message && err.message.includes('UNIQUE') ? 409 : 500).json({ success: false, message: err.message || 'Internal Server Error' });
  }
});

router.put('/lenses/coatings/:id', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, price_inr, description, is_active } = req.body;
    if (price_inr !== undefined && (Number.isNaN(Number(price_inr)) || Number(price_inr) < 0)) {
      return res.status(400).json({ success: false, message: 'Price must be non-negative.' });
    }

    const result = await db.run(
      `UPDATE lens_coatings SET
         name = COALESCE(?, name),
         price_inr = COALESCE(?, price_inr),
         description = COALESCE(?, description),
         is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [name, price_inr !== undefined ? Number(price_inr) : null, description, is_active !== undefined ? Number(is_active) : null, id]
    );
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Lens coating not found.' });

    await logAudit(req, 'UPDATE_LENS_COATING', 'lens_coatings', id, { name, price_inr, is_active });
    res.json({ success: true, message: 'Lens coating updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 8. ORDERS & PRESCRIPTION MANAGEMENT
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/orders - Search & Filter Orders
router.get('/orders', async (req, res) => {
  try {
    const { search, order_status, payment_status, date } = req.query;
    let conditions = [];
    let params = [];

    if (search && search.trim()) {
      conditions.push('(order_number LIKE ? OR customer_name LIKE ? OR customer_phone LIKE ?)');
      params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
    }
    if (order_status) {
      conditions.push('order_status = ?');
      params.push(order_status);
    }
    if (payment_status) {
      conditions.push('payment_status = ?');
      params.push(payment_status);
    }
    if (date) {
      conditions.push("DATE(created_at) = DATE(?)");
      params.push(date);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM orders ${whereClause} ORDER BY created_at DESC`;
    const orders = await db.all(sql, params);

    const parsed = orders.map(o => {
      try { o.items = JSON.parse(o.items_json); } catch (_) { o.items = []; }
      return o;
    });

    res.json({ success: true, count: parsed.length, orders: parsed });
  } catch (err) {
    console.error('List Orders Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/admin/orders/:orderNumber - Order Detail
router.get('/orders/:orderNumber', async (req, res) => {
  try {
    const orderNumber = req.params.orderNumber.trim();
    const order = await db.get('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    try { order.items = JSON.parse(order.items_json); } catch (_) { order.items = []; }

    // If prescription data attached, parse
    if (order.prescription_data) {
      try { order.prescription_data = JSON.parse(order.prescription_data); } catch (_) {}
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PATCH /api/admin/orders/:orderNumber/status - Order Lifecycle State Transition
router.patch('/orders/:orderNumber/status', async (req, res) => {
  try {
    const orderNumber = req.params.orderNumber.trim();
    const { order_status, tracking_number } = req.body;

    const validStatuses = ['placed', 'processing', 'lab_glazing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(order_status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: [${validStatuses.join(', ')}]` });
    }

    const order = await db.get('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    // Inventory Restoration & Refund on Order Cancellation (Atomic & Duplicate-Safe)
    if (order_status === 'cancelled') {
      const cancelUpdate = await db.run(
        `UPDATE orders SET
           order_status = 'cancelled',
           payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END,
           refund_amount_inr = CASE WHEN payment_status = 'paid' THEN total_amount_inr ELSE refund_amount_inr END,
           refund_reason = CASE WHEN payment_status = 'paid' THEN 'Order cancelled by customer care' ELSE refund_reason END,
           tracking_number = COALESCE(?, tracking_number),
           updated_at = CURRENT_TIMESTAMP
         WHERE order_number = ? AND order_status != 'cancelled'`,
        [tracking_number || null, orderNumber]
      );
      if (cancelUpdate.changes > 0) {
        try {
          const items = JSON.parse(order.items_json);
          for (const it of items) {
            const qty = Math.max(1, Number(it.quantity) || 1);
            if (it.variant_id) {
              await db.run('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [qty, it.variant_id]);
              await db.run(
                `INSERT INTO inventory_movements (variant_id, product_id, user_id, username, change_quantity, previous_quantity, new_quantity, movement_type, reason)
                 VALUES (?, ?, ?, ?, ?, 0, 0, 'order_cancellation', ?)`,
                [it.variant_id, it.product_id || 1, req.user ? req.user.id : 0, req.user ? req.user.username : 'Staff', qty, `Restocked from cancelled order ${orderNumber}`]
              );
            }
          }
        } catch (e) {
          console.error('Cancellation Restock Error:', e);
        }
      }
    } else {
      await db.run(
        `UPDATE orders SET
           order_status = ?,
           tracking_number = COALESCE(?, tracking_number),
           updated_at = CURRENT_TIMESTAMP
         WHERE order_number = ?`,
        [order_status, tracking_number || null, orderNumber]
      );
    }

    await logAudit(req, 'UPDATE_ORDER_STATUS', 'orders', order.id, {
      order_number: orderNumber,
      previous_status: order.order_status,
      new_status: order_status,
      tracking_number
    });

    res.json({ success: true, message: `Order ${orderNumber} transitioned to ${order_status}.` });
  } catch (err) {
    console.error('Update Order Status Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PATCH /api/admin/orders/:orderNumber/payment - Dedicated Payment Lifecycle & Transition Controls
router.patch('/orders/:orderNumber/payment', async (req, res) => {
  try {
    const orderNumber = req.params.orderNumber.trim();
    const { action, amount_inr, reason, transaction_ref, gateway } = req.body;

    const validActions = ['capture', 'refund', 'mark_paid', 'mark_failed'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PAYMENT_ACTION',
        message: `Invalid action. Must be one of: [${validActions.join(', ')}]`
      });
    }

    const order = await db.get('SELECT * FROM orders WHERE order_number = ?', [orderNumber]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });

    // Transition Guard 1: Cannot capture or mark paid if order is cancelled
    if ((action === 'capture' || action === 'mark_paid') && order.order_status === 'cancelled') {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PAYMENT_TRANSITION',
        message: 'Cannot process payment capture for a cancelled order.'
      });
    }

    // Transition Guard 2: Cannot capture if already paid (Duplicate capture protection)
    if ((action === 'capture' || action === 'mark_paid') && order.payment_status === 'paid') {
      return res.status(400).json({
        success: false,
        error_code: 'PAYMENT_ALREADY_CAPTURED',
        message: 'Payment has already been captured for this order.'
      });
    }

    // Transition Guard 3: Cannot mark paid if already refunded
    if ((action === 'capture' || action === 'mark_paid') && order.payment_status === 'refunded') {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_PAYMENT_TRANSITION',
        message: 'Cannot mark an already refunded order as paid.'
      });
    }

    // Transition Guard 4: Cannot refund an already fully refunded order
    if (action === 'refund' && order.payment_status === 'refunded') {
      return res.status(400).json({
        success: false,
        error_code: 'PAYMENT_ALREADY_REFUNDED',
        message: 'Order has already been fully refunded.'
      });
    }

    // Transition Guard 5: Cannot refund an unpaid or failed order
    if (action === 'refund' && order.payment_status !== 'paid' && order.payment_status !== 'partially_refunded') {
      return res.status(400).json({
        success: false,
        error_code: 'CANNOT_REFUND_UNPAID_ORDER',
        message: `Cannot refund order with payment status '${order.payment_status}'. Only paid orders can be refunded.`
      });
    }

    if (action === 'capture' || action === 'mark_paid') {
      const isSimulated = (config && config.PAYMENT_MODE === 'live') ? 0 : 1;
      await db.run(
        `UPDATE orders SET
           payment_status = 'paid',
           payment_gateway_ref = COALESCE(?, payment_gateway_ref),
           payment_gateway_name = COALESCE(?, payment_gateway_name),
           is_simulated_payment = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE order_number = ?`,
        [transaction_ref || null, gateway || null, isSimulated, orderNumber]
      );

      await logAudit(req, 'PAYMENT_CAPTURED', 'orders', order.id, {
        order_number: orderNumber,
        previous_payment_status: order.payment_status,
        new_payment_status: 'paid',
        transaction_ref,
        gateway
      });

      return res.json({
        success: true,
        message: `Order #${orderNumber} payment marked as paid.`,
        payment_status: 'paid',
        is_simulated_payment: isSimulated === 1
      });
    }

    if (action === 'refund') {
      const refundAmount = amount_inr ? Number(amount_inr) : order.total_amount_inr;
      const isFullRefund = refundAmount >= order.total_amount_inr;
      const newStatus = isFullRefund ? 'refunded' : 'partially_refunded';

      await db.run(
        `UPDATE orders SET
           payment_status = ?,
           refund_amount_inr = COALESCE(refund_amount_inr, 0) + ?,
           refund_reason = ?,
           refund_gateway_ref = COALESCE(?, refund_gateway_ref),
           updated_at = CURRENT_TIMESTAMP
         WHERE order_number = ?`,
        [newStatus, refundAmount, reason || 'Administrative refund initiated from atelier', transaction_ref || null, orderNumber]
      );

      await logAudit(req, 'PAYMENT_REFUNDED', 'orders', order.id, {
        order_number: orderNumber,
        refund_amount_inr: refundAmount,
        reason: reason || 'Administrative refund',
        new_payment_status: newStatus
      });

      return res.json({
        success: true,
        message: `Successfully processed refund of ₹${refundAmount.toLocaleString('en-IN')} for order #${orderNumber}.`,
        payment_status: newStatus,
        refund_amount_inr: refundAmount
      });
    }

    if (action === 'mark_failed') {
      await db.run(
        "UPDATE orders SET payment_status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE order_number = ?",
        [orderNumber]
      );
      await logAudit(req, 'PAYMENT_MARKED_FAILED', 'orders', order.id, { order_number: orderNumber });
      return res.json({ success: true, message: `Order #${orderNumber} payment marked as failed.` });
    }
  } catch (err) {
    console.error('Update Payment Status Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 9. APPOINTMENT QUEUE & CLINICAL CONSULTATIONS
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/appointments - List Appointments with Filters
router.get('/appointments', async (req, res) => {
  try {
    const { date, status, store_id, scope } = req.query;
    const conditions = [];
    const params = [];

    if (scope === 'today') {
      conditions.push("a.appointment_date = DATE('now')");
    } else if (scope === 'upcoming') {
      conditions.push("a.appointment_date >= DATE('now') AND a.status != 'cancelled'");
    }
    if (date) {
      conditions.push('a.appointment_date = ?');
      params.push(date);
    }
    if (status) {
      conditions.push('a.status = ?');
      params.push(status);
    }
    if (store_id) {
      conditions.push('a.store_id = ?');
      params.push(Number(store_id));
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT a.*, s.name as store_name, s.address as store_address
      FROM appointments a
      JOIN stores s ON s.id = a.store_id
      ${whereClause}
      ORDER BY a.appointment_date ASC, a.start_time ASC
    `;
    const appointments = await db.all(sql, params);
    res.json({ success: true, count: appointments.length, appointments });
  } catch (err) {
    console.error('List Appointments Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PATCH /api/admin/appointments/:id/reschedule - Reschedule Appointment with Collision Prevention
router.patch('/appointments/:id/reschedule', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { appointment_date, start_time } = req.body;

    if (!appointment_date || !start_time) {
      return res.status(400).json({ success: false, message: 'New appointment_date and start_time are required.' });
    }

    const appt = await db.get('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });

    // Calculate end time (+30 min)
    const [h, m] = start_time.split(':').map(Number);
    const totalMins = h * 60 + m + 30;
    const calculatedEndTime = `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;

    try {
      await db.run(
        `UPDATE appointments SET
           appointment_date = ?,
           start_time = ?,
           end_time = ?,
           status = 'confirmed'
         WHERE id = ?`,
        [appointment_date, start_time, calculatedEndTime, id]
      );

      await logAudit(req, 'RESCHEDULE_APPOINTMENT', 'appointments', id, {
        appointment_number: appt.appointment_number,
        old_date: appt.appointment_date,
        new_date: appointment_date,
        new_time: start_time
      });

      res.json({ success: true, message: `Appointment ${appt.appointment_number} rescheduled to ${appointment_date} at ${start_time}.` });
    } catch (insertErr) {
      if (insertErr.message && (insertErr.message.includes('UNIQUE constraint failed') || insertErr.message.includes('idx_unique_appointment_slot'))) {
        return res.status(409).json({
          success: false,
          code: 'SLOT_ALREADY_BOOKED',
          error_code: 'SLOT_ALREADY_BOOKED',
          message: 'The selected slot on this date is already booked. Please choose another available slot.'
        });
      }
      throw insertErr;
    }
  } catch (err) {
    console.error('Reschedule Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PATCH /api/admin/appointments/:id/status - Update Status or Consultation Notes
router.patch('/appointments/:id/status', requireRole('admin', 'optometrist'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: [${validStatuses.join(', ')}]` });
    }

    const appt = await db.get('SELECT * FROM appointments WHERE id = ?', [id]);
    if (!appt) return res.status(404).json({ success: false, message: 'Appointment not found.' });

    await db.run(
      `UPDATE appointments SET
         status = COALESCE(?, status),
         notes = COALESCE(?, notes)
       WHERE id = ?`,
      [status || null, notes !== undefined ? notes : null, id]
    );

    await logAudit(req, 'UPDATE_APPOINTMENT_STATUS', 'appointments', id, { status, notes });
    res.json({ success: true, message: 'Appointment updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 10. CUSTOMER ENQUIRIES & WHATSAPP LEADS
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/enquiries - List Enquiries
router.get('/enquiries', async (req, res) => {
  try {
    const enquiries = await db.all('SELECT * FROM customer_enquiries ORDER BY created_at DESC');
    res.json({ success: true, count: enquiries.length, enquiries });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PATCH /api/admin/enquiries/:id/status - Update Enquiry Status
router.patch('/enquiries/:id/status', requireRole('admin', 'staff', 'optometrist'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const valid = ['new', 'in_progress', 'converted', 'closed'];
    if (!valid.includes(status)) return res.status(400).json({ success: false, message: `Invalid status. [${valid.join(', ')}]` });

    await db.run('UPDATE customer_enquiries SET status = ? WHERE id = ?', [status, id]);
    await logAudit(req, 'UPDATE_ENQUIRY_STATUS', 'customer_enquiries', id, { status });
    res.json({ success: true, message: 'Enquiry status updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 11. SITE SETTINGS, LOGO BRANDING & OPERATING HOURS
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/settings - Read Store Identity, Hours & Site Settings
router.get('/settings', async (req, res) => {
  try {
    const data = await getPublicStoreSettings();
    res.json({
      success: true,
      settings: data.rawSettingsList,
      settingsMap: data.settings,
      store: data.store,
      hours: data.hours
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PUT /api/admin/settings - Update Store Identity, Contact, Hours & Announcement (Admin Only)
router.put('/settings', requireRole('admin'), validateBody(clinicSettingsSchema), async (req, res) => {
  try {
    const {
      name, address, city, phone, whatsapp_number, email,
      description, map_url, instagram_url, facebook_url,
      announcement_text, slot_interval_minutes, hours
    } = req.body;

    const existingStore = await db.get('SELECT * FROM stores WHERE id = 1');
    const cleanWhatsapp = (whatsapp_number !== undefined && whatsapp_number !== null && whatsapp_number !== '')
      ? whatsapp_number.trim()
      : (existingStore?.whatsapp_number || phone.trim());

    await db.transaction(async () => {
      await db.run(
        `UPDATE stores SET
           name = ?,
           address = ?,
           city = COALESCE(?, city),
           phone = ?,
           whatsapp_number = ?,
           email = ?,
           description = ?,
           map_url = ?,
           instagram_url = ?,
           facebook_url = ?,
           slot_interval_minutes = COALESCE(?, slot_interval_minutes)
         WHERE id = 1`,
        [
          name.trim(),
          address.trim(),
          city !== undefined && city !== '' ? city.trim() : null,
          phone.trim(),
          cleanWhatsapp,
          email !== undefined ? (email || null) : (existingStore?.email || null),
          description !== undefined ? (description || null) : (existingStore?.description || null),
          map_url !== undefined ? (map_url || null) : (existingStore?.map_url || null),
          instagram_url !== undefined ? (instagram_url || null) : (existingStore?.instagram_url || null),
          facebook_url !== undefined ? (facebook_url || null) : (existingStore?.facebook_url || null),
          slot_interval_minutes !== undefined ? Number(slot_interval_minutes) : null
        ]
      );

      await db.run(
        `INSERT OR REPLACE INTO site_settings (key, value, description, updated_at)
         VALUES ('store_name', ?, 'Brand trading name', CURRENT_TIMESTAMP)`,
        [name.trim()]
      );
      await db.run(
        `INSERT OR REPLACE INTO site_settings (key, value, description, updated_at)
         VALUES ('whatsapp_number', ?, 'Store WhatsApp business number', CURRENT_TIMESTAMP)`,
        [cleanWhatsapp]
      );
      if (announcement_text !== undefined) {
        await db.run(
          `INSERT OR REPLACE INTO site_settings (key, value, description, updated_at)
           VALUES ('announcement_text', ?, 'Header announcement message', CURRENT_TIMESTAMP)`,
          [String(announcement_text || '').trim()]
        );
      }

      if (Array.isArray(hours) && hours.length > 0) {
        for (const h of hours) {
          const existingDay = await db.get('SELECT id FROM store_hours WHERE store_id = 1 AND day_of_week = ?', [Number(h.day_of_week)]);
          if (existingDay) {
            await db.run(
              'UPDATE store_hours SET open_time = ?, close_time = ?, is_closed = ? WHERE id = ?',
              [h.open_time, h.close_time, h.is_closed ? 1 : 0, existingDay.id]
            );
          } else {
            await db.run(
              'INSERT INTO store_hours (store_id, day_of_week, open_time, close_time, is_closed) VALUES (1, ?, ?, ?, ?)',
              [Number(h.day_of_week), h.open_time, h.close_time, h.is_closed ? 1 : 0]
            );
          }
        }
      }
    });

    const updated = await getPublicStoreSettings();
    await logAudit(req, 'UPDATE_CLINIC_SETTINGS', 'stores', 1, { name, address, phone, whatsapp_number: cleanWhatsapp });
    res.json({
      success: true,
      message: 'Store settings and branding saved successfully.',
      store: updated.store,
      hours: updated.hours,
      settingsMap: updated.settings
    });
  } catch (err) {
    console.error('Update Clinic Settings Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// POST /api/admin/settings/logo - Upload & Optimize Store Logo (Admin Only)
router.post(
  '/settings/logo',
  requireRole('admin'),
  handleImageUploadMiddleware(uploadMemory.single('logo')),
  async (req, res) => {
    let stored = null;
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Logo image file is required (JPEG, PNG, WebP).' });
      }
      const existing = await db.get('SELECT logo_url FROM stores WHERE id = 1');
      stored = await processAndStorePublicImage(req.file, { subdir: 'branding', prefix: 'store_logo', maxWidth: 600 });
      const newUrl = `/${stored.imageUrl}`;
      await db.run('UPDATE stores SET logo_url = ? WHERE id = 1', [newUrl]);
      if (existing?.logo_url && existing.logo_url.startsWith('/images/branding/')) {
        safeUnlink(resolveSafePublicPath(existing.logo_url));
      }
      await logAudit(req, 'UPLOAD_STORE_LOGO', 'stores', 1, { logo_url: newUrl });
      res.json({ success: true, message: 'Store logo uploaded successfully.', logo_url: newUrl });
    } catch (err) {
      if (stored?.diskPath) safeUnlink(stored.diskPath);
      const status = err.message && (err.message.includes('Invalid') || err.message.includes('Unsupported')) ? 400 : 500;
      res.status(status).json({ success: false, message: err.message || 'Store logo upload failed.' });
    }
  }
);

// DELETE /api/admin/settings/logo - Remove Store Logo (Admin Only)
router.delete('/settings/logo', requireRole('admin'), async (req, res) => {
  try {
    const existing = await db.get('SELECT logo_url FROM stores WHERE id = 1');
    if (existing?.logo_url && existing.logo_url.startsWith('/images/branding/')) {
      safeUnlink(resolveSafePublicPath(existing.logo_url));
    }
    await db.run('UPDATE stores SET logo_url = NULL WHERE id = 1');
    await logAudit(req, 'REMOVE_STORE_LOGO', 'stores', 1, {});
    res.json({ success: true, message: 'Store logo removed. Storefront will display the text wordmark.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// PUT /api/admin/settings/:key - Update Site Setting (Admin Only)
router.put('/settings/:key', requireRole('admin'), async (req, res) => {
  try {
    const key = req.params.key;
    const { value, description } = req.body;
    if (value === undefined) return res.status(400).json({ success: false, message: 'value is required.' });

    await db.run(
      `INSERT OR REPLACE INTO site_settings (key, value, description, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [key, String(value), description || null]
    );

    await logAudit(req, 'UPDATE_SETTING', 'site_settings', key, { value });
    res.json({ success: true, message: `Setting ${key} updated successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ═════════════════════════════════════════════════════════════════════
// 12. AUDIT LOGS INSPECTION (ADMIN ONLY)
// ═════════════════════════════════════════════════════════════════════

// GET /api/admin/audit-logs - Administrative Activity Trail
router.get('/audit-logs', requireRole('admin'), async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = await db.all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?', [Number(limit)]);
    res.json({ success: true, count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
