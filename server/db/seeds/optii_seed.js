const bcrypt = require('bcryptjs');
require('dotenv').config();
const db = require('../database');

async function seedOptii() {
  console.log('[Optii Seeder] Starting fresh seed process for Optii...');
  await db.run('PRAGMA foreign_keys = OFF;');

  // 1. Seed Admin User (password sourced from ADMIN_SEED_PASSWORD env var)
  const adminPassword = process.env.ADMIN_SEED_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_SEED_PASSWORD environment variable must be set before seeding.');
  }
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(adminPassword, salt);
  await db.run(
    `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role) 
     VALUES (1, 'admin', ?, 'Optii Head Optometrist', 'admin')`,
    [passwordHash]
  );
  console.log('  ✓ Seeded admin user: admin (password from ADMIN_SEED_PASSWORD)');

  // 2. Seed Brands
  const brands = [
    { id: 1, name: 'Optii Atelier', slug: 'optii-atelier', description: 'Bespoke European handcrafted eyewear frames.', logo_url: '/images/Vison Logo.png' },
    { id: 2, name: 'Ray-Ban Optics', slug: 'ray-ban-optics', description: 'Timeless optical silhouettes and icons.', logo_url: '' },
    { id: 3, name: 'Gucci Eyewear', slug: 'gucci-eyewear', description: 'Italian luxury statement frames.', logo_url: '' },
    { id: 4, name: 'Zeiss Vision', slug: 'zeiss-vision', description: 'Precision German engineering and lens technology.', logo_url: '' },
    { id: 5, name: 'Essilor Eyezen', slug: 'essilor-eyezen', description: 'Digital screen protection and blue filter optics.', logo_url: '' },
    { id: 6, name: 'Silhouette Atelier', slug: 'silhouette-atelier', description: 'Austrian featherlight rimless frames.', logo_url: '' }
  ];

  for (const b of brands) {
    await db.run(
      `INSERT OR REPLACE INTO brands (id, name, slug, description, logo_url, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [b.id, b.name, b.slug, b.description, b.logo_url]
    );
  }
  console.log(`  ✓ Seeded ${brands.length} optical brands`);

  // 3. Seed Frame Shapes (Powers Ace & Tate Filter Drawer)
  const shapes = [
    {
      id: 1, name: 'Round', slug: 'round', display_order: 1,
      icon_svg: `<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="14" cy="12" r="8"/><circle cx="34" cy="12" r="8"/><line x1="22" y1="12" x2="26" y2="12"/></svg>`
    },
    {
      id: 2, name: 'Square', slug: 'square', display_order: 2,
      icon_svg: `<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="5" width="16" height="14" rx="2"/><rect x="26" y="5" width="16" height="14" rx="2"/><line x1="22" y1="12" x2="26" y2="12"/></svg>`
    },
    {
      id: 3, name: 'Aviator', slug: 'aviator', display_order: 3,
      icon_svg: `<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 6 C12 6, 21 8, 20 16 C19 19, 13 20, 8 18 Z"/><path d="M41 6 C36 6, 27 8, 28 16 C29 19, 35 20, 40 18 Z"/><line x1="20" y1="9" x2="28" y2="9"/><line x1="20" y1="13" x2="28" y2="13"/></svg>`
    },
    {
      id: 4, name: 'Cat-Eye', slug: 'cat-eye', display_order: 4,
      icon_svg: `<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 7 C14 5, 21 9, 20 16 C19 19, 11 19, 8 17 Z"/><path d="M42 7 C34 5, 27 9, 28 16 C29 19, 37 19, 40 17 Z"/><line x1="20" y1="12" x2="28" y2="12"/></svg>`
    },
    {
      id: 5, name: 'Rectangle', slug: 'rectangle', display_order: 5,
      icon_svg: `<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="7" width="16" height="10" rx="1.5"/><rect x="26" y="7" width="16" height="10" rx="1.5"/><line x1="22" y1="12" x2="26" y2="12"/></svg>`
    },
    {
      id: 6, name: 'Hexagonal', slug: 'hexagonal', display_order: 6,
      icon_svg: `<svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="14,4 21,8 21,16 14,20 7,16 7,8"/><polygon points="34,4 41,8 41,16 34,20 27,16 27,8"/><line x1="21" y1="12" x2="27" y2="12"/></svg>`
    }
  ];

  for (const s of shapes) {
    await db.run(
      `INSERT OR REPLACE INTO frame_shapes (id, name, slug, icon_svg, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [s.id, s.name, s.slug, s.icon_svg, s.display_order]
    );
  }
  console.log(`  ✓ Seeded ${shapes.length} frame shapes with line-art SVGs`);

  // 4. Seed Categories
  const categories = [
    { id: 1, name: 'Eyeglasses', slug: 'eyeglasses', category_type: 'glasses', gender: 'unisex', display_order: 1 },
    { id: 2, name: 'Sunglasses', slug: 'sunglasses', category_type: 'sunglasses', gender: 'unisex', display_order: 2 },
    { id: 3, name: 'Men Sunglasses', slug: 'men-sunglasses', category_type: 'sunglasses', gender: 'men', display_order: 3 },
    { id: 4, name: 'Women Sunglasses', slug: 'women-sunglasses', category_type: 'sunglasses', gender: 'women', display_order: 4 },
    { id: 5, name: 'Contact Lenses', slug: 'contact-lenses', category_type: 'contact_lenses', gender: 'unisex', display_order: 5 },
    { id: 6, name: 'Eye Care & Accessories', slug: 'eye-care-accessories', category_type: 'eyecare', gender: 'unisex', display_order: 6 }
  ];

  for (const c of categories) {
    await db.run(
      `INSERT OR REPLACE INTO categories (id, name, slug, category_type, gender, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [c.id, c.name, c.slug, c.category_type, c.gender, c.display_order]
    );
  }
  console.log(`  ✓ Seeded ${categories.length} product categories`);

  // 5. Seed Progressive 4-Step Optical Lens Hierarchy
  // Step 1: Lens Usage Types
  const usages = [
    { id: 1, name: 'Single Vision Distance', slug: 'single-vision-distance', description: 'For driving, outdoor activities, and everyday distance clarity.', base_price_inr: 0, display_order: 1 },
    { id: 2, name: 'Single Vision Reading', slug: 'single-vision-reading', description: 'Tailored for books, tablets, mobile screens, and close reading.', base_price_inr: 0, display_order: 2 },
    { id: 3, name: 'Progressive / Multifocal', slug: 'progressive-multifocal', description: 'Seamless no-line transition for near, intermediate, and distance focus.', base_price_inr: 2500, display_order: 3 },
    { id: 4, name: 'Screen & Blue Light', slug: 'screen-blue-light', description: 'Digital screen comfort with optimized intermediate focal distance.', base_price_inr: 800, display_order: 4 },
    { id: 5, name: 'Sun / Polarized Lenses', slug: 'sun-polarized', description: 'Full UV400 prescription sunglasses for outdoor glare reduction.', base_price_inr: 1500, display_order: 5 },
    { id: 6, name: 'Non-Prescription / Fashion', slug: 'fashion-zero-power', description: 'Zero optical correction for aesthetic wear and dust protection.', base_price_inr: 0, display_order: 6 }
  ];

  for (const u of usages) {
    await db.run(
      `INSERT OR REPLACE INTO lens_usages (id, name, slug, description, base_price_inr, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [u.id, u.name, u.slug, u.description, u.base_price_inr, u.display_order]
    );
  }

  // Step 3: Lens Thickness / Index Ratings
  const thicknesses = [
    { id: 1, usage_id: 1, name: 'Standard 1.50 Index', index_rating: 1.50, description: 'Standard optical resin. Best for low prescriptions (Up to -2.00 SPH).', price_inr: 0, recommended_sph_range: 'Up to -2.00 SPH', display_order: 1 },
    { id: 2, usage_id: 1, name: 'Thin 1.60 Index', index_rating: 1.60, description: '20% thinner & lighter. Impact-resistant polymer.', price_inr: 1200, recommended_sph_range: '-2.00 to -4.00 SPH', display_order: 2 },
    { id: 3, usage_id: 1, name: 'Super Thin 1.67 Index', index_rating: 1.67, description: '35% thinner with minimal eye magnification. Best for moderate to strong vision.', price_inr: 2400, recommended_sph_range: '-4.00 to -6.50 SPH', display_order: 3 },
    { id: 4, usage_id: 1, name: 'Ultra Thin 1.74 Index', index_rating: 1.74, description: '50% thinner for high prescriptions. Ultra-flat curvature.', price_inr: 4200, recommended_sph_range: '-6.50 SPH & above', display_order: 4 }
  ];

  for (const t of thicknesses) {
    await db.run(
      `INSERT OR REPLACE INTO lens_thicknesses (id, usage_id, name, index_rating, description, price_inr, recommended_sph_range, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [t.id, t.usage_id, t.name, t.index_rating, t.description, t.price_inr, t.recommended_sph_range, t.display_order]
    );
  }

  // Step 4: Lens Coatings & Treatments
  const coatings = [
    { id: 1, name: 'Clear Anti-Reflective Coating', slug: 'anti-reflective', description: 'Eliminates glare, water-repellent, anti-static, anti-scratch.', price_inr: 0, display_order: 1 },
    { id: 2, name: 'Blue Light Shield Coating', slug: 'blue-shield', description: 'Filters 420nm high-energy blue rays from screens and office lighting.', price_inr: 800, display_order: 2 },
    { id: 3, name: 'Photochromic Transitions (Brown/Grey)', slug: 'transitions', description: 'Automatically darkens outdoors in sunlight; clear indoors.', price_inr: 2200, display_order: 3 },
    { id: 4, name: 'Polarized Sun Tint (Cat 3 UV400)', slug: 'polarized-sun', description: 'Blocks blinding reflective glare with 100% UVA/UVB blockage.', price_inr: 1800, display_order: 4 }
  ];

  for (const c of coatings) {
    await db.run(
      `INSERT OR REPLACE INTO lens_coatings (id, name, slug, description, price_inr, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [c.id, c.name, c.slug, c.description, c.price_inr, c.display_order]
    );
  }
  console.log('  ✓ Seeded progressive 4-step optical lens tiers & pricing');

  // 6. Seed Greenfield Optical Products (With Millimeter Measurements)
  const products = [
    {
      id: 1, brand_id: 1, shape_id: 1, category_id: 3,
      name: 'Henry Round Acetate', slug: 'henry-round-acetate', sku: 'OPT-HEN-01',
      description: 'Iconic round optical frame crafted from Italian bio-acetate with custom sculpted temple tips.',
      base_price_inr: 9500, gender: 'unisex', material: 'Italian Bio-Acetate', frame_fit: 'Medium',
      lens_width_mm: 51, bridge_width_mm: 20, temple_length_mm: 150, frame_height_mm: 46, total_width_mm: 135,
      is_featured: 1,
      variants: [
        {
          id: 1, color_name: 'Tigerwood', color_hex: '#5a3825', color_secondary_hex: '#b2733b',
          sku: 'OPT-HEN-01-TIG', price_override_inr: null, stock_quantity: 12, is_default: 1,
          images: [
            { image_type: 'studio_front', image_url: 'images/tortoise_round_front.jpg', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        },
        {
          id: 2, color_name: 'Morning Haze Crystal', color_hex: '#e9eef2', color_secondary_hex: null,
          sku: 'OPT-HEN-01-CRY', price_override_inr: null, stock_quantity: 8, is_default: 0,
          images: [
            { image_type: 'studio_front', image_url: 'images/slim rectangle frame.png', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        },
        {
          id: 3, color_name: 'Matte Black', color_hex: '#111111', color_secondary_hex: null,
          sku: 'OPT-HEN-01-BLK', price_override_inr: null, stock_quantity: 15, is_default: 0,
          images: [
            { image_type: 'studio_front', image_url: 'images/slim rectangle frame.png', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        }
      ]
    },
    {
      id: 2, brand_id: 1, shape_id: 1, category_id: 4,
      name: 'Tori Oval Titanium', slug: 'tori-oval-titanium', sku: 'OPT-TOR-02',
      description: 'Featherlight Japanese pure titanium frame with delicate coin-edge filigree engraving.',
      base_price_inr: 12500, gender: 'women', material: 'Japanese Titanium', frame_fit: 'Medium',
      lens_width_mm: 53, bridge_width_mm: 17, temple_length_mm: 145, frame_height_mm: 44, total_width_mm: 133,
      is_featured: 1,
      variants: [
        {
          id: 4, color_name: 'Royal Gold', color_hex: '#d4af37', color_secondary_hex: null,
          sku: 'OPT-TOR-02-GLD', price_override_inr: null, stock_quantity: 9, is_default: 1,
          images: [
            { image_type: 'studio_front', image_url: 'images/tortoise_round_front.jpg', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        },
        {
          id: 5, color_name: 'Titanium Silver', color_hex: '#c0c0c0', color_secondary_hex: null,
          sku: 'OPT-TOR-02-SLV', price_override_inr: null, stock_quantity: 7, is_default: 0,
          images: [
            { image_type: 'studio_front', image_url: 'images/slim rectangle frame.png', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        }
      ]
    },
    {
      id: 3, brand_id: 2, shape_id: 2, category_id: 3,
      name: 'Eldon Square Combi', slug: 'eldon-square-combi', sku: 'OPT-ELD-03',
      description: 'A bold, architectural square frame pairing high-density acetate with structural titanium temples.',
      base_price_inr: 11000, gender: 'men', material: 'Combi Titanium & Bio-Acetate', frame_fit: 'Wide',
      lens_width_mm: 54, bridge_width_mm: 18, temple_length_mm: 145, frame_height_mm: 45, total_width_mm: 140,
      is_featured: 1,
      variants: [
        {
          id: 6, color_name: 'Deep Havana Tortoise', color_hex: '#402008', color_secondary_hex: '#d4af37',
          sku: 'OPT-ELD-03-HAV', price_override_inr: null, stock_quantity: 10, is_default: 1,
          images: [
            { image_type: 'studio_front', image_url: 'images/tortoise_round_front.jpg', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        }
      ]
    },
    {
      id: 4, brand_id: 2, shape_id: 3, category_id: 2,
      name: 'Neil Aviator Metal', slug: 'neil-aviator-metal', sku: 'OPT-NEI-04',
      description: 'Modern streamlined aviator with double bridge wire and polarized crystal sun lenses.',
      base_price_inr: 8500, gender: 'unisex', material: 'Stainless Steel', frame_fit: 'Wide',
      lens_width_mm: 56, bridge_width_mm: 16, temple_length_mm: 145, frame_height_mm: 48, total_width_mm: 142,
      is_featured: 1,
      variants: [
        {
          id: 7, color_name: 'Polished Gold', color_hex: '#d4af37', color_secondary_hex: null,
          sku: 'OPT-NEI-04-GLD', price_override_inr: null, stock_quantity: 14, is_default: 1,
          images: [
            { image_type: 'studio_front', image_url: 'images/slim rectangle frame.png', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        }
      ]
    },
    {
      id: 5, brand_id: 1, shape_id: 4, category_id: 4,
      name: 'Dion Cat-Eye Sun', slug: 'dion-cat-eye-sun', sku: 'OPT-DIO-05',
      description: 'Feminine, refined upswept cat-eye silhouette with subtle beveling on acetate brows.',
      base_price_inr: 10500, gender: 'women', material: 'Italian Bio-Acetate', frame_fit: 'Narrow',
      lens_width_mm: 50, bridge_width_mm: 19, temple_length_mm: 140, frame_height_mm: 43, total_width_mm: 130,
      is_featured: 1,
      variants: [
        {
          id: 8, color_name: 'Vintage Amber', color_hex: '#b2733b', color_secondary_hex: null,
          sku: 'OPT-DIO-05-AMB', price_override_inr: null, stock_quantity: 6, is_default: 1,
          images: [
            { image_type: 'studio_front', image_url: 'images/tortoise_round_front.jpg', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        }
      ]
    },
    {
      id: 6, brand_id: 6, shape_id: 6, category_id: 1,
      name: 'Pierce Hexagonal Geometric', slug: 'pierce-hexagonal-geometric', sku: 'OPT-PIE-06',
      description: 'Geometric 6-sided crown-panto frame for modern creative professionals.',
      base_price_inr: 13500, gender: 'unisex', material: 'Japanese Titanium', frame_fit: 'Medium',
      lens_width_mm: 49, bridge_width_mm: 21, temple_length_mm: 145, frame_height_mm: 44, total_width_mm: 134,
      is_featured: 1,
      variants: [
        {
          id: 9, color_name: 'Brushed Gunmetal', color_hex: '#41424c', color_secondary_hex: null,
          sku: 'OPT-PIE-06-GUN', price_override_inr: null, stock_quantity: 11, is_default: 1,
          images: [
            { image_type: 'studio_front', image_url: 'images/slim rectangle frame.png', display_order: 1 },
            { image_type: 'angle_45', image_url: 'images/tortoise_round_angle.jpg', display_order: 2 },
            { image_type: 'model_on_face', image_url: 'images/tortoise_round_angle.jpg', display_order: 3 },
            { image_type: 'hinge_detail', image_url: 'images/image1.jpg', display_order: 4 }
          ]
        }
      ]
    }
  ];

  await db.run('DELETE FROM product_images;');

  for (const p of products) {
    await db.run(
      `INSERT OR REPLACE INTO products (
         id, brand_id, shape_id, category_id, name, slug, sku, description,
         base_price_inr, gender, material, frame_fit, lens_width_mm, bridge_width_mm,
         temple_length_mm, frame_height_mm, total_width_mm, is_featured, is_active
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        p.id, p.brand_id, p.shape_id, p.category_id, p.name, p.slug, p.sku, p.description,
        p.base_price_inr, p.gender, p.material, p.frame_fit, p.lens_width_mm, p.bridge_width_mm,
        p.temple_length_mm, p.frame_height_mm, p.total_width_mm, p.is_featured
      ]
    );

    for (const v of p.variants) {
      await db.run(
        `INSERT OR REPLACE INTO product_variants (
           id, product_id, color_name, color_hex, color_secondary_hex, sku, price_override_inr, stock_quantity, is_default, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [v.id, p.id, v.color_name, v.color_hex, v.color_secondary_hex, v.sku, v.price_override_inr, v.stock_quantity, v.is_default]
      );

      for (const img of v.images) {
        await db.run(
          `INSERT OR REPLACE INTO product_images (variant_id, image_type, image_url, display_order)
           VALUES (?, ?, ?, ?)`,
          [v.id, img.image_type, img.image_url, img.display_order]
        );
      }
    }
  }
  console.log(`  ✓ Seeded ${products.length} optical frame masters with variants and studio/model image pairs`);

  // 7. Seed Physical Optical Store & Operating Hours
  await db.run(
    `INSERT OR REPLACE INTO stores (id, name, address, city, phone, email, slot_interval_minutes, is_active)
     VALUES (1, 'Vision Opticals', '12 Kamalalayam West Bank, Near Railway Feeder Rd', 'Thiruvarur', '+91 94865 52324', 'care@optii.in', 30, 1)`
  );

  for (let day = 0; day <= 6; day++) {
    const isSunday = day === 0;
    await db.run(
      `INSERT OR REPLACE INTO store_hours (id, store_id, day_of_week, open_time, close_time, is_closed)
       VALUES (?, 1, ?, ?, ?, 0)`,
      [day + 1, day, '10:00', isSunday ? '14:00' : '20:00']
    );
  }
  console.log('  ✓ Seeded Optii store branch & operating schedule');

  // 8. Seed Sample Eye Test Appointment
  await db.run(
    `INSERT OR REPLACE INTO appointments (
       id, appointment_number, store_id, customer_name, customer_phone, customer_email,
       appointment_date, start_time, end_time, status, notes
     ) VALUES (1, 'OPT-APP-2026-001', 1, 'Dr. Aravindhan Swaminathan', '+919486552324', 'aravind@example.com',
       DATE('now', '+1 day'), '11:00', '11:30', 'confirmed', 'Prescription update & digital eye fatigue evaluation')`
  );

  // 9. Seed Eye Care Articles
  await db.run(
    `INSERT OR REPLACE INTO eyecare_articles (id, title, slug, excerpt, content_markdown, cover_image_url)
     VALUES (1, 'Understanding Progressive Lenses: Adaptation & Comfort', 'understanding-progressive-lenses',
       'Everything you need to know about adapting to modern multifocal corridor lenses with zero distortion.',
       'Progressive lenses provide a seamless transition between reading, computer, and distance viewing...', 'images/framedisplay.webp')`
  );

  // 10. Seed Site Settings
  const settings = [
    { key: 'whatsapp_number', value: '+919486552324', description: 'Store WhatsApp business number' },
    { key: 'store_name', value: 'Vision Opticals', description: 'Brand trading name' },
    { key: 'currency', value: 'INR', description: 'Platform base currency' },
    { key: 'announcement_text', value: '✨ Complimentary Computerised Eye Testing With Every Frame Purchase', description: 'Header announcement message' }
  ];

  for (const s of settings) {
    await db.run(
      `INSERT OR REPLACE INTO site_settings (key, value, description)
       VALUES (?, ?, ?)`,
      [s.key, s.value, s.description]
    );
  }

  await db.run('PRAGMA foreign_keys = ON;');
  console.log('[Optii Seeder] Seed process completed successfully!\n');
}

if (require.main === module) {
  seedOptii().then(() => {
    process.exit(0);
  }).catch((err) => {
    console.error('[Optii Seeder] Error seeding database:', err);
    process.exit(1);
  });
}

module.exports = seedOptii;
