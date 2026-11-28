/**
 * Optii Admin — 4-Step Bulk Frame Catalogue Import Wizard & History
 */

import { apiRequest, downloadAuthenticatedCsv } from '../core/api-client.js';
import { escapeHtml, formatDateTime } from '../shared/formatters.js';
import { autoMapHeaders, buildMappedRows, parseSpreadsheet } from '../shared/csv-parser.js';
import { renderEditableImportGrid } from '../shared/import-preview.js';
import { requestConfirmation, showToast } from '../shared/notifications.js';
import { loadFrameCatalog, switchCatalogSubtab } from './frames.js';

const CATALOGUE_FIELDS = [
  { key: 'prod_code', label: 'Product Code (prod_code)', required: true },
  { key: 'product_name', label: 'Frame Name', required: true },
  { key: 'brand_name', label: 'Brand', required: true },
  { key: 'category_name', label: 'Category', required: true },
  { key: 'shape_name', label: 'Shape', required: true },
  { key: 'material', label: 'Material', required: true },
  { key: 'frame_type', label: 'Frame Type', required: false },
  { key: 'frame_fit', label: 'Fit', required: true },
  { key: 'gender', label: 'Gender', required: false },
  { key: 'base_price_inr', label: 'Base Price (₹)', required: true },
  { key: 'description', label: 'Description', required: false },
  { key: 'color_name', label: 'Colour Name', required: true },
  { key: 'price_override_inr', label: 'Variant Price (₹)', required: false },
  { key: 'opening_stock', label: 'Opening Stock', required: false },
  { key: 'lens_width_mm', label: 'Lens Width (mm)', required: true },
  { key: 'bridge_width_mm', label: 'Bridge Width (mm)', required: true },
  { key: 'temple_length_mm', label: 'Temple Length (mm)', required: true },
  { key: 'frame_height_mm', label: 'Frame Height (mm)', required: false },
  { key: 'total_width_mm', label: 'Total Width (mm)', required: false }
];

const importState = {
  step: 1,
  sourceType: 'csv',
  sourceName: '',
  rawHeaders: [],
  rawRows: [],
  mapping: {},
  mappedRows: [],
  searchTerm: '',
  validation: null,
  lastBatchResult: null,
  idempotencyKey: null
};

export function initCatalogueImportEvents() {
  const dropzone = document.getElementById('cat-import-dropzone');
  const fileInput = document.getElementById('cat-import-file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      if (e.dataTransfer?.files?.[0]) {
        handleCatalogueCsvFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files?.[0]) {
        handleCatalogueCsvFile(e.target.files[0]);
      }
    });
  }
}

export function resetCatalogueImport() {
  importState.step = 1;
  importState.rawHeaders = [];
  importState.rawRows = [];
  importState.mapping = {};
  importState.mappedRows = [];
  importState.validation = null;
  importState.lastBatchResult = null;
  importState.idempotencyKey = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const pasteEl = document.getElementById('cat-import-paste-input');
  if (pasteEl) pasteEl.value = '';
  renderCatalogueWizardState();
}

export async function downloadCatalogueTemplate() {
  try {
    await downloadAuthenticatedCsv(
      '/imports/catalogue/template',
      'vision_opticals_catalogue_blank_template.csv'
    );
  } catch (err) {
    showToast(err.message || 'Failed to download template.', 'error');
  }
}

function handleCatalogueCsvFile(file) {
  if (file.size > 2 * 1024 * 1024) {
    showToast('CSV file exceeds 2 MB limit.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    loadParsedCatalogueInput(String(reader.result || ''), 'csv', file.name);
  };
  reader.readAsText(file, 'UTF-8');
}

export function parsePastedCatalogueRows() {
  const pasteEl = document.getElementById('cat-import-paste-input');
  const rawText = pasteEl ? pasteEl.value : '';
  if (!rawText.trim()) {
    showToast('Paste CSV or tab-separated Excel/Google Sheets rows first.', 'error');
    return;
  }
  loadParsedCatalogueInput(rawText, 'paste', 'excel_sheets_paste');
}

function loadParsedCatalogueInput(rawText, sourceType, sourceName) {
  const parsed = parseSpreadsheet(rawText);
  if (parsed.parseErrors.length > 0) {
    showToast(parsed.parseErrors[0], 'error');
    return;
  }
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    showToast('Spreadsheet must include a header row and at least one data row.', 'error');
    return;
  }

  importState.sourceType = sourceType;
  importState.sourceName = sourceName;
  importState.rawHeaders = parsed.headers;
  importState.rawRows = parsed.rows;
  importState.mapping = autoMapHeaders(parsed.headers, CATALOGUE_FIELDS);
  importState.validation = null;
  importState.lastBatchResult = null;
  importState.idempotencyKey = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  importState.step = 2;
  renderCatalogueWizardState();
}

export function setCatalogueStep(stepNumber) {
  importState.step = stepNumber;
  renderCatalogueWizardState();
}

function renderCatalogueWizardState() {
  document.querySelectorAll('[data-cat-step-pill]').forEach(pill => {
    const num = Number(pill.dataset.catStepPill);
    pill.classList.toggle('active', num === importState.step);
    pill.classList.toggle('done', num < importState.step);
  });

  document.querySelectorAll('[data-cat-step-pane]').forEach(pane => {
    pane.style.display = Number(pane.dataset.catStepPane) === importState.step ? 'block' : 'none';
  });

  if (importState.step === 2) renderColumnMappingStep();
  if (importState.step === 3) renderPreviewStep();
  if (importState.step === 4) renderConfirmAndResultStep();
}

function renderColumnMappingStep() {
  const container = document.getElementById('cat-mapping-grid');
  if (!container) return;

  const headerOptions = `<option value="-1">— Unmapped —</option>` +
    importState.rawHeaders.map((h, idx) => `<option value="${idx}">${escapeHtml(h)}</option>`).join('');

  container.innerHTML = CATALOGUE_FIELDS.map(field => {
    const selectedIdx = importState.mapping[field.key] ?? -1;
    const isUnmappedRequired = field.required && selectedIdx === -1;
    return `
      <div class="mapping-field-card" style="${isUnmappedRequired ? 'border-color:#b91c1c;background:#fef2f2;' : ''}">
        <label class="form-label" style="display:block;margin-bottom:6px;">
          ${escapeHtml(field.label)} ${field.required ? '<span style="color:#991b1b;">*</span>' : ''}
        </label>
        <select class="form-control" data-map-field="${escapeHtml(field.key)}" style="height:34px;font-size:12px;">
          ${headerOptions}
        </select>
      </div>
    `;
  }).join('');

  CATALOGUE_FIELDS.forEach(field => {
    const sel = container.querySelector(`[data-map-field="${field.key}"]`);
    if (sel) {
      sel.value = String(importState.mapping[field.key] ?? -1);
      sel.addEventListener('change', (ev) => {
        importState.mapping[field.key] = Number(ev.target.value);
        renderColumnMappingStep();
      });
    }
  });
}

export async function applyMappingAndValidate() {
  importState.mappedRows = buildMappedRows(importState.rawRows, importState.mapping, CATALOGUE_FIELDS);
  importState.step = 3;
  renderCatalogueWizardState();
  await validateCatalogueImport();
}

export async function validateCatalogueImport() {
  if (importState.mappedRows.length === 0) {
    showToast('Add at least one row before validating.', 'error');
    return;
  }

  try {
    const apiResponse = await apiRequest('/imports/catalogue/validate', {
      method: 'POST',
      body: {
        source_type: importState.sourceType,
        source_name: importState.sourceName || 'spreadsheet',
        rows: importState.mappedRows
      }
    });
    importState.validation = apiResponse;
    renderPreviewStep();
  } catch (err) {
    showToast(err.message || 'Validation request failed.', 'error');
  }
}

export function addBlankCatalogueRow() {
  const nextNum = importState.mappedRows.length
    ? Math.max(...importState.mappedRows.map(r => r.rowNumber || 2)) + 1
    : 2;
  const blank = { rowNumber: nextNum };
  CATALOGUE_FIELDS.forEach(f => {
    blank[f.key] = f.key === 'opening_stock' ? '0' : (f.key === 'gender' ? 'unisex' : '');
  });
  importState.mappedRows.push(blank);
  importState.validation = null;
  renderPreviewStep();
}

export function filterCataloguePreview(term) {
  importState.searchTerm = term;
  renderPreviewStep();
}

function renderPreviewStep() {
  const summaryEl = document.getElementById('cat-preview-summary');
  const gridEl = document.getElementById('cat-preview-grid');
  const errorsEl = document.getElementById('cat-preview-errors');
  const nextBtn = document.getElementById('btn-cat-proceed-confirm');

  const val = importState.validation;
  const errors = val?.errors || [];
  const summary = val?.summary || {
    total_rows: importState.mappedRows.length,
    frames_detected: new Set(importState.mappedRows.map(r => r.prod_code || r.master_sku).filter(Boolean)).size,
    variants_detected: importState.mappedRows.length,
    valid_rows: 0,
    warning_count: 0,
    blocking_error_count: 0
  };

  if (summaryEl) {
    summaryEl.innerHTML = `
      <span class="summary-chip">Total Rows: <strong>${summary.total_rows}</strong></span>
      <span class="summary-chip">Frames Detected: <strong>${summary.frames_detected}</strong></span>
      <span class="summary-chip">Variants Detected: <strong>${summary.variants_detected}</strong></span>
      <span class="summary-chip ok">Valid Rows: <strong>${summary.valid_rows}</strong></span>
      <span class="summary-chip warn">Warnings: <strong>${summary.warning_count}</strong></span>
      <span class="summary-chip ${summary.blocking_error_count > 0 ? 'err' : 'ok'}">Blocking Errors: <strong>${summary.blocking_error_count}</strong></span>
    `;
  }

  const errorsByRow = new Map();
  errors.forEach(err => {
    if (!errorsByRow.has(err.row_number)) errorsByRow.set(err.row_number, []);
    errorsByRow.get(err.row_number).push(err);
  });

  if (errorsEl) {
    if (errors.length === 0) {
      errorsEl.innerHTML = val
        ? `<div class="summary-chip ok" style="margin-bottom:10px;">All rows passed validation. Ready to confirm import.</div>`
        : `<div class="summary-chip warn" style="margin-bottom:10px;">Click "Validate Rows" after editing cells.</div>`;
    } else {
      errorsEl.innerHTML = `
        <div class="error-list-box" style="margin-bottom:10px;">
          <strong>Blocking Validation Errors (${errors.length}):</strong>
          ${errors.map(e => `<div>• ${escapeHtml(e.error_message)}</div>`).join('')}
        </div>
      `;
    }
  }

  if (nextBtn) {
    nextBtn.disabled = !(val && val.valid);
  }

  renderEditableImportGrid({
    container: gridEl,
    columns: CATALOGUE_FIELDS,
    rows: importState.mappedRows,
    searchTerm: importState.searchTerm,
    errorsByRow,
    onCellChange: (rowIdx, field, newValue) => {
      importState.mappedRows[rowIdx][field] = newValue;
      importState.validation = null;
      const btn = document.getElementById('btn-cat-proceed-confirm');
      if (btn) btn.disabled = true;
      const errBox = document.getElementById('cat-preview-errors');
      if (errBox) errBox.innerHTML = '<div class="summary-chip warn" style="margin-bottom:10px;">Edits detected — click "Validate Rows" before confirming import.</div>';
    },
    onDeleteRow: (rowIdx) => {
      importState.mappedRows.splice(rowIdx, 1);
      importState.validation = null;
      renderPreviewStep();
    }
  });
}

function renderConfirmAndResultStep() {
  const box = document.getElementById('cat-confirm-summary-box');
  if (!box) return;

  if (importState.lastBatchResult) {
    const b = importState.lastBatchResult.batch;
    box.innerHTML = `
      <div class="summary-chip ok" style="display:inline-block;margin-bottom:12px;">Import Batch ${escapeHtml(b.batch_number)} Completed</div>
      <div class="form-section-box">
        <div><strong>Frames Created:</strong> ${b.frames_created}</div>
        <div><strong>Variants Created:</strong> ${b.variants_created}</div>
        <div><strong>Total Rows Processed:</strong> ${b.total_rows}</div>
        <div><strong>Failed / Skipped Rows:</strong> ${b.failed_rows || 0}</div>
        <div><strong>Administrator:</strong> ${escapeHtml(b.username)}</div>
        <div><strong>Timestamp:</strong> ${escapeHtml(formatDateTime(b.created_at))}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn-primary" onclick="OptiiAdmin.switchCatalogSubtab('catalog'); OptiiAdmin.loadProducts();">Return to Catalogue</button>
        <button type="button" class="btn-secondary" onclick="OptiiAdmin.switchCatalogSubtab('history'); OptiiAdmin.loadCatalogueImportHistory();">View Import History</button>
        <button type="button" class="btn-secondary" onclick="OptiiAdmin.resetCatalogueImport();">Start Another Import</button>
      </div>
    `;
    return;
  }

  const summary = importState.validation?.summary || {};
  box.innerHTML = `
    <div class="form-section-box">
      <h4 class="form-section-heading">Confirm Bulk Catalogue Creation</h4>
      <p style="font-size:13px;color:var(--ink-secondary);margin-bottom:10px;">
        This operation creates new master frames and colour variants in a single atomic transaction. Existing SKUs are never overwritten.
      </p>
      <div class="metrics-grid-4">
        <div class="metric-card"><div class="metric-label">Master Frames</div><div class="metric-value">${summary.frames_detected || 0}</div></div>
        <div class="metric-card"><div class="metric-label">Colour Variants</div><div class="metric-value">${summary.variants_detected || 0}</div></div>
        <div class="metric-card"><div class="metric-label">Opening Stock Rows</div><div class="metric-value">${summary.opening_stock_records || 0}</div></div>
        <div class="metric-card"><div class="metric-label">Blocking Conflicts</div><div class="metric-value">${summary.blocking_error_count || 0}</div></div>
      </div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn-secondary" onclick="OptiiAdmin.setCatalogueStep(3)">Back to Preview</button>
        <button type="button" class="btn-primary" id="btn-commit-catalogue-import">Confirm & Commit Import</button>
      </div>
    </div>
  `;

  document.getElementById('btn-commit-catalogue-import')?.addEventListener('click', commitCatalogueImport);
}

export async function commitCatalogueImport() {
  const confirmed = await requestConfirmation({
    title: 'Commit Catalogue Import',
    message: `Create ${importState.validation?.summary?.frames_detected || 0} master frame(s) and ${importState.validation?.summary?.variants_detected || 0} variant(s)?`,
    confirmLabel: 'Commit Import'
  });
  if (!confirmed) return;

  const btn = document.getElementById('btn-commit-catalogue-import');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Importing…';
  }

  try {
    const res = await apiRequest('/imports/catalogue/commit', {
      method: 'POST',
      body: {
        source_type: importState.sourceType,
        source_name: importState.sourceName || 'catalogue_import',
        idempotency_key: importState.idempotencyKey,
        rows: importState.mappedRows
      }
    });

    if (res.success) {
      importState.lastBatchResult = res;
      showToast(res.message || 'Catalogue imported successfully.', 'success');
      renderConfirmAndResultStep();
      loadFrameCatalog();
    }
  } catch (err) {
    showToast(err.message || 'Catalogue import commit failed.', 'error');
    if (err.data?.validation) {
      importState.validation = {
        valid: false,
        ...err.data.validation
      };
      importState.step = 3;
      renderCatalogueWizardState();
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Confirm & Commit Import';
    }
  }
}

export async function loadCatalogueImportHistory() {
  const tbody = document.getElementById('cat-import-history-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box">Loading import history…</td></tr>';
  try {
    const res = await apiRequest('/imports/history?import_type=catalogue');
    const batches = res.batches || [];
    if (batches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box">No catalogue imports recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = batches.map(batch => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(batch.batch_number)}</span></td>
        <td>${escapeHtml(batch.source_name || batch.source_type)}</td>
        <td>${escapeHtml(formatDateTime(batch.created_at))}</td>
        <td>${escapeHtml(batch.username)}</td>
        <td>${batch.total_rows}</td>
        <td>${batch.frames_created} frames / ${batch.variants_created} variants</td>
        <td>${batch.failed_rows}</td>
        <td><span class="badge-status ${batch.status === 'completed' ? 'active' : 'out_of_stock'}">${escapeHtml(batch.status.replace(/_/g, ' '))}</span></td>
        <td>
          ${batch.failed_rows > 0
            ? `<button type="button" class="btn-secondary btn-sm" onclick="OptiiAdmin.downloadImportErrorReport('${escapeHtml(batch.batch_number)}')">Download Error CSV</button>`
            : '<span style="font-size:12px;color:var(--ink-secondary);">No errors</span>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box" style="color:#991b1b;">Error loading import history.</td></tr>';
  }
}

export async function downloadImportErrorReport(batchIdOrNumber) {
  try {
    await downloadAuthenticatedCsv(`/imports/${encodeURIComponent(batchIdOrNumber)}/report`, `${batchIdOrNumber}_errors.csv`);
  } catch (err) {
    showToast(err.message || 'Failed to download error report.', 'error');
  }
}

export { switchCatalogSubtab };
