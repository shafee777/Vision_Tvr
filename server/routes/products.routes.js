const express = require('express');
const router = express.Router();
const db = require('../db/database');

// GET /api/products - List products with faceted filters (Ace & Tate style)
router.get('/', async (req, res) => {
  try {
    const {
      category,
      shape,
      brand,
      gender,
      fit,
      material,
      color,
      min_price,
      max_price,
      search,
      sort,
      limit = 40,
      offset = 0
    } = req.query;

    let conditions = ['p.is_active = 1'];
    let params = [];

    if (category) {
      conditions.push('(c.slug = ? OR c.category_type = ?)');
      params.push(category, category);
    }
    if (shape) {
      conditions.push('s.slug = ?');
      params.push(shape);
    }
    if (brand) {
      conditions.push('b.slug = ?');
      params.push(brand);
    }
    if (gender && gender !== 'all') {
      conditions.push('(p.gender = ? OR p.gender = "unisex")');
      params.push(gender);
    }
    if (fit) {
      conditions.push('p.frame_fit = ?');
      params.push(fit);
    }
    if (material) {
      conditions.push('p.material LIKE ?');
      params.push(`%${material}%`);
    }
    if (min_price) {
      conditions.push('p.base_price_inr >= ?');
      params.push(Number(min_price));
    }
    if (max_price) {
      conditions.push('p.base_price_inr <= ?');
      params.push(Number(max_price));
    }
    if (search) {
      conditions.push('(p.name LIKE ? OR p.description LIKE ? OR b.name LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (color) {
      conditions.push(`EXISTS (
        SELECT 1 FROM product_variants v_sub 
        WHERE v_sub.product_id = p.id AND v_sub.is_active = 1 AND v_sub.color_name LIKE ?
      )`);
      params.push(`%${color}%`);
    }

    let orderBy = 'p.is_featured DESC, p.id DESC';
    if (sort === 'price_asc') orderBy = 'p.base_price_inr ASC';
    else if (sort === 'price_desc') orderBy = 'p.base_price_inr DESC';
    else if (sort === 'name_asc') orderBy = 'p.name ASC';
    else if (sort === 'name_desc') orderBy = 'p.name DESC';
    else if (sort === 'newest') orderBy = 'p.created_at DESC';

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(DISTINCT p.id) as total
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      JOIN frame_shapes s ON s.id = p.shape_id
      JOIN categories c ON c.id = p.category_id
      ${whereClause}
    `;
    const countRow = await db.get(countSql, params);
    const totalCount = countRow ? countRow.total : 0;

    const sql = `
      SELECT p.id, p.name, p.slug, p.sku, p.description, p.base_price_inr,
             p.gender, p.material, p.frame_fit,
             p.lens_width_mm, p.bridge_width_mm, p.temple_length_mm,
             p.frame_height_mm, p.total_width_mm, p.is_featured,
             b.name as brand_name, b.slug as brand_slug,
             s.name as shape_name, s.slug as shape_slug, s.icon_svg as shape_icon,
             c.name as category_name, c.slug as category_slug
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      JOIN frame_shapes s ON s.id = p.shape_id
      JOIN categories c ON c.id = p.category_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const productRows = await db.all(sql, [...params, Number(limit), Number(offset)]);

    // Fetch variants and images for all returned products
    const productIds = productRows.map(p => p.id);
    let variantsByProduct = {};

    if (productIds.length > 0) {
      const placeholders = productIds.map(() => '?').join(',');
      const variantsSql = `
        SELECT v.id, v.product_id, v.color_name, v.color_hex, v.color_secondary_hex,
               v.sku, v.price_override_inr, v.stock_quantity, v.is_default
        FROM product_variants v
        WHERE v.product_id IN (${placeholders}) AND v.is_active = 1
        ORDER BY v.is_default DESC, v.id ASC
      `;
      const variants = await db.all(variantsSql, productIds);

      const variantIds = variants.map(v => v.id);
      let imagesByVariant = {};

      if (variantIds.length > 0) {
        const vPlaceholders = variantIds.map(() => '?').join(',');
        const imagesSql = `
          SELECT img.id, img.variant_id, img.image_type, img.image_url, img.alt_text, img.display_order
          FROM product_images img
          WHERE img.variant_id IN (${vPlaceholders})
          ORDER BY img.display_order ASC
        `;
        const images = await db.all(imagesSql, variantIds);
        for (const img of images) {
          if (!imagesByVariant[img.variant_id]) imagesByVariant[img.variant_id] = [];
          imagesByVariant[img.variant_id].push(img);
        }
      }

      for (const v of variants) {
        v.images = imagesByVariant[v.id] || [];
        // Primary and secondary photo assignment for instant hover swap
        const studio = v.images.find(i => i.image_type === 'studio_front');
        const model = v.images.find(i => i.image_type === 'model_on_face');
        v.primary_image = studio ? studio.image_url : (v.images[0] ? v.images[0].image_url : '');
        v.hover_image = model ? model.image_url : v.primary_image;

        if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
        variantsByProduct[v.product_id].push(v);
      }
    }

    const items = productRows.map(p => {
      const vars = variantsByProduct[p.id] || [];
      const defaultVar = vars.find(v => v.is_default) || vars[0] || null;
      return {
        ...p,
        variants: vars,
        default_variant: defaultVar,
        display_price_inr: defaultVar && defaultVar.price_override_inr ? defaultVar.price_override_inr : p.base_price_inr
      };
    });

    res.json({
      success: true,
      total: totalCount,
      count: items.length,
      limit: Number(limit),
      offset: Number(offset),
      products: items
    });
  } catch (err) {
    console.error('Products List Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// GET /api/products/:slug - Product Detail Page (PDP) payload
router.get('/:slug', async (req, res) => {
  try {
    const slug = req.params.slug;
    const sql = `
      SELECT p.*,
             b.name as brand_name, b.slug as brand_slug, b.description as brand_desc,
             s.name as shape_name, s.slug as shape_slug, s.icon_svg as shape_icon,
             c.name as category_name, c.slug as category_slug
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      JOIN frame_shapes s ON s.id = p.shape_id
      JOIN categories c ON c.id = p.category_id
      WHERE (p.slug = ? OR p.id = ?) AND p.is_active = 1
    `;
    const product = await db.get(sql, [slug, Number(slug) || 0]);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    // Fetch all variants with images
    const variants = await db.all(
      `SELECT v.* FROM product_variants v WHERE v.product_id = ? AND v.is_active = 1 ORDER BY v.is_default DESC, v.id ASC`,
      [product.id]
    );

    for (const v of variants) {
      v.images = await db.all(
        `SELECT * FROM product_images WHERE variant_id = ? ORDER BY display_order ASC`,
        [v.id]
      );
      const studio = v.images.find(i => i.image_type === 'studio_front');
      const model = v.images.find(i => i.image_type === 'model_on_face');
      v.primary_image = studio ? studio.image_url : (v.images[0] ? v.images[0].image_url : '');
      v.hover_image = model ? model.image_url : v.primary_image;
    }

    product.variants = variants;
    product.dimensions = {
      lens_width_mm: product.lens_width_mm,
      bridge_width_mm: product.bridge_width_mm,
      temple_length_mm: product.temple_length_mm,
      frame_height_mm: product.frame_height_mm,
      total_width_mm: product.total_width_mm,
      frame_fit: product.frame_fit,
      display_string: `${product.lens_width_mm}-${product.bridge_width_mm}-${product.temple_length_mm} mm`
    };

    // Fetch related products from atelier
    const relatedSql = `
      SELECT p.id, p.name, p.slug, p.base_price_inr, p.lens_width_mm, p.bridge_width_mm, p.temple_length_mm,
             b.name as brand_name, s.name as shape_name
      FROM products p
      JOIN brands b ON b.id = p.brand_id
      JOIN frame_shapes s ON s.id = p.shape_id
      WHERE p.id != ? AND (p.category_id = ? OR p.shape_id = ?) AND p.is_active = 1
      ORDER BY p.is_featured DESC, p.id DESC
      LIMIT 4
    `;
    const relatedProducts = await db.all(relatedSql, [product.id, product.category_id, product.shape_id]);

    for (const rel of relatedProducts) {
      const relVars = await db.all(
        'SELECT v.id, v.color_name, v.color_hex, v.sku FROM product_variants v WHERE v.product_id = ? AND v.is_active = 1',
        [rel.id]
      );
      rel.variants = relVars;
      const relImg = await db.get(
        'SELECT image_url FROM product_images WHERE variant_id = ? AND image_type = "studio_front" LIMIT 1',
        [relVars[0] ? relVars[0].id : 0]
      );
      rel.primary_image = relImg ? relImg.image_url : 'images/tortoise_round_front.jpg';
    }
    product.related_products = relatedProducts;

    res.json({ success: true, product });
  } catch (err) {
    console.error('Product Detail Error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

module.exports = router;
