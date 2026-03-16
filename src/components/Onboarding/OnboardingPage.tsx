'use client';

// src/components/Onboarding/OnboardingPage.tsx
// First-login onboarding wizard.
// Steps: upload accounts → upload portfolio (products) → done.
// team_member role: products step excluded (latent — see STEPS_BY_ROLE).

import React, { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingRole, BulkImportResult } from '@/types';
import styles from './Onboarding.module.css';

// ── Props ─────────────────────────────────────────────────────

interface Props {
  userRole?: OnboardingRole; // default: 'individual'
  userName?: string;         // default: ''
  onComplete?: () => void;
}

// ── Step routing ──────────────────────────────────────────────

type Step = 'accounts' | 'products' | 'done';

const STEPS_BY_ROLE: Record<OnboardingRole, Step[]> = {
  team_lead:   ['accounts', 'products', 'done'],
  individual:  ['accounts', 'products', 'done'],
  // LATENT: hidden from team_members — this step is excluded from STEPS_BY_ROLE for 'team_member'
  // When team_member product access is activated, add 'products' back to their steps array above.
  team_member: ['accounts', 'done'],
};

// ── CSV parser ────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let inQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current);
    rows.push(fields);
  }

  return rows;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeHeader);
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
    return obj;
  });
}

// ── Download CSV template helper ──────────────────────────────

function downloadTemplate(filename: string, headers: string[]) {
  const csv = headers.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── StepAccounts ──────────────────────────────────────────────

const ACCOUNTS_HEADERS = [
  'company_name', 'type', 'value_tier', 'contact_name',
  'phone', 'email', 'address', 'status', 'notes',
];

interface StepAccountsProps {
  onNext: (imported: number) => void;
  onSkip: () => void;
}

function StepAccounts({ onNext, onSkip }: StepAccountsProps) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setResult(null);
    setUploadError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(csvToObjects(text));
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleImport = async () => {
    setLoading(true);
    setUploadError('');
    try {
      const res = await fetch('/api/accounts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json() as BulkImportResult & { error?: string };
      if (!res.ok) {
        setUploadError(json.error ?? 'Import failed.');
      } else {
        setResult(json);
      }
    } catch {
      setUploadError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const preview = rows.slice(0, 5);

  return (
    <div className={styles.stepPanel}>
      <h2 className={styles.stepTitle}>Import your accounts</h2>
      <p className={styles.stepDesc}>
        Upload a CSV of your restaurants, retailers, and other venues. You can always add more later.
      </p>

      <button
        type="button"
        className={styles.templateBtn}
        onClick={() => downloadTemplate('accounts_template.csv', ACCOUNTS_HEADERS)}
      >
        Download CSV template
      </button>

      <div
        className={[
          styles.dropZone,
          dragging ? styles.dropZoneDragging : '',
          fileName && !dragging ? styles.dropZoneSelected : '',
        ].filter(Boolean).join(' ')}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        aria-label="Upload CSV file"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className={styles.fileInputHidden}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {fileName
          ? <span className={styles.dropZoneFileName}>{fileName} — {rows.length} rows</span>
          : (
            <>
              <span className={styles.dropZoneIcon} aria-hidden>↑</span>
              <span>Drag &amp; drop a CSV, or <u>browse</u></span>
            </>
          )}
      </div>

      {preview.length > 0 && (
        <div className={styles.previewWrap}>
          <p className={styles.previewLabel}>Preview ({Math.min(rows.length, 5)} of {rows.length})</p>
          <div className={styles.tableScroll}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Contact</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    <td>{row.company_name}</td>
                    <td>{row.type}</td>
                    <td>{row.status}</td>
                    <td>{row.contact_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uploadError && <p className={styles.errorMsg}>{uploadError}</p>}

      {result && (
        <div className={styles.resultBox}>
          <p>
            <strong>{result.inserted}</strong> imported
            {result.skipped > 0 && <>, <strong>{result.skipped}</strong> skipped</>}
          </p>
          {result.errors.length > 0 && (
            <details className={styles.errorDetails}>
              <summary>{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</summary>
              <ul>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className={styles.stepActions}>
        {rows.length > 0 && !result && (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? <span className={styles.spinner} aria-hidden /> : null}
            {loading ? 'Importing…' : 'Import accounts'}
          </button>
        )}
        {result && (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => onNext(result.inserted)}
          >
            Continue →
          </button>
        )}
        <button type="button" className={styles.skipLink} onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── StepProducts ──────────────────────────────────────────────
// LATENT: hidden from team_members — this step is excluded from STEPS_BY_ROLE for 'team_member'
// When team_member product access is activated, add 'products' back to their steps array above.

const PRODUCTS_HEADERS = [
  'sku_number', 'wine_name', 'type', 'varietal', 'country',
  'region', 'appellation', 'vintage', 'distributor',
  'btg_cost', 'frontline_cost', 'notes',
];

interface StepProductsProps {
  onNext: (imported: number) => void;
  onSkip: () => void;
}

function StepProducts({ onNext, onSkip }: StepProductsProps) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setResult(null);
    setUploadError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRows(csvToObjects(text));
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleImport = async () => {
    setLoading(true);
    setUploadError('');
    try {
      const res = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json() as BulkImportResult & { error?: string };
      if (!res.ok) {
        setUploadError(json.error ?? 'Import failed.');
      } else {
        setResult(json);
      }
    } catch {
      setUploadError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const preview = rows.slice(0, 5);

  return (
    <div className={styles.stepPanel}>
      <h2 className={styles.stepTitle}>Import your portfolio</h2>
      <p className={styles.stepDesc}>
        Upload a CSV of the wines and spirits you represent. SKU number and wine name are required.
      </p>

      <button
        type="button"
        className={styles.templateBtn}
        onClick={() => downloadTemplate('products_template.csv', PRODUCTS_HEADERS)}
      >
        Download CSV template
      </button>

      <div
        className={[
          styles.dropZone,
          dragging ? styles.dropZoneDragging : '',
          fileName && !dragging ? styles.dropZoneSelected : '',
        ].filter(Boolean).join(' ')}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        aria-label="Upload CSV file"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className={styles.fileInputHidden}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {fileName
          ? <span className={styles.dropZoneFileName}>{fileName} — {rows.length} rows</span>
          : (
            <>
              <span className={styles.dropZoneIcon} aria-hidden>↑</span>
              <span>Drag &amp; drop a CSV, or <u>browse</u></span>
            </>
          )}
      </div>

      {preview.length > 0 && (
        <div className={styles.previewWrap}>
          <p className={styles.previewLabel}>Preview ({Math.min(rows.length, 5)} of {rows.length})</p>
          <div className={styles.tableScroll}>
            <table className={styles.previewTable}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Wine name</th>
                  <th>Type</th>
                  <th>Distributor</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    <td>{row.sku_number}</td>
                    <td>{row.wine_name}</td>
                    <td>{row.type}</td>
                    <td>{row.distributor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uploadError && <p className={styles.errorMsg}>{uploadError}</p>}

      {result && (
        <div className={styles.resultBox}>
          <p>
            <strong>{result.inserted}</strong> imported
            {result.skipped > 0 && <>, <strong>{result.skipped}</strong> updated</>}
          </p>
          {result.errors.length > 0 && (
            <details className={styles.errorDetails}>
              <summary>{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</summary>
              <ul>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      <div className={styles.stepActions}>
        {rows.length > 0 && !result && (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleImport}
            disabled={loading}
          >
            {loading ? <span className={styles.spinner} aria-hidden /> : null}
            {loading ? 'Importing…' : 'Import portfolio'}
          </button>
        )}
        {result && (
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={() => onNext(result.inserted)}
          >
            Continue →
          </button>
        )}
        <button type="button" className={styles.skipLink} onClick={onSkip}>
          Skip for now
        </button>
      </div>
    </div>
  );
}

// ── StepDone ──────────────────────────────────────────────────

interface StepDoneProps {
  userName: string;
  onFinish: () => void;
}

function StepDone({ userName, onFinish }: StepDoneProps) {
  const firstName = userName.split(' ')[0];
  return (
    <div className={styles.stepPanel}>
      <div className={styles.doneCheck} aria-hidden>✓</div>
      <h2 className={styles.doneTitle}>
        You&rsquo;re all set{firstName ? `, ${firstName}` : ''}.
      </h2>
      <p className={styles.stepDesc}>
        Pour Advice is ready to help you track placements, manage follow-ups, and grow your book.
      </p>

      <ul className={styles.tipsList}>
        <li className={styles.tipItem}>
          <span className={styles.tipIcon} aria-hidden>📋</span>
          <div>
            <strong>New Recap</strong>
            <p>Log every sales call and track which wines you showed.</p>
          </div>
        </li>
        <li className={styles.tipItem}>
          <span className={styles.tipIcon} aria-hidden>🏪</span>
          <div>
            <strong>Accounts</strong>
            <p>Keep your venues organised by tier, type, and status.</p>
          </div>
        </li>
        <li className={styles.tipItem}>
          <span className={styles.tipIcon} aria-hidden>🍷</span>
          <div>
            <strong>Products</strong>
            <p>Your portfolio lives here — searchable by SKU, varietal, or distributor.</p>
          </div>
        </li>
      </ul>

      <div className={styles.stepActions}>
        <button type="button" className={[styles.primaryBtn, styles.finishBtn].join(' ')} onClick={onFinish}>
          Enter Pour Advice →
        </button>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  accounts: 'Accounts',
  products: 'Portfolio',
  done:     'Done',
};

interface ProgressBarProps {
  steps:     Step[];
  stepIndex: number;
}

function ProgressBar({ steps, stepIndex }: ProgressBarProps) {
  return (
    <div className={styles.progressBar} role="list" aria-label="Onboarding steps">
      {steps.map((step, i) => {
        const isComplete = i < stepIndex;
        const isActive   = i === stepIndex;
        return (
          <React.Fragment key={step}>
            <div
              className={[
                styles.progressStep,
                isComplete ? styles.progressStepComplete : '',
                isActive   ? styles.progressStepActive   : '',
              ].filter(Boolean).join(' ')}
              role="listitem"
              aria-current={isActive ? 'step' : undefined}
            >
              <div className={styles.progressDot}>
                {isComplete ? '✓' : i + 1}
              </div>
              <span className={styles.progressLabel}>{STEP_LABELS[step]}</span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={[
                  styles.progressLine,
                  i < stepIndex ? styles.progressLineComplete : '',
                ].filter(Boolean).join(' ')}
                aria-hidden
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── OnboardingPage (named export) ─────────────────────────────

export function OnboardingPage({
  userRole = 'individual',
  userName = '',
  onComplete,
}: Props) {
  const router = useRouter();
  const steps = STEPS_BY_ROLE[userRole];
  const [stepIndex, setStepIndex] = useState(0);
  const [accountsImported, setAccountsImported] = useState(0);
  const [productsImported, setProductsImported] = useState(0);

  const advance = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));

  const handleFinish = async () => {
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accounts_imported: accountsImported,
          products_imported: productsImported,
        }),
      });
    } catch {
      try { localStorage.setItem('onboarding_complete', '1'); } catch { /* storage blocked */ }
    }
    onComplete?.();
    router.push('/app/crm/accounts');
  };

  const currentStep = steps[stepIndex];

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <span className={styles.brandMark}>Pour Advice</span>
          <ProgressBar steps={steps} stepIndex={stepIndex} />
        </div>

        {currentStep === 'accounts' && (
          <StepAccounts
            onNext={(n) => { setAccountsImported((prev) => prev + n); advance(); }}
            onSkip={advance}
          />
        )}
        {currentStep === 'products' && (
          <StepProducts
            onNext={(n) => { setProductsImported((prev) => prev + n); advance(); }}
            onSkip={advance}
          />
        )}
        {currentStep === 'done' && (
          <StepDone userName={userName} onFinish={handleFinish} />
        )}
      </div>
    </div>
  );
}

// ── Default export (Next.js page wrapper) ─────────────────────

export default OnboardingPage;
