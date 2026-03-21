'use client';

import { useState } from 'react';
import type { InvoiceDraftResult } from '@/types';
import styles from './GenerateInvoice.module.css';

interface Props {
  supplierId: string;
  teamId: string;
}

function currentMonthValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function GenerateInvoice({ supplierId, teamId }: Props) {
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<InvoiceDraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<string>(currentMonthValue());

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/billing/invoice/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          team_id: teamId,
          billing_period: `${billingPeriod}-01`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Unexpected error');
      } else {
        setResult(json as InvoiceDraftResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setGenerating(false);
    }
  }

  function handleReset() {
    setResult(null);
    setError(null);
    setBillingPeriod(currentMonthValue());
  }

  if (result) {
    return (
      <div className={styles.card}>
        <div className={styles.result}>
          {result.status === 'OK' && (
            <p className={styles.successBanner}>
              Invoice draft created — subtotal ${result.subtotal.toFixed(2)}.{' '}
              <a
                href={`/app/suppliers/${supplierId}/invoices/${result.invoice_id}`}
                className={styles.invoiceLink}
              >
                View invoice →
              </a>
            </p>
          )}
          {result.status === 'ALREADY_EXISTS' && (
            <p className={styles.warningBanner}>
              An invoice draft already exists for this period.{' '}
              <a
                href={`/app/suppliers/${supplierId}/invoices/${result.invoice_id}`}
                className={styles.invoiceLink}
              >
                View invoice →
              </a>
            </p>
          )}
          {result.status === 'THRESHOLD_NOT_MET' && (
            <p className={styles.infoBanner}>
              Not enough recaps to generate an invoice ({result.recap_count} of {result.required} required).
            </p>
          )}
          {result.status === 'NOTHING_TO_BILL' && (
            <p className={styles.infoBanner}>Nothing to bill for this period.</p>
          )}
          <div className={styles.actions}>
            <button type="button" className={styles.resetButton} onClick={handleReset}>
              Generate another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="billing_period">
          Billing period
        </label>
        <input
          id="billing_period"
          type="month"
          className={styles.monthInput}
          value={billingPeriod}
          onChange={e => setBillingPeriod(e.target.value)}
          disabled={generating}
        />
      </div>
      {error && <p className={styles.errorBanner}>{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleGenerate}
          disabled={generating || !billingPeriod}
        >
          {generating ? 'Generating…' : 'Generate Invoice Draft'}
        </button>
      </div>
    </div>
  );
}
