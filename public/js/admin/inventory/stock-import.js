/**
 * Optii Admin — Bulk Stock Count Import Workflow (Stale-Stock Protected & All-or-Nothing)
 */

import { adminState } from '../core/state.js';
import { apiRequest, downloadAuthenticatedCsv } from '../core/api-client.js';
import { escapeHtml, formatDateTime } from '../shared/formatters.js';
import { autoMapHeaders, buildMappedRows, parseSpreadsheet } from '../shared/csv-parser.js';
import { renderEditableImportGrid } from '../shared/import-preview.js';
import { requestConfirmation, showToast } from '../shared/notifications.js';
import { loadInventoryItems, switchInventorySubtab } from './inventory.js';

const STOCK_FIELDS = [
  { key: 'variant_sku', label: 'Variant SKU', required: true },
  { key: 'product_name', label: 'Frame', required: false },
  { key: 'color_name', label: 'Colour', required: false },
  { key: 'expected_current_quantity', label: 'Previous Stock', required: true },
  { key: 'counted_quantity', label: 'Counted Stock', required: true },
  { key: 'reason', label: 'Reason', required: false }
];

const stockImportState = {
  sourceType: 'csv',
  sourceName: '',
  rows: [],
  searchTerm: '',
  validation: null,
  lastBatchResult: null,
  idempotencyKey: null
};

export function initStockImportEvents() {
  const dropzone = document.getElementById('stk-import-dropzone');
  const fileInput = document.getElementById('stk-import-file-input');

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
        handleStockCsvFile(e.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files?.[0]) {
        handleStockCsvFile(e.target.files[0]);
      }
    });
  }
}

export async function downloadStockCountSheet() {
  const f = adminState.inventoryFilters;
  const params = new URLSearchParams({
    search: f.search || '',
    brand_id: f.brand_id || '',
    category_id: f.category_id || '',
    stock_status: f.stock_status || 'all'
  });

  try {
    await downloadAuthenticatedCsv(`/imports/inventory/template?${params.toString()}`, 'optii_stock_count_sheet.csv');
    showToast('Downloaded stock count sheet with live DB quantities.', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to download stock count sheet.', 'error');
  }
}

function handleStockCsvFile(file) {
  if (file.size > 2 * 1024 * 1024) {
    showToast('CSV file exceeds 2 MB limit.', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    loadParsedStockInput(String(reader.result || ''), 'csv', file.name);
  };
  reader.readAsText(file, 'UTF-8');
}

export function parsePastedStockRows() {
  const pasteEl = document.getElementById('stk-import-paste-input');
  const rawText = pasteEl ? pasteEl.value : '';
  if (!rawText.trim()) {
    showToast('Paste stock count rows from Excel or Google Sheets first.', 'error');
    return;
  }
  loadParsedStockInput(rawText, 'paste', 'excel_stock_paste');
}

async function loadParsedStockInput(rawText, sourceType, sourceName) {
  const parsed = parseSpreadsheet(rawText);
  if (parsed.parseErrors.length > 0) {
    showToast(parsed.parseErrors[0], 'error');
    return;
  }
  if (parsed.headers.length === 0 || parsed.rows.length === 0) {
    showToast('Spreadsheet must include a header row and at least one stock count row.', 'error');
    return;
  }

  const mapping = autoMapHeaders(parsed.headers, STOCK_FIELDS);
  stockImportState.sourceType = sourceType;
  stockImportState.sourceName = sourceName;
  stockImportState.rows = buildMappedRows(parsed.rows, mapping, STOCK_FIELDS);
  stockImportState.validation = null;
  stockImportState.lastBatchResult = null;
  stockImportState.idempotencyKey = `stk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await validateStockCountImport();
}

export async function validateStockCountImport() {
  if (stockImportState.rows.length === 0) {
    showToast('Upload or paste stock count rows first.', 'error');
    return;
  }

  try {
    const res = await apiRequest('/imports/inventory/validate', {
      method: 'POST',
      body: {
        source_type: stockImportState.sourceType,
        source_name: stockImportState.sourceName || 'stock_count_sheet',
        rows: stockImportState.rows
      }
    });
    stockImportState.validation = res;
    renderStockImportPreview();
  } catch (err) {
    showToast(err.message || 'Stock validation failed.', 'error');
  }
}

export function addBlankStockCountRow() {
  const nextNum = stockImportState.rows.length
    ? Math.max(...stockImportState.rows.map(r => r.rowNumber || 2)) + 1
    : 2;
  stockImportState.rows.push({
    rowNumber: nextNum,
    variant_sku: '',
    product_name: '',
    color_name: '',
    expected_current_quantity: '',
    counted_quantity: '',
    reason: 'Physical stock count'
  });
  stockImportState.validation = null;
  renderStockImportPreview();
}

export function renderStockImportPreview() {
  const sectionEl = document.getElementById('stk-preview-workspace');
  const summaryEl = document.getElementById('stk-preview-summary');
  const errorsEl = document.getElementById('stk-preview-errors');
  const editGridEl = document.getElementById('stk-editable-grid');
  const diffTableEl = document.getElementById('stk-diff-preview-body');
  const commitBtn = document.getElementById('btn-commit-stock-import');

  if (sectionEl) sectionEl.style.display = stockImportState.rows.length ? 'block' : 'none';

  const val = stockImportState.validation;
  const summary = val?.summary || {
    total_skus: stockImportState.rows.length,
    increases: 0,
    decreases: 0,
    unchanged: 0,
    invalid_records: 0,
    stale_conflicts: 0
  };
  const errors = val?.errors || [];

  if (summaryEl) {
    summaryEl.innerHTML = `
      <span class="summary-chip">Total SKUs: <strong>${summary.total_skus}</strong></span>
      <span class="summary-chip ok">Increases: <strong>${summary.increases}</strong></span>
      <span class="summary-chip warn">Decreases: <strong>${summary.decreases}</strong></span>
      <span class="summary-chip">Unchanged: <strong>${summary.unchanged}</strong></span>
      <span class="summary-chip ${summary.invalid_records > 0 ? 'err' : 'ok'}">Invalid: <strong>${summary.invalid_records}</strong></span>
      <span class="summary-chip ${summary.stale_conflicts > 0 ? 'err' : 'ok'}">Stale Conflicts: <strong>${summary.stale_conflicts}</strong></span>
    `;
  }

  if (errorsEl) {
    if (errors.length === 0) {
      errorsEl.innerHTML = val
        ? `<div class="summary-chip ok" style="margin-bottom:10px;">All rows passed live stock & stale-quantity checks. Ready to commit.</div>`
        : `<div class="summary-chip warn" style="margin-bottom:10px;">Click "Validate Stock Sheet" after editing cells.</div>`;
    } else {
      errorsEl.innerHTML = `
        <div class="error-list-box" style="margin-bottom:10px;">
          <strong>Blocking Validation / Stale Stock Errors (${errors.length}):</strong>
          ${errors.map(e => `<div>• ${escapeHtml(e.error_message)}</div>`).join('')}
        </div>
      `;
    }
  }

  const errorsByRow = new Map();
  errors.forEach(err => {
    if (!errorsByRow.has(err.row_number)) errorsByRow.set(err.row_number, []);
    errorsByRow.get(err.row_number).push(err);
  });

  renderEditableImportGrid({
    container: editGridEl,
    columns: STOCK_FIELDS,
    rows: stockImportState.rows,
    searchTerm: stockImportState.searchTerm,
    errorsByRow,
    onCellChange: (rowIdx, field, valStr) => {
      stockImportState.rows[rowIdx][field] = valStr;
      stockImportState.validation = null;
    },
    onDeleteRow: (rowIdx) => {
      stockImportState.rows.splice(rowIdx, 1);
      stockImportState.validation = null;
      renderStockImportPreview();
    }
  });

  if (diffTableEl) {
    const previewRows = val?.rows || [];
    if (previewRows.length === 0) {
      diffTableEl.innerHTML = '<tr><td colspan="5" class="empty-state-box">Run validation to inspect previous vs counted stock differences.</td></tr>';
    } else {
      diffTableEl.innerHTML = previewRows.map(r => {
        const diffText = r.difference === null ? '—' : `${r.difference > 0 ? '+' : ''}${r.difference}`;
        let badgeCls = 'archived';
        if (r.result === 'Increase') badgeCls = 'in_stock';
        else if (r.result === 'Decrease') badgeCls = 'low_stock';
        else if (r.result === 'Invalid' || r.result === 'Stale Conflict') badgeCls = 'out_of_stock';

        return `
          <tr>
            <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(r.variant_sku)}</span></td>
            <td>${r.database_quantity !== null ? r.database_quantity : '—'}</td>
            <td><strong>${r.counted_quantity !== null ? r.counted_quantity : '—'}</strong></td>
            <td style="font-weight:700;">${diffText}</td>
            <td><span class="badge-status ${badgeCls}">${escapeHtml(r.result)}</span></td>
          </tr>
        `;
      }).join('');
    }
  }

  if (commitBtn) {
    commitBtn.disabled = !(val && val.valid);
  }
}

export async function commitStockCountImport() {
  const val = stockImportState.validation;
  if (!val || !val.valid) {
    showToast('Resolve all validation errors before committing.', 'error');
    return;
  }

  const confirmed = await requestConfirmation({
    title: 'Commit All-or-Nothing Stock Count',
    message: `Apply updates for ${val.summary.increases + val.summary.decreases} SKU(s) (${val.summary.unchanged} unchanged)? If any stock changed concurrently, the entire batch rolls back.`,
    confirmLabel: 'Commit Stock Updates'
  });
  if (!confirmed) return;

  const commitBtn = document.getElementById('btn-commit-stock-import');
  if (commitBtn) {
    commitBtn.disabled = true;
    commitBtn.textContent = 'Synchronizing…';
  }

  try {
    const res = await apiRequest('/imports/inventory/commit', {
      method: 'POST',
      body: {
        source_type: stockImportState.sourceType,
        source_name: stockImportState.sourceName || 'stock_count_sheet',
        idempotency_key: stockImportState.idempotencyKey,
        rows: stockImportState.rows
      }
    });

    if (res.success) {
      stockImportState.lastBatchResult = res;
      showToast(res.message || 'Stock count synchronized.', 'success');
      const bannerEl = document.getElementById('stk-commit-result-banner');
      if (bannerEl) {
        bannerEl.style.display = 'block';
        bannerEl.innerHTML = `
          <div class="summary-chip ok">
            Batch <strong>${escapeHtml(res.batch.batch_number)}</strong> committed:
            ${res.batch.records_updated} updated, ${res.batch.records_unchanged} unchanged.
          </div>
        `;
      }
      loadInventoryItems();
      loadStockImportHistory();
    }
  } catch (err) {
    showToast(err.message || 'Stock count commit failed.', 'error');
    if (err.data?.validation) {
      stockImportState.validation = {
        valid: false,
        has_stale_conflicts: err.data.error_code === 'STALE_STOCK_CONFLICT',
        ...err.data.validation
      };
      renderStockImportPreview();
      loadStockImportHistory();
    }
  } finally {
    if (commitBtn) {
      commitBtn.disabled = false;
      commitBtn.textContent = 'Commit Stock Count Batch';
    }
  }
}

export async function loadStockImportHistory() {
  const tbody = document.getElementById('stk-import-history-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box">Loading stock import history…</td></tr>';

  try {
    const res = await apiRequest('/imports/history?import_type=stock_count');
    const batches = res.batches || [];
    if (batches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box">No stock count batches recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = batches.map(batch => `
      <tr>
        <td><span style="font-family:var(--font-mono);font-weight:700;">${escapeHtml(batch.batch_number)}</span></td>
        <td>${escapeHtml(batch.source_name || batch.source_type)}</td>
        <td>${escapeHtml(formatDateTime(batch.created_at))}</td>
        <td>${escapeHtml(batch.username)}</td>
        <td>${batch.total_rows}</td>
        <td>${batch.records_updated} updated / ${batch.records_unchanged} unchanged</td>
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
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state-box" style="color:#991b1b;">Error loading stock import history.</td></tr>';
  }
}

export { switchInventorySubtab };
