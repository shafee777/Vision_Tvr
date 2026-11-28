/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — ADMIN BULK IMPORT ROUTES
 * Catalogue CSV/Paste Import & All-or-Nothing Stock Count Synchronization
 * ═════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireRole } = require('../middleware/auth');
const { validateBody } = require('../middleware/validate');
const { catalogueImportPayloadSchema, stockCountImportPayloadSchema } = require('../validators/importSchemas');
const importService = require('../services/adminImportService');

async function logImportAudit(req, action, entity, entityId, details) {
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
    console.error('[Import Audit Error]:', err.message);
  }
}

// ─── CATALOGUE IMPORTS (ADMIN ONLY) ─────────────────────────────────

// GET /api/admin/imports/catalogue/template
router.get('/catalogue/template', requireRole('admin'), async (req, res) => {
  try {
    const csv = await importService.generateCatalogueTemplateCsv();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vision_opticals_catalogue_blank_template.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Catalogue Template Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate catalogue template.' });
  }
});

// POST /api/admin/imports/catalogue/validate
router.post('/catalogue/validate', requireRole('admin'), validateBody(catalogueImportPayloadSchema), async (req, res) => {
  try {
    const result = await importService.validateCatalogueRows(req.body.rows);
    res.json({
      success: true,
      valid: result.valid,
      summary: result.summary,
      errors: result.errors,
      warnings: result.warnings,
      rows: result.normalizedRows
    });
  } catch (err) {
    console.error('Catalogue Validate Error:', err);
    res.status(500).json({ success: false, message: 'Failed to validate catalogue import rows.' });
  }
});

// POST /api/admin/imports/catalogue/commit
router.post('/catalogue/commit', requireRole('admin'), validateBody(catalogueImportPayloadSchema), async (req, res) => {
  try {
    const result = await importService.commitCatalogueRows({
      rows: req.body.rows,
      sourceType: req.body.source_type,
      sourceName: req.body.source_name,
      idempotencyKey: req.body.idempotency_key || null,
      user: req.user
    });

    if (!result.idempotent) {
      await logImportAudit(req, 'BULK_CATALOGUE_IMPORT', 'admin_import_batches', result.batch.batch_number, {
        frames_created: result.batch.frames_created,
        variants_created: result.batch.variants_created,
        total_rows: result.batch.total_rows
      });
    }

    res.status(result.idempotent ? 200 : 201).json({
      success: true,
      idempotent: result.idempotent,
      message: result.idempotent
        ? `Import batch ${result.batch.batch_number} was already committed.`
        : `Imported ${result.batch.frames_created} frame(s) and ${result.batch.variants_created} variant(s) in batch ${result.batch.batch_number}.`,
      batch: result.batch
    });
  } catch (err) {
    if (err.code === 'CATALOGUE_VALIDATION_FAILED') {
      return res.status(400).json({
        success: false,
        error_code: err.code,
        message: err.message,
        batch_id: err.batchId,
        batch_number: err.batchNumber,
        validation: err.validation
      });
    }
    console.error('Catalogue Commit Error:', err);
    res.status(500).json({ success: false, message: 'Failed to commit catalogue import.' });
  }
});

// ─── STOCK COUNT IMPORTS (ADMIN & INVENTORY STAFF) ───────────────────

// GET /api/admin/imports/inventory/template
router.get('/inventory/template', requireRole('admin', 'staff'), async (req, res) => {
  try {
    const csv = await importService.generateStockCountTemplateCsv(req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="optii_stock_count_sheet.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Stock Template Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate stock count sheet.' });
  }
});

// POST /api/admin/imports/inventory/validate
router.post('/inventory/validate', requireRole('admin', 'staff'), validateBody(stockCountImportPayloadSchema), async (req, res) => {
  try {
    const result = await importService.validateStockCountRows(req.body.rows);
    res.json({
      success: true,
      valid: result.valid,
      has_stale_conflicts: result.has_stale_conflicts,
      summary: result.summary,
      errors: result.errors,
      rows: result.normalizedRows
    });
  } catch (err) {
    console.error('Stock Validate Error:', err);
    res.status(500).json({ success: false, message: 'Failed to validate stock count rows.' });
  }
});

// POST /api/admin/imports/inventory/commit
router.post('/inventory/commit', requireRole('admin', 'staff'), validateBody(stockCountImportPayloadSchema), async (req, res) => {
  try {
    const result = await importService.commitStockCountRows({
      rows: req.body.rows,
      sourceType: req.body.source_type,
      sourceName: req.body.source_name,
      idempotencyKey: req.body.idempotency_key || null,
      user: req.user
    });

    if (!result.idempotent) {
      await logImportAudit(req, 'BULK_STOCK_COUNT_IMPORT', 'admin_import_batches', result.batch.batch_number, {
        records_updated: result.batch.records_updated,
        records_unchanged: result.batch.records_unchanged,
        total_rows: result.batch.total_rows
      });
    }

    res.status(result.idempotent ? 200 : 201).json({
      success: true,
      idempotent: result.idempotent,
      message: result.idempotent
        ? `Stock batch ${result.batch.batch_number} was already committed.`
        : `Synchronized ${result.batch.records_updated} variant(s) (${result.batch.records_unchanged} unchanged) in batch ${result.batch.batch_number}.`,
      batch: result.batch
    });
  } catch (err) {
    if (err.code === 'STALE_STOCK_CONFLICT' || err.code === 'STOCK_VALIDATION_FAILED') {
      return res.status(err.status || 400).json({
        success: false,
        error_code: err.code,
        message: err.message,
        batch_id: err.batchId,
        batch_number: err.batchNumber,
        validation: err.validation
      });
    }
    console.error('Stock Commit Error:', err);
    res.status(500).json({ success: false, message: 'Failed to commit stock count import.' });
  }
});

// ─── SHARED IMPORT HISTORY & ERROR REPORTS ──────────────────────────

// GET /api/admin/imports/history
router.get('/history', requireRole('admin', 'staff'), async (req, res) => {
  try {
    const { import_type = '', limit = 50 } = req.query;
    const batches = await importService.listImportHistory({ importType: import_type, limit });
    res.json({ success: true, count: batches.length, batches });
  } catch (err) {
    console.error('Import History Error:', err);
    res.status(500).json({ success: false, message: 'Failed to load import history.' });
  }
});

// GET /api/admin/imports/:batchId/report
router.get('/:batchId/report', requireRole('admin', 'staff'), async (req, res) => {
  try {
    const report = await importService.getImportBatchReport(req.params.batchId);
    if (!report) {
      return res.status(404).json({ success: false, message: 'Import batch not found.' });
    }

    if (req.query.format === 'json') {
      return res.json({ success: true, batch: report.batch, errors: report.errors });
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.batch.batch_number}_error_report.csv"`);
    res.send(report.csv);
  } catch (err) {
    console.error('Import Error Report Error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate error report.' });
  }
});

module.exports = router;
