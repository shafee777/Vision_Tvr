/**
 * Optii Admin — Browser CSV & Excel/Google Sheets TSV Parser + Column Auto-Mapper
 */

export function stripBom(text) {
  if (!text) return '';
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

export function detectSpreadsheetDelimiter(rawText) {
  const clean = stripBom(rawText);
  const firstEnd = clean.search(/\r?\n/);
  const firstLine = firstEnd === -1 ? clean : clean.slice(0, firstEnd);
  let inQuotes = false;
  let tabs = 0;
  let commas = 0;

  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') i++;
      else inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === '\t') tabs++;
      else if (ch === ',') commas++;
    }
  }
  return tabs > commas ? '\t' : ',';
}

export function parseSpreadsheet(rawText) {
  const text = stripBom(String(rawText || ''));
  if (!text.trim()) {
    return { headers: [], rows: [], delimiter: ',', parseErrors: ['Input is empty.'] };
  }

  const delimiter = detectSpreadsheetDelimiter(text);
  const matrix = [];
  const parseErrors = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let lineNum = 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') lineNum++;
        field += ch;
      }
    } else if (ch === '"') {
      if (field.length > 0) {
        parseErrors.push(`Line ${lineNum}: Unexpected quote inside unquoted value.`);
      }
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some(cell => cell !== '')) matrix.push(row);
      row = [];
      field = '';
      lineNum++;
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some(cell => cell !== '')) matrix.push(row);
      row = [];
      field = '';
      lineNum++;
    } else {
      field += ch;
    }
  }

  if (inQuotes) {
    parseErrors.push('Malformed CSV: Unclosed quote reached end of input.');
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some(cell => cell !== '')) matrix.push(row);
  }

  if (matrix.length === 0) {
    return { headers: [], rows: [], delimiter, parseErrors: parseErrors.length ? parseErrors : ['No rows found.'] };
  }

  const headers = matrix[0].map(h => h.trim());
  const rows = matrix.slice(1).map((cells, idx) => ({
    rowNumber: idx + 2,
    cells
  }));

  return { headers, rows, delimiter, parseErrors };
}

export function normalizeHeaderKey(header) {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^_|_$)+/g, '');
}

const ALIASES = {
  prod_code: ['prod_code', 'product_code', 'master_sku', 'frame_sku', 'parent_sku', 'product_sku'],
  master_sku: ['master_sku', 'prod_code', 'product_code', 'frame_sku', 'parent_sku', 'product_sku'],
  product_name: ['product_name', 'frame_name', 'title', 'name'],
  product_slug: ['product_slug', 'slug', 'url_slug'],
  description: ['description', 'details', 'notes'],
  brand_name: ['brand_name', 'brand'],
  shape_name: ['shape_name', 'shape', 'frame_shape'],
  category_name: ['category_name', 'category'],
  base_price_inr: ['base_price_inr', 'selling_price', 'price', 'base_price', 'retail_price', 'mrp'],
  gender: ['gender', 'target_gender'],
  material: ['material', 'frame_material'],
  frame_fit: ['frame_fit', 'fit', 'size_fit'],
  frame_type: ['frame_type', 'rim_type', 'construction'],
  lens_width_mm: ['lens_width_mm', 'lens_width'],
  bridge_width_mm: ['bridge_width_mm', 'bridge_width', 'bridge'],
  temple_length_mm: ['temple_length_mm', 'temple_length', 'temple'],
  frame_height_mm: ['frame_height_mm', 'frame_height', 'lens_height_mm'],
  total_width_mm: ['total_width_mm', 'total_width', 'frame_width_mm'],
  variant_sku: ['variant_sku', 'sku', 'color_sku', 'colour_sku'],
  color_name: ['color_name', 'frame_color', 'frame_colour', 'colour_name', 'color', 'colour', 'colorway'],
  color_hex: ['color_hex', 'color_code', 'colour_code', 'colour_hex', 'hex'],
  color_secondary_hex: ['color_secondary_hex', 'secondary_hex'],
  price_override_inr: ['price_override_inr', 'variant_price', 'price_override'],
  opening_stock: ['opening_stock', 'stock_quantity', 'stock', 'initial_stock', 'qty'],
  is_default: ['is_default', 'default'],
  status: ['status', 'is_active', 'active'],
  expected_current_quantity: ['expected_current_quantity', 'expected_stock', 'expected_qty', 'current_stock', 'previous_stock'],
  counted_quantity: ['counted_quantity', 'counted_stock', 'counted_qty', 'new_quantity', 'physical_count'],
  reason: ['reason', 'adjustment_reason', 'notes']
};

export function autoMapHeaders(sourceHeaders, targetFields) {
  const mapping = {};
  const normalizedSources = sourceHeaders.map((raw, idx) => ({
    index: idx,
    raw,
    norm: normalizeHeaderKey(raw)
  }));

  targetFields.forEach(field => {
    const candidates = ALIASES[field.key] || [field.key];
    const match = normalizedSources.find(src => candidates.includes(src.norm));
    mapping[field.key] = match ? match.index : -1;
  });

  return mapping;
}

export function buildMappedRows(parsedRows, mapping, targetFields) {
  return parsedRows.map((parsed, idx) => {
    const record = { rowNumber: parsed.rowNumber || idx + 2 };
    targetFields.forEach(field => {
      const colIndex = mapping[field.key];
      record[field.key] = (colIndex !== undefined && colIndex >= 0 && parsed.cells[colIndex] !== undefined)
        ? String(parsed.cells[colIndex]).trim()
        : '';
    });
    return record;
  });
}
