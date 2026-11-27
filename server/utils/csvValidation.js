/**
 * ═════════════════════════════════════════════════════════════════════
 * OPTII OPTICAL PLATFORM — RFC 4180 CSV & EXCEL TSV PARSER / ESCAPER
 * Supports UTF-8 BOM, CRLF/LF, quoted commas, escaped quotes, & TSV paste
 * ═════════════════════════════════════════════════════════════════════
 */

function stripUtf8Bom(text) {
  if (typeof text !== 'string') return '';
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

/**
 * Detect whether pasted/uploaded spreadsheet text uses tabs (TSV from Excel/Sheets) or commas (CSV).
 */
function detectDelimiter(text) {
  const clean = stripUtf8Bom(text);
  const firstLineEnd = clean.search(/\r?\n/);
  const firstLine = firstLineEnd === -1 ? clean : clean.slice(0, firstLineEnd);
  let inQuotes = false;
  let tabs = 0;
  let commas = 0;
  for (let i = 0; i < firstLine.length; i++) {
    const ch = firstLine[i];
    if (ch === '"') {
      if (inQuotes && firstLine[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      if (ch === '\t') tabs++;
      else if (ch === ',') commas++;
    }
  }
  return tabs > commas ? '\t' : ',';
}

/**
 * Parse CSV or TSV text into { headers, rows, delimiter, parseErrors }.
 */
function parseSpreadsheetText(rawText, forcedDelimiter = null) {
  const text = stripUtf8Bom(String(rawText || ''));
  if (!text.trim()) {
    return { headers: [], rows: [], delimiter: ',', parseErrors: ['Spreadsheet content is empty.'] };
  }

  const delimiter = forcedDelimiter || detectDelimiter(text);
  const matrix = [];
  const parseErrors = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let currentLine = 1;

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
        if (ch === '\n') currentLine++;
        field += ch;
      }
    } else {
      if (ch === '"') {
        if (field.length > 0) {
          parseErrors.push(`Line ${currentLine}: Unexpected quote inside unquoted field.`);
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
        currentLine++;
      } else if (ch === '\n') {
        row.push(field.trim());
        if (row.some(cell => cell !== '')) matrix.push(row);
        row = [];
        field = '';
        currentLine++;
      } else {
        field += ch;
      }
    }
  }

  if (inQuotes) {
    parseErrors.push('Malformed CSV: Unclosed quotation mark reached end of file.');
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

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvContent(headers, rows) {
  const headerLine = headers.map(csvEscape).join(',');
  const bodyLines = rows.map(r => r.map(csvEscape).join(','));
  return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
}

module.exports = {
  stripUtf8Bom,
  detectDelimiter,
  parseSpreadsheetText,
  csvEscape,
  buildCsvContent
};
