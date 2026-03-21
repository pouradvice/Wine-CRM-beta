// src/lib/depletionParser.ts
// Parses a CSV or Excel file into an array of row objects.
// Returns rows with normalized 'account_name' key.

export interface ParsedDepletionRow {
  account_name: string;
  [key: string]: unknown;
}

export interface ParseResult {
  rows: ParsedDepletionRow[];
  headers: string[];
  detectedAccountColumn: string | null;
  requiresColumnSelection: boolean;
}

const ACCOUNT_NAME_CANDIDATES = [
  'account name', 'account', 'customer name', 'customer', 'name',
];

export function detectAccountColumn(headers: string[]): string | null {
  const lower = headers.map(h => h.toLowerCase().trim());
  for (const candidate of ACCOUNT_NAME_CANDIDATES) {
    const idx = lower.indexOf(candidate);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

export function normalizeRows(
  rows: Record<string, unknown>[],
  accountColumn: string,
): ParsedDepletionRow[] {
  return rows
    .filter(r => r[accountColumn])
    .map(r => ({
      ...r,
      account_name: String(r[accountColumn]).trim(),
    }));
}

function parseCSVText(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return { headers: [], rows: [] };

  // Simple CSV parse — handle quoted fields
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    if (cells.every(c => c === '')) continue;
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ''; });
    rows.push(row);
  }
  return { headers, rows };
}

export async function parseDepletionFile(file: File): Promise<ParseResult> {
  const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls');

  let headers: string[];
  let rawRows: Record<string, unknown>[];

  if (isXlsx) {
    // Dynamic import to avoid SSR issues
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (sheetRows.length === 0) {
      return { rows: [], headers: [], detectedAccountColumn: null, requiresColumnSelection: false };
    }
    headers = Object.keys(sheetRows[0]);
    rawRows = sheetRows;
  } else {
    // CSV
    const text = await file.text();
    const parsed = parseCSVText(text);
    headers = parsed.headers;
    rawRows = parsed.rows;
  }

  const detectedAccountColumn = detectAccountColumn(headers);
  const requiresColumnSelection = detectedAccountColumn === null;

  const rows = detectedAccountColumn
    ? normalizeRows(rawRows, detectedAccountColumn)
    : rawRows.map(r => ({ ...r, account_name: '' }));

  return { rows, headers, detectedAccountColumn, requiresColumnSelection };
}
