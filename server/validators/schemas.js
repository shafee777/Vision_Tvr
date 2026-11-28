/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — RUNTIME SCHEMA VALIDATORS (ZOD)
 * Strong type safety, range checks, and regex guards on mutations
 * ═════════════════════════════════════════════════════════════════════
 */

const { z } = require('zod');

const HEX_REGEX = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

const variantInlineSchema = z.object({
  color_name: z.string().trim().min(1, 'Variant colour name is required.').max(80),
  color_hex: z.string().trim().regex(HEX_REGEX, 'Invalid hex colour code (#RRGGBB).').optional().or(z.literal('')).nullable(),
  color_secondary_hex: z.string().trim().regex(HEX_REGEX, 'Invalid secondary hex colour code.').optional().or(z.literal('')).nullable(),
  sku: z.string().trim().min(2, 'Variant SKU is required.').max(60).optional().or(z.literal('')).nullable(),
  price_override_inr: z.number().positive('Price override must be positive.').optional().nullable(),
  stock_quantity: z.number().int().min(0, 'Opening stock cannot be negative.').default(0),
  is_default: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional()
});

const productCreateSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150),
  slug: z.string().trim().min(2, 'Slug must be at least 2 characters.').max(150).optional().or(z.literal('')).nullable(),
  sku: z.string().trim().min(2, 'Product code must be at least 2 characters.').max(50).optional().or(z.literal('')).nullable(),
  prod_code: z.string().trim().min(2, 'Product code (prod_code) must be at least 2 characters.').max(50).optional().or(z.literal('')).nullable(),
  brand_id: z.number().int().positive('Brand is required.'),
  category_id: z.number().int().positive('Category is required.'),
  shape_id: z.number().int().positive('Frame shape is required.'),
  base_price_inr: z.number().positive('Price must be greater than zero.'),
  gender: z.enum(['men', 'women', 'unisex']).optional().default('unisex'),
  material: z.string().trim().min(2, 'Material must be at least 2 characters.').max(100),
  frame_fit: z.enum(['Narrow', 'Medium', 'Wide']),
  frame_type: z.string().trim().min(2).max(50).optional().default('Full Rim'),
  lens_width_mm: z.number().min(30).max(75, 'Lens width must be between 30mm and 75mm.'),
  bridge_width_mm: z.number().min(10).max(35, 'Bridge width must be between 10mm and 35mm.'),
  temple_length_mm: z.number().min(100).max(180, 'Temple length must be between 100mm and 180mm.'),
  frame_height_mm: z.number().positive().max(90).optional().nullable(),
  total_width_mm: z.number().positive().max(200).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional().default(1),
  initial_variant: variantInlineSchema.optional().nullable()
}).superRefine((data, ctx) => {
  const code = String(data.prod_code || data.sku || '').trim();
  if (code.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['prod_code'],
      message: 'Product code (prod_code) must be at least 2 characters.'
    });
  }
});

const productUpdateSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  slug: z.string().trim().min(2).max(150).optional(),
  sku: z.string().trim().min(2).max(50).optional(),
  brand_id: z.number().int().positive().optional(),
  category_id: z.number().int().positive().optional(),
  shape_id: z.number().int().positive().optional(),
  base_price_inr: z.number().positive().optional(),
  gender: z.enum(['men', 'women', 'unisex']).optional(),
  material: z.string().trim().min(2).max(100).optional(),
  frame_fit: z.enum(['Narrow', 'Medium', 'Wide']).optional(),
  frame_type: z.string().trim().min(2).max(50).optional(),
  lens_width_mm: z.number().min(30).max(75).optional(),
  bridge_width_mm: z.number().min(10).max(35).optional(),
  temple_length_mm: z.number().min(100).max(180).optional(),
  frame_height_mm: z.number().positive().max(90).optional().nullable(),
  total_width_mm: z.number().positive().max(200).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  is_featured: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional()
});

const variantUpdateSchema = z.object({
  color_name: z.string().trim().min(1).max(80).optional(),
  color_hex: z.string().trim().regex(HEX_REGEX, 'Invalid hex colour code (#RRGGBB).').optional(),
  color_secondary_hex: z.string().trim().regex(HEX_REGEX, 'Invalid secondary hex colour code.').optional().or(z.literal('')).nullable(),
  sku: z.string().trim().min(2).max(60).optional(),
  price_override_inr: z.number().nonnegative().optional().nullable(),
  is_default: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional()
});

const brandPayloadSchema = z.object({
  name: z.string().trim().min(2, 'Brand name must be at least 2 characters.').max(120),
  slug: z.string().trim().min(2, 'Brand slug must be at least 2 characters.').max(120).regex(SLUG_REGEX, 'Slug must use lowercase letters, numbers, and hyphens only.'),
  description: z.string().trim().max(500).optional().or(z.literal('')).nullable(),
  logo_url: z.string().trim().max(300).optional().or(z.literal('')).nullable(),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional().default(1)
});

const shapePayloadSchema = z.object({
  name: z.string().trim().min(2, 'Shape name must be at least 2 characters.').max(80),
  slug: z.string().trim().min(2, 'Shape slug must be at least 2 characters.').max(80).regex(SLUG_REGEX, 'Slug must use lowercase letters, numbers, and hyphens only.'),
  icon_svg: z.string().trim().max(5000).optional().or(z.literal('')).nullable(),
  display_order: z.number().int().min(0).max(999).optional().default(0),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional().default(1)
});

const categoryPayloadSchema = z.object({
  name: z.string().trim().min(2, 'Category name must be at least 2 characters.').max(100),
  slug: z.string().trim().min(2, 'Category slug must be at least 2 characters.').max(100).regex(SLUG_REGEX, 'Slug must use lowercase letters, numbers, and hyphens only.'),
  category_type: z.enum(['glasses', 'sunglasses', 'accessories', 'contact_lenses', 'eyecare']).default('glasses'),
  gender: z.enum(['men', 'women', 'unisex']).optional().default('unisex'),
  description: z.string().trim().max(500).optional().or(z.literal('')).nullable(),
  display_order: z.number().int().min(0).max(999).optional().default(0),
  is_active: z.union([z.boolean(), z.number().int().min(0).max(1)]).optional().default(1)
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

const optionalHttpUrl = z.string().trim().max(500).refine(
  val => !val || /^https?:\/\/.+/i.test(val),
  'URL must start with http:// or https://'
).optional().or(z.literal('')).nullable();

const storeHourItemSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  open_time: z.string().regex(/^\d{2}:\d{2}$/, 'Open time must be HH:MM.'),
  close_time: z.string().regex(/^\d{2}:\d{2}$/, 'Close time must be HH:MM.'),
  is_closed: z.union([z.boolean(), z.number().int().min(0).max(1)]).default(0)
});

const clinicSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Store name must be at least 2 characters.').max(150),
  address: z.string().trim().min(5, 'Clinic address must be at least 5 characters.').max(300),
  city: z.string().trim().max(100).optional().or(z.literal('')).nullable(),
  phone: z.string().trim().min(8, 'Phone number must be at least 8 digits.').max(25)
    .regex(/^[+0-9\s-]{8,25}$/, 'Invalid phone number format.'),
  whatsapp_number: z.string().trim().min(8).max(25)
    .regex(/^[+0-9\s-]{8,25}$/, 'Invalid WhatsApp number format.').optional().or(z.literal('')).nullable(),
  email: z.string().trim().email('Invalid email address.').optional().or(z.literal('')).nullable(),
  description: z.string().trim().max(500).optional().or(z.literal('')).nullable(),
  map_url: optionalHttpUrl,
  instagram_url: optionalHttpUrl,
  facebook_url: optionalHttpUrl,
  announcement_text: z.string().trim().max(250).optional().or(z.literal('')).nullable(),
  slot_interval_minutes: z.number().int().min(15).max(120).optional(),
  hours: z.array(storeHourItemSchema).max(7).optional()
});

module.exports = {
  loginSchema,
  orderCreateSchema,
  appointmentCreateSchema,
  variantInlineSchema,
  productCreateSchema,
  productUpdateSchema,
  variantUpdateSchema,
  brandPayloadSchema,
  shapePayloadSchema,
  categoryPayloadSchema,
  stockAdjustSchema,
  passwordChangeSchema,
  clinicSettingsSchema
};
