'use client';

import { useRef, useState } from 'react';
import { parseDepletionFile, normalizeRows } from '@/lib/depletionParser';
import type { ParsedDepletionRow, ParseResult } from '@/lib/depletionParser';
import type { DepletionMatchResult } from '@/types';
import styles from './DepletionUpload.module.css';

interface Props {
  supplierId: string;
  teamId: string;
}

type UploadState = 'idle' | 'preview' | 'result';

interface PreviewData {
  file: File;
  parseResult: ParseResult;
  selectedColumn: string | null;
}

function prevMonthValue(): string {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function DepletionUpload({ supplierId, teamId }: Props) {
  const [state, setState] = useState<UploadState>('idle');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [periodMonth, setPeriodMonth] = useState<string>(prevMonthValue());
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<DepletionMatchResult | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    try {
      const result = await parseDepletionFile(file);
      setPreview({
        file,
        parseResult: result,
        selectedColumn: result.detectedAccountColumn,
      });
      setState('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file.');
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  }

  function handleCancel() {
    setState('idle');
    setPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleImport() {
    if (!preview) return;
    setSubmitting(true);
    setError(null);

    try {
      let rows: ParsedDepletionRow[];
      if (preview.parseResult.requiresColumnSelection && preview.selectedColumn) {
        rows = normalizeRows(preview.parseResult.rows, preview.selectedColumn);
      } else {
        rows = preview.parseResult.rows;
      }

      const period_month = `${periodMonth}-01`;

      const res = await fetch('/api/billing/depletion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id:  supplierId,
          team_id:      teamId,
          period_month,
          rows,
        }),
      });

      const json = await res.json() as { report: unknown; matchResult: DepletionMatchResult; error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Failed to import report.');
      } else {
        setMatchResult(json.matchResult);
        setState('result');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleUploadAnother() {
    setState('idle');
    setPreview(null);
    setMatchResult(null);
    setError(null);
    setPeriodMonth(prevMonthValue());
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (state === 'result' && matchResult) {
    return (
      <div className={styles.result}>
        <p className={styles.successBanner}>Report imported</p>
        <ul className={styles.statsList}>
          <li className={styles.statsItem}>{matchResult.new_placements} new placements verified</li>
          <li className={styles.statsItem}>{matchResult.skipped_lockout} accounts skipped — already within lockout window</li>
          <li className={styles.statsItem}>{matchResult.skipped_no_match} records in report had no matching Yes Today recap</li>
        </ul>
        <button type="button" className={styles.primaryButton} onClick={handleUploadAnother}>
          Upload another period
        </button>
      </div>
    );
  }

  if (state === 'preview' && preview) {
    const { parseResult, selectedColumn } = preview;
    const previewRows = parseResult.rows.slice(0, 5);

    return (
      <div className={styles.previewContainer}>
        <p className={styles.rowCount}>{parseResult.rows.length} rows detected</p>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="period_month">
            Depletion period
          </label>
          <input
            id="period_month"
            type="month"
            className={styles.monthInput}
            value={periodMonth}
            onChange={e => setPeriodMonth(e.target.value)}
          />
        </div>

        {parseResult.requiresColumnSelection ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="account_column">
              Select account name column
            </label>
            <select
              id="account_column"
              className={styles.columnSelect}
              value={selectedColumn ?? ''}
              onChange={e => setPreview(prev => prev ? { ...prev, selectedColumn: e.target.value } : prev)}
            >
              <option value="">— select column —</option>
              {parseResult.headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        ) : (
          <p className={styles.accountColumnNote}>
            Account column: <strong>{parseResult.detectedAccountColumn}</strong>
          </p>
        )}

        <div className={styles.tableWrapper}>
          <table className={styles.previewTable}>
            <thead>
              <tr>
                {parseResult.headers.map(h => (
                  <th key={h} className={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i}>
                  {parseResult.headers.map(h => (
                    <td key={h} className={styles.td}>{String(row[h] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {error && <p className={styles.errorBanner}>{error}</p>}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleImport()}
            disabled={submitting || (parseResult.requiresColumnSelection && !selectedColumn)}
          >
            {submitting ? 'Importing…' : 'Confirm and import'}
          </button>
          <button type="button" className={styles.cancelButton} onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <p className={styles.dropTitle}>Upload depletion report</p>
        <p className={styles.dropSubtitle}>Drop a .csv or .xlsx file here or click to browse</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className={styles.hiddenInput}
        onChange={handleInputChange}
        aria-hidden="true"
        tabIndex={-1}
      />
      {error && <p className={styles.errorBanner}>{error}</p>}
    </div>
  );
}
