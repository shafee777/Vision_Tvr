/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — RUNTIME SCHEMA VALIDATORS (ZOD)
 * Strong type safety, range checks, and regex guards on mutations
 * ═════════════════════════════════════════════════════════════════════
 */

const { z } = require('zod');

const loginSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters.').max(50),
  password: z.string().min(6, 'Password must be at least 6 characters.').max(100)
});

const orderCreateSchema = z.object({
  customer_name: z.string().trim().min(2, 'Customer name must be at least 2 characters.').max(100),
  customer_phone: z.string().trim().min(10, 'Phone number must be at least 10 digits.').max(20)
    .regex(/^[+0-9\s-]{10,20}$/, 'Invalid phone number format.'),
  customer_email: z.string().trim().email('Invalid email address format.').optional().or(z.literal('')).nullable(),
  shipping_address: z.string().trim().min(5, 'Shipping address must be at least 5 characters.').max(300),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  pincode: z.string().trim().max(20).optional().nullable(),
  delivery_method: z.enum(['express', 'pickup']).default('express'),
  payment_method: z.enum(['online', 'cod']).default('online'),
  promo_code: z.string().trim().max(30).optional().nullable(),
  items: z.array(z.object({
    product_id: z.number().int().positive().optional(),
    product_name: z.string().optional(),
    name: z.string().optional(),
    variant_id: z.number().int().positive().optional(),
    sku: z.string().trim().max(80).optional(),
    color_name: z.string().optional(),
    image_url: z.string().optional(),
    dimensions: z.string().optional(),
    quantity: z.number().int().min(1).default(1),
    price_inr: z.number().nonnegative().optional(),
    item_price_inr: z.number().nonnegative().optional(),
    frame_price_inr: z.number().nonnegative().optional(),
    total_price_inr: z.number().nonnegative().optional(),
    configured_lenses: z.record(z.any()).optional().nullable()
  })).min(1, 'Shopping bag must contain at least one item.'),
  subtotal_inr: z.number().nonnegative().optional(),
  prescription_file_url: z.string().optional().nullable(),
  prescription_data: z.any().optional().nullable()
});

const appointmentCreateSchema = z.object({
  store_id: z.number().int().positive().default(1),
  customer_name: z.string().trim().min(2, 'Customer name must be at least 2 characters.').max(100),
  customer_phone: z.string().trim().min(10, 'Phone number must be at least 10 digits.').max(20)
    .regex(/^[+0-9\s-]{10,20}$/, 'Invalid phone number format.'),
  customer_email: z.string().trim().email('Invalid email address format.').optional().or(z.literal('')).nullable(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD.'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time slot must be formatted as HH:MM.'),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'End time must be formatted as HH:MM.').optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable()
});

const productCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
  slug: z.string().trim().min(2, 'Slug must be at least 2 characters.').max(150),
  sku: z.string().trim().min(2, 'Master SKU must be at least 2 characters.').max(50),
  brand_id: z.number().int().positive('Brand ID is required.'),
  category_id: z.number().int().positive('Category ID is required.'),
  shape_id: z.number().int().positive('Shape ID is required.'),
  base_price_inr: z.number().positive('Price must be greater than zero.'),
  gender: z.enum(['men', 'women', 'unisex']).optional().default('unisex'),
  material: z.string().trim().min(2).max(100),
  frame_fit: z.enum(['Narrow', 'Medium', 'Wide']),
  lens_width_mm: z.number().min(30).max(75, 'Lens width must be between 30mm and 75mm.'),
  bridge_width_mm: z.number().min(10).max(35, 'Bridge width must be between 10mm and 35mm.'),
  temple_length_mm: z.number().min(100).max(180, 'Temple length must be between 100mm and 180mm.'),
  frame_height_mm: z.number().positive().optional().nullable(),
  total_width_mm: z.number().positive().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  initial_variant: z.object({
    color_name: z.string().trim().min(1, 'Variant colour name is required.'),
    color_hex: z.string().trim().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/, 'Invalid hex colour code.'),
    color_secondary_hex: z.string().trim().optional().nullable(),
    sku: z.string().trim().min(2, 'Variant SKU is required.').max(60),
    price_override_inr: z.number().positive().optional().nullable(),
    stock_quantity: z.number().int().min(0, 'Opening stock cannot be negative.').default(0)
  }).optional().nullable()
});

const stockAdjustSchema = z.object({
  variant_id: z.number().int().positive('Variant ID is required.'),
  change_quantity: z.number().int().refine(val => val !== 0, 'Change quantity cannot be zero.'),
  movement_type: z.enum(['manual_adjustment', 'replenishment', 'damage_writeoff']),
  reason: z.string().trim().min(5, 'Mandatory operational reason must be at least 5 characters.').max(500)
});

const passwordChangeSchema = z.object({
  current_password: z.string().min(1, 'Current password is required.'),
  new_password: z.string().min(6, 'New password must be at least 6 characters.').max(100)
});

const clinicSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Atelier name must be at least 2 characters.').max(150),
  address: z.string().trim().min(5, 'Clinic address must be at least 5 characters.').max(300),
  phone: z.string().trim().min(8, 'Phone / WhatsApp number must be at least 8 digits.').max(25)
    .regex(/^[+0-9\s-]{8,25}$/, 'Invalid phone / WhatsApp number format.')
});

module.exports = {
  loginSchema,
  orderCreateSchema,
  appointmentCreateSchema,
  productCreateSchema,
  stockAdjustSchema,
  passwordChangeSchema,
  clinicSettingsSchema
};
