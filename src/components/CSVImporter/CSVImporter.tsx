'use client';

// src/components/CSVImporter/CSVImporter.tsx
// Three-step CSV import wizard: Upload → Map Columns → Review & Import

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './CSVImporter.module.css';

// ── Types ─────────────────────────────────────────────────────

export type ImportType = 'products' | 'clients';

interface SchemaField {
  key: string;
  label: string;
  required: boolean;
  notes?: string;
}

interface ParsedCSV {
  headers: string[];
  rows: string[][];
  skippedCount: number;
  delimiter: string;
}

type ColumnMap = Record<string, string>; // schemaKey → csvHeader | ''

interface ImportResult {
  succeeded: number;
  failed: Array<{ index: number; error: string }>;
}

// ── Schema definitions ────────────────────────────────────────

const PRODUCT_SCHEMA: SchemaField[] = [
  { key: 'sku_number',     label: 'SKU Number',       required: true  },
  { key: 'wine_name',      label: 'Wine Name',         required: true  },
  { key: 'type',           label: 'Type',              required: false },
  { key: 'varietal',       label: 'Varietal',          required: false },
  { key: 'country',        label: 'Country',           required: false },
  { key: 'region',         label: 'Region',            required: false },
  { key: 'appellation',    label: 'Appellation',       required: false },
  { key: 'vintage',        label: 'Vintage',           required: false },
  { key: 'distributor',    label: 'Distributor',       required: false },
  { key: 'btg_cost',       label: 'BTG Cost',          required: false, notes: 'Strip $' },
  { key: 'three_cs_cost',  label: '3CS Cost',          required: false, notes: 'Strip $' },
  { key: 'frontline_cost', label: 'Frontline Cost',    required: false, notes: 'Strip $' },
  { key: 'notes',          label: 'Notes',             required: false },
];

const CLIENT_SCHEMA: SchemaField[] = [
  { key: 'company_name',    label: 'Company Name',     required: true  },
  { key: 'type',            label: 'Type',             required: false },
  { key: 'value_tier',      label: 'Value Tier',       required: false },
  { key: 'phone',           label: 'Phone',            required: false },
  { key: 'email',           label: 'Email',            required: false },
  { key: 'address',         label: 'Address',          required: false },
  { key: 'commission_pct',  label: 'Commission %',     required: false, notes: 'Strip %' },
  { key: 'billback_pct',    label: 'Billback %',       required: false, notes: 'Strip %' },
  { key: 'contract_length', label: 'Contract Length',  required: false },
  { key: 'account_lead',    label: 'Account Lead / Contact', required: false },
  { key: 'status',          label: 'Status',           required: false },
  { key: 'notes',           label: 'Notes',            required: false },
];

// ── Fuzzy matching ────────────────────────────────────────────

const STRIP_WORDS = /\b(the|a|an|of|for|and|or)\b/g;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(STRIP_WORDS, '')
    .replace(/[\s_\-\.]+/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function fuzzyMatch(csvHeaders: string[], schemaKey: string, schemaLabel: string): string {
  const nKey   = normalize(schemaKey);
  const nLabel = normalize(schemaLabel);

  // Exact match on key or label first
  for (const h of csvHeaders) {
    const nh = normalize(h);
    if (nh === nKey || nh === nLabel) return h;
  }
  // Substring match
  for (const h of csvHeaders) {
    const nh = normalize(h);
    if (nh.includes(nKey) || nKey.includes(nh)) return h;
    if (nh.includes(nLabel) || nLabel.includes(nh)) return h;
  }
  return '';
}

// ── CSV parsing ───────────────────────────────────────────────

function detectDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs   = (firstLine.match(/\t/g) ?? []).length;
  return tabs > commas ? '\t' : ',';
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): ParsedCSV {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { headers: [], rows: [], skippedCount: 0, delimiter: ',' };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers   = parseCSVLine(lines[0], delimiter);
  const rows: string[][] = [];
  let skippedCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i], delimiter);
    if (cells.length !== headers.length) {
      skippedCount++;
    } else {
      rows.push(cells);
    }
  }

  return { headers, rows, skippedCount, delimiter };
}

// ── Value transformers ─────────────────────────────────────────

function stripCurrency(v: string): number | null {
  const cleaned = v.replace(/[$%,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function buildProductRow(
  csvRow: string[],
  headers: string[],
  mapping: ColumnMap,
  teamId: string,
): Record<string, unknown> {
  const get = (key: string): string => {
    const col = mapping[key];
    if (!col) return '';
    const idx = headers.indexOf(col);
    return idx >= 0 ? (csvRow[idx] ?? '').trim() : '';
  };

  const row: Record<string, unknown> = {
    team_id:   teamId,
    is_active: true,
  };

  const sku  = get('sku_number');
  const name = get('wine_name');
  if (!sku || !name) return {};

  row.sku_number     = sku;
  row.wine_name      = name;
  row.type           = get('type')        || null;
  row.varietal       = get('varietal')    || null;
  row.country        = get('country')     || null;
  row.region         = get('region')      || null;
  row.appellation    = get('appellation') || null;
  row.vintage        = get('vintage')     || null;
  row.distributor    = get('distributor') || null;
  row.notes          = get('notes')       || null;

  const btg = get('btg_cost');
  row.btg_cost = btg ? stripCurrency(btg) : null;

  const tcs = get('three_cs_cost');
  row.three_cs_cost = tcs ? stripCurrency(tcs) : null;

  const fl = get('frontline_cost');
  row.frontline_cost = fl ? stripCurrency(fl) : null;

  return row;
}

function buildClientRow(
  csvRow: string[],
  headers: string[],
  mapping: ColumnMap,
  teamId: string,
): Record<string, unknown> {
  const get = (key: string): string => {
    const col = mapping[key];
    if (!col) return '';
    const idx = headers.indexOf(col);
    return idx >= 0 ? (csvRow[idx] ?? '').trim() : '';
  };

  const name = get('company_name');
  if (!name) return {};

  const row: Record<string, unknown> = {
    team_id:   teamId,
    is_active: true,
    name,
    status:    get('status') || 'Active',
  };

  row.type            = get('type')            || null;
  row.value_tier      = get('value_tier')      || null;
  row.phone           = get('phone')           || null;
  row.email           = get('email')           || null;
  row.address         = get('address')         || null;
  row.contract_length = get('contract_length') || null;
  row.account_lead    = get('account_lead')    || null;
  row.notes           = get('notes')           || null;

  const comm = get('commission_pct');
  row.commission_pct = comm ? stripCurrency(comm) : null;

  const bill = get('billback_pct');
  row.billback_pct = bill ? stripCurrency(bill) : null;

  return row;
}

// ── Step indicator ────────────────────────────────────────────

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const labels = ['Upload', 'Map Columns', 'Import'];
  return (
    <div className={styles.steps}>
      {labels.map((label, i) => {
        const n = i + 1;
        const active    = n === step;
        const completed = n < step;
        return (
          <div key={n} className={styles.stepItem}>
            <div
              className={[
                styles.stepCircle,
                active    ? styles.stepActive    : '',
                completed ? styles.stepCompleted : '',
              ].join(' ')}
            >
              {completed ? '✓' : n}
            </div>
            <span className={[
              styles.stepLabel,
              active ? styles.stepLabelActive : '',
            ].join(' ')}>
              {label}
            </span>
            {i < labels.length - 1 && (
              <div className={[
                styles.stepLine,
                completed ? styles.stepLineCompleted : '',
              ].join(' ')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

interface CSVImporterProps {
  type: ImportType;
  teamId: string;
  /** When provided (e.g. inside the onboarding wizard), called with the
   *  succeeded count instead of navigating to the list page. */
  onComplete?: (succeeded: number) => void;
}

export function CSVImporter({ type, teamId, onComplete }: CSVImporterProps) {
  const router = useRouter();
  const schema = type === 'products' ? PRODUCT_SCHEMA : CLIENT_SCHEMA;
  const apiPath = type === 'products' ? '/api/import/products' : '/api/import/clients';
  const successPath = type === 'products'
    ? '/app/crm/products'
    : '/app/crm/clients';

  // ── Step state ────────────────────────────────────────────
  const [step, setStep]   = useState<1 | 2 | 3>(1);
  const [parsed, setParsed] = useState<ParsedCSV | null>(null);
  const [mapping, setMapping] = useState<ColumnMap>({});
  const [autoMapped, setAutoMapped] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');

  // Step 3 state
  const [importing, setImporting]   = useState(false);
  const [progress, setProgress]     = useState(0);
  const [totalRows, setTotalRows]   = useState(0);
  const [result, setResult]         = useState<ImportResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── CSV processing ─────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const p = parseCSV(text);
      setParsed(p);

      // Auto-map columns
      const auto = new Set<string>();
      const newMapping: ColumnMap = {};
      for (const field of schema) {
        const match = fuzzyMatch(p.headers, field.key, field.label);
        newMapping[field.key] = match;
        if (match) auto.add(field.key);
      }
      setMapping(newMapping);
      setAutoMapped(auto);
    };
    reader.readAsText(file);
  }, [schema]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  // ── Validation ─────────────────────────────────────────────

  const requiredUnmapped = schema
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.label);

  const canProceedStep1 = parsed !== null && parsed.rows.length > 0;
  const canProceedStep2 = requiredUnmapped.length === 0;

  // ── Live preview (first 3 rows with current mapping) ───────

  function getPreviewRows(): Array<Record<string, string>> {
    if (!parsed) return [];
    return parsed.rows.slice(0, 3).map((row) => {
      const preview: Record<string, string> = {};
      for (const field of schema) {
        const col = mapping[field.key];
        const idx = col ? parsed.headers.indexOf(col) : -1;
        preview[field.key] = idx >= 0 ? (row[idx] ?? '') : '';
      }
      return preview;
    });
  }

  // ── Import logic ───────────────────────────────────────────

  async function runImport() {
    if (!parsed) return;
    setImporting(true);
    setProgress(0);

    const BATCH = 50;
    let succeeded = 0;
    const failed: Array<{ index: number; error: string }> = [];

    const build = type === 'products' ? buildProductRow : buildClientRow;
    const rows = parsed.rows
      .map((r, i) => ({ row: build(r, parsed.headers, mapping, teamId), originalIndex: i }))
      .filter(({ row }) => Object.keys(row).length > 0);

    setTotalRows(rows.length);

    for (let start = 0; start < rows.length; start += BATCH) {
      const batch = rows.slice(start, start + BATCH);
      const payload = batch.map(({ row }) => row);

      try {
        const res = await fetch(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: payload }),
        });

        if (!res.ok) {
          let apiError = `Server error (${res.status})`;
          try {
            const errBody = await res.json();
            if (errBody?.error) apiError = errBody.error;
          } catch {
            // response body is not valid JSON — keep the status-based message
          }
          console.error('Import API error:', apiError, res.status);
          for (const { originalIndex } of batch) {
            failed.push({ index: originalIndex, error: apiError });
          }
          continue;
        }

        let data: ImportResult;
        try {
          data = await res.json();
        } catch (parseErr) {
          console.error('Import response parse error:', parseErr);
          for (const { originalIndex } of batch) {
            failed.push({ index: originalIndex, error: 'Invalid response from server' });
          }
          continue;
        }

        succeeded += data.succeeded;
        for (const f of data.failed) {
          failed.push({ index: batch[f.index]?.originalIndex ?? f.index, error: f.error });
        }
      } catch (err) {
        console.error('Import network error:', err);
        for (const { originalIndex } of batch) {
          failed.push({ index: originalIndex, error: 'Network error' });
        }
      }

      setProgress(Math.min(start + BATCH, rows.length));
    }

    setResult({ succeeded, failed });
    setImporting(false);
  }

  // ── Error CSV download ──────────────────────────────────────

  function downloadErrors() {
    if (!parsed || !result) return;
    const errorIndexes = new Set(result.failed.map((f) => f.index));
    const errorMap = new Map(result.failed.map((f) => [f.index, f.error]));

    const csvLines: string[] = [
      [...parsed.headers, 'import_error'].join(','),
      ...parsed.rows
        .map((row, i) => {
          if (!errorIndexes.has(i)) return null;
          return [...row, `"${errorMap.get(i) ?? 'Unknown error'}"`].join(',');
        })
        .filter((l): l is string => l !== null),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `import_errors_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Rendered unmapped optional fields for Step 3 summary ──

  const unmappedOptional = schema
    .filter((f) => !f.required && !mapping[f.key])
    .map((f) => f.label);

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className={styles.wizard}>
      <StepIndicator step={step} />

      {/* ── Step 1: Upload ── */}
      {step === 1 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Upload CSV File</h2>

          <div
            className={[styles.dropZone, dragOver ? styles.dropZoneActive : ''].join(' ')}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
          >
            <div className={styles.dropIcon}>📄</div>
            <p className={styles.dropText}>
              Drag &amp; drop a CSV file here, or{' '}
              <span className={styles.dropLink}>browse to upload</span>
            </p>
            <p className={styles.dropHint}>Accepts .csv — comma or tab delimited</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className={styles.fileInput}
              onChange={handleFileInput}
            />
          </div>

          {parsed && parsed.headers.length > 0 && (
            <div className={styles.previewWrap}>
              <div className={styles.previewMeta}>
                <span className={styles.fileName}>{fileName}</span>
                <span className={styles.rowCount}>
                  <strong>{parsed.rows.length}</strong> rows detected
                  {parsed.skippedCount > 0 && (
                    <span className={styles.warning}>
                      {' '}· {parsed.skippedCount} row{parsed.skippedCount !== 1 ? 's' : ''} have
                      mismatched columns and will be skipped
                    </span>
                  )}
                </span>
              </div>

              <div className={styles.tableWrap}>
                <table className={styles.previewTable}>
                  <thead>
                    <tr>
                      {parsed.headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cell, ci) => (
                          <td key={ci}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {parsed && parsed.rows.length === 0 && parsed.headers.length > 0 && (
            <p className={styles.errorMsg}>
              No data rows found in this file. Please check your CSV and try again.
            </p>
          )}

          <div className={styles.stepActions}>
            <button
              className={styles.primaryBtn}
              disabled={!canProceedStep1}
              onClick={() => setStep(2)}
            >
              Next: Map Columns →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Column Mapping ── */}
      {step === 2 && parsed && (
        <div className={styles.twoCol}>
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Map Your Columns</h2>
            <p className={styles.sectionHint}>
              Match your CSV columns to the schema fields.{' '}
              <span className={styles.sageText}>Green labels</span> were auto-matched.
            </p>

            <div className={styles.mappingGrid}>
              {schema.map((field) => {
                const isAuto = autoMapped.has(field.key) && !!mapping[field.key];
                return (
                  <div key={field.key} className={styles.mappingRow}>
                    <label
                      className={[
                        styles.mappingLabel,
                        isAuto ? styles.mappingLabelAuto : '',
                      ].join(' ')}
                    >
                      {field.label}
                      {field.required && <span className={styles.required}> *</span>}
                      {field.notes && (
                        <span className={styles.fieldNote}> ({field.notes})</span>
                      )}
                    </label>
                    <select
                      className={[
                        styles.select,
                        isAuto ? styles.selectAuto : '',
                      ].join(' ')}
                      value={mapping[field.key] ?? ''}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                    >
                      <option value="">— skip —</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {requiredUnmapped.length > 0 && (
              <div className={styles.validationError}>
                {requiredUnmapped.map((label) => (
                  <p key={label}>
                    ⚠ <strong>{label}</strong> is required and has no column mapped. Import will fail.
                  </p>
                ))}
              </div>
            )}

            <div className={styles.stepActions}>
              <button className={styles.ghostBtn} onClick={() => setStep(1)}>
                ← Back
              </button>
              <button
                className={styles.primaryBtn}
                disabled={!canProceedStep2}
                onClick={() => setStep(3)}
              >
                Next: Review →
              </button>
            </div>
          </div>

          {/* Live preview panel */}
          <div className={styles.previewPanel}>
            <h3 className={styles.previewPanelTitle}>Live Preview</h3>
            <p className={styles.sectionHint}>First 3 rows after mapping</p>
            <LivePreview
              rows={getPreviewRows()}
              schema={schema}
            />
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Import ── */}
      {step === 3 && parsed && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Review &amp; Import</h2>

          {!result && !importing && (
            <>
              <div className={styles.summaryGrid}>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryValue}>{parsed.rows.length}</span>
                  <span className={styles.summaryKey}>Total rows</span>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.summaryValue}>{parsed.skippedCount}</span>
                  <span className={styles.summaryKey}>Rows skipped (column mismatch)</span>
                </div>
                {unmappedOptional.length > 0 && (
                  <div className={[styles.summaryItem, styles.summaryFull].join(' ')}>
                    <span className={styles.summaryKey}>
                      Unmapped optional fields (will be blank):{' '}
                      <span className={styles.mutedText}>
                        {unmappedOptional.join(', ')}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className={styles.stepActions}>
                <button className={styles.ghostBtn} onClick={() => setStep(2)}>
                  ← Back
                </button>
                <button className={styles.primaryBtn} onClick={runImport}>
                  Import {parsed.rows.length} rows
                </button>
              </div>
            </>
          )}

          {importing && (
            <div className={styles.progressWrap}>
              <p className={styles.progressLabel}>
                Importing row {progress} of {totalRows}…
              </p>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: totalRows > 0 ? `${(progress / totalRows) * 100}%` : '0%' }}
                />
              </div>
            </div>
          )}

          {result && (
            <div className={styles.resultWrap}>
              <div className={styles.resultRow}>
                <span className={styles.successBadge}>
                  ✓ {result.succeeded} rows imported successfully
                </span>
              </div>

              {result.failed.length > 0 && (
                <div className={styles.failureSection}>
                  <span className={styles.failureBadge}>
                    ✗ {result.failed.length} rows failed
                  </span>
                  <ul className={styles.failureList}>
                    {result.failed.slice(0, 20).map(({ index, error }) => (
                      <li key={index}>
                        Row {index + 2}: {error}
                      </li>
                    ))}
                    {result.failed.length > 20 && (
                      <li>…and {result.failed.length - 20} more</li>
                    )}
                  </ul>
                  <button className={styles.ghostBtn} onClick={downloadErrors}>
                    Download error report (CSV)
                  </button>
                </div>
              )}

              <div className={styles.stepActions}>
                <button
                  className={styles.ghostBtn}
                  onClick={() => {
                    setParsed(null);
                    setMapping({});
                    setAutoMapped(new Set());
                    setFileName('');
                    setResult(null);
                    setStep(1);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  Import another file
                </button>
                {onComplete ? (
                  <button
                    className={styles.primaryBtn}
                    onClick={() => onComplete(result.succeeded)}
                  >
                    Done →
                  </button>
                ) : (
                  <button
                    className={styles.primaryBtn}
                    onClick={() => router.push(successPath)}
                  >
                    Go to {type === 'products' ? 'Products' : 'Accounts'} →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Live preview sub-component ────────────────────────────────

function LivePreview({
  rows,
  schema,
}: {
  rows: Array<Record<string, string>>;
  schema: SchemaField[];
}) {
  const visibleFields = schema.filter((f) =>
    rows.some((r) => r[f.key]),
  );

  if (rows.length === 0 || visibleFields.length === 0) {
    return (
      <p className={styles.emptyPreview}>
        Adjust mappings above to see a preview.
      </p>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.previewTable}>
        <thead>
          <tr>
            {visibleFields.map((f) => (
              <th key={f.key}>{f.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {visibleFields.map((f) => (
                <td key={f.key}>{row[f.key] || <span className={styles.emptyCell}>—</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
