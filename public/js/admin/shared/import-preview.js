/**
 * Optii Admin — Reusable Editable Spreadsheet Preview Grid Component
 */

import { escapeHtml } from './formatters.js';

export function renderEditableImportGrid({
  container,
  columns,
  rows,
  searchTerm = '',
  errorsByRow = new Map(),
  onCellChange,
  onDeleteRow
}) {
  if (!container) return;

  const query = String(searchTerm || '').trim().toLowerCase();
  const indexedRows = rows.map((rowData, originalIndex) => ({ rowData, originalIndex }));
  const filteredRows = query
    ? indexedRows.filter(({ rowData }) =>
        columns.some(col => String(rowData[col.key] ?? '').toLowerCase().includes(query))
      )
    : indexedRows;

  if (filteredRows.length === 0) {
    container.innerHTML = `<div class="empty-state-box">No spreadsheet rows match the current filter.</div>`;
    return;
  }

  const headerHtml = columns.map(col => `
    <th>${escapeHtml(col.label)}${col.required ? ' *' : ''}</th>
  `).join('');

  const bodyHtml = filteredRows.map(({ rowData, originalIndex }) => {
    const rowNum = rowData.rowNumber || originalIndex + 2;
    const rowErrors = errorsByRow.get(rowNum) || [];
    const hasError = rowErrors.length > 0;
    const hasStale = rowErrors.some(err => err.is_stale);
    const errorFields = new Set(rowErrors.map(err => err.field_name));
    const rowClass = hasStale ? 'row-stale' : (hasError ? 'row-has-error' : '');

    const cellsHtml = columns.map(col => {
      const value = rowData[col.key] ?? '';
      const isFieldError = errorFields.has(col.key);
      if (col.readOnly) {
        return `<td><span>${escapeHtml(value)}</span></td>`;
      }
      return `
        <td>
          <input
            type="text"
            class="cell-input ${isFieldError ? 'cell-error' : ''}"
            data-row-index="${originalIndex}"
            data-field="${escapeHtml(col.key)}"
            value="${escapeHtml(value)}"
            aria-label="Row ${rowNum} ${escapeHtml(col.label)}"
          />
        </td>
      `;
    }).join('');

    const statusBadge = hasError
      ? `<span class="badge-status out_of_stock" title="${escapeHtml(rowErrors.map(e => e.error_message).join(' | '))}">${rowErrors.length} error(s)</span>`
      : `<span class="badge-status in_stock">Ready</span>`;

    return `
      <tr class="${rowClass}">
        <td style="font-family:var(--font-mono);color:var(--ink-secondary);text-align:center;">${rowNum}</td>
        <td>${statusBadge}</td>
        ${cellsHtml}
        <td>
          <button type="button" class="btn-danger btn-sm" data-delete-row="${originalIndex}" title="Remove row">Remove</button>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="preview-grid-scroll">
      <table class="spreadsheet-table">
        <thead>
          <tr>
            <th>Row</th>
            <th>Validation</th>
            ${headerHtml}
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${bodyHtml}
        </tbody>
      </table>
    </div>
  `;

  container.querySelectorAll('.cell-input').forEach(inputEl => {
    inputEl.addEventListener('change', (event) => {
      const idx = Number(event.target.dataset.rowIndex);
      const field = event.target.dataset.field;
      if (typeof onCellChange === 'function') {
        onCellChange(idx, field, event.target.value);
      }
    });
  });

  container.querySelectorAll('[data-delete-row]').forEach(btn => {
    btn.addEventListener('click', (event) => {
      const idx = Number(event.currentTarget.dataset.deleteRow);
      if (typeof onDeleteRow === 'function') {
        onDeleteRow(idx);
      }
    });
  });
}
