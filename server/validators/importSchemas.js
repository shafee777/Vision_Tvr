/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — IMPORT REQUEST SCHEMAS (ZOD)
 * ═════════════════════════════════════════════════════════════════════
 */

const { z } = require('zod');

const catalogueImportPayloadSchema = z.object({
  source_type: z.enum(['csv', 'paste']).default('csv'),
  source_name: z.string().trim().max(200).optional().default('spreadsheet_upload'),
  idempotency_key: z.string().trim().min(6).max(120).optional(),
  rows: z.array(z.record(z.any())).min(1, 'At least one data row is required for import.').max(2000, 'Maximum 2,000 rows per import batch.')
});

const stockCountImportPayloadSchema = z.object({
  source_type: z.enum(['csv', 'paste']).default('csv'),
  source_name: z.string().trim().max(200).optional().default('stock_count_sheet'),
  idempotency_key: z.string().trim().min(6).max(120).optional(),
  rows: z.array(z.record(z.any())).min(1, 'At least one stock count row is required.').max(2000, 'Maximum 2,000 rows per import batch.')
});

module.exports = {
  catalogueImportPayloadSchema,
  stockCountImportPayloadSchema
};
