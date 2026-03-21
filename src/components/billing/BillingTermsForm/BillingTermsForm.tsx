'use client';

import { useState } from 'react';
import type { SupplierBillingTerms, SupplierBillingTermsInsert } from '@/types';
import styles from './BillingTermsForm.module.css';

interface Props {
  supplierId: string;
  teamId: string;
  initialTerms: SupplierBillingTerms | null;
}

interface FormValues {
  placement_rate:         string;
  placement_lockout_days: string;
  demo_rate:              string;
  demo_complimentary:     string;
  demo_hourly_rate:       string;
  event_rate:             string;
  event_complimentary:    string;
  event_hourly_rate:      string;
  min_recaps_required:    string;
  effective_from:         string;
}

function termsToFormValues(t: SupplierBillingTerms | null): FormValues {
  const today = new Date().toISOString().slice(0, 10);
  if (!t) {
    return {
      placement_rate:         '',
      placement_lockout_days: '90',
      demo_rate:              '',
      demo_complimentary:     '1',
      demo_hourly_rate:       '',
      event_rate:             '',
      event_complimentary:    '1',
      event_hourly_rate:      '',
      min_recaps_required:    '15',
      effective_from:         today,
    };
  }
  return {
    placement_rate:         String(t.placement_rate),
    placement_lockout_days: String(t.placement_lockout_days),
    demo_rate:              String(t.demo_rate),
    demo_complimentary:     String(t.demo_complimentary),
    demo_hourly_rate:       t.demo_hourly_rate != null ? String(t.demo_hourly_rate) : '',
    event_rate:             String(t.event_rate),
    event_complimentary:    String(t.event_complimentary),
    event_hourly_rate:      t.event_hourly_rate != null ? String(t.event_hourly_rate) : '',
    min_recaps_required:    String(t.min_recaps_required),
    effective_from:         t.effective_from ?? today,
  };
}

function billingPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

export function BillingTermsForm({ supplierId, teamId, initialTerms }: Props) {
  const [terms, setTerms] = useState<SupplierBillingTerms | null>(initialTerms);
  const [editing, setEditing] = useState(initialTerms === null);
  const [values, setValues] = useState<FormValues>(termsToFormValues(initialTerms));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValues(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function enterEdit() {
    setValues(termsToFormValues(terms));
    setSuccess(false);
    setError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSuccess(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    const body: SupplierBillingTermsInsert = {
      supplier_id:            supplierId,
      team_id:                teamId,
      billing_period:         billingPeriod(),
      placement_rate:         parseFloat(values.placement_rate) || 0,
      placement_lockout_days: parseInt(values.placement_lockout_days, 10) || 90,
      demo_rate:              parseFloat(values.demo_rate) || 0,
      demo_complimentary:     parseInt(values.demo_complimentary, 10) || 1,
      demo_hourly_rate:       values.demo_hourly_rate !== '' ? parseFloat(values.demo_hourly_rate) : null,
      event_rate:             parseFloat(values.event_rate) || 0,
      event_complimentary:    parseInt(values.event_complimentary, 10) || 1,
      event_hourly_rate:      values.event_hourly_rate !== '' ? parseFloat(values.event_hourly_rate) : null,
      min_recaps_required:    parseInt(values.min_recaps_required, 10) || 15,
      effective_from:         values.effective_from,
      effective_to:           null,
      notes:                  null,
    };

    try {
      const res = await fetch('/api/billing/terms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json() as SupplierBillingTerms & { error?: string };
      if (!res.ok) {
        setError(json.error ?? 'Failed to save billing terms.');
      } else {
        setTerms(json);
        setSuccess(true);
        setEditing(false);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!editing && terms) {
    return (
      <div className={styles.card}>
        {success && (
          <p className={styles.successBanner}>Billing terms saved.</p>
        )}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Placement rate</span>
            <span className={styles.summaryValue}>${terms.placement_rate}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Lockout period</span>
            <span className={styles.summaryValue}>{terms.placement_lockout_days} days</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Demo rate</span>
            <span className={styles.summaryValue}>${terms.demo_rate}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Complimentary demos</span>
            <span className={styles.summaryValue}>{terms.demo_complimentary}/period</span>
          </div>
          {terms.demo_hourly_rate != null && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Demo prep rate</span>
              <span className={styles.summaryValue}>${terms.demo_hourly_rate}/hr</span>
            </div>
          )}
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Event rate</span>
            <span className={styles.summaryValue}>${terms.event_rate}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Complimentary events</span>
            <span className={styles.summaryValue}>{terms.event_complimentary}/period</span>
          </div>
          {terms.event_hourly_rate != null && (
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Event coordination rate</span>
              <span className={styles.summaryValue}>${terms.event_hourly_rate}/hr</span>
            </div>
          )}
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Min recaps for invoice</span>
            <span className={styles.summaryValue}>{terms.min_recaps_required}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Effective from</span>
            <span className={styles.summaryValue}>{terms.effective_from}</span>
          </div>
        </div>
        <button type="button" className={styles.editButton} onClick={enterEdit}>
          Edit rates
        </button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.formGrid}>
          <div className={styles.col}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="placement_rate">
                New account placement rate ($)
              </label>
              <input
                id="placement_rate"
                name="placement_rate"
                type="number"
                step="0.01"
                min="0"
                className={styles.input}
                value={values.placement_rate}
                onChange={handleChange}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="demo_rate">
                Demo rate ($)
              </label>
              <input
                id="demo_rate"
                name="demo_rate"
                type="number"
                step="0.01"
                min="0"
                className={styles.input}
                value={values.demo_rate}
                onChange={handleChange}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="demo_hourly_rate">
                Demo prep rate ($/hr, optional)
              </label>
              <input
                id="demo_hourly_rate"
                name="demo_hourly_rate"
                type="number"
                step="0.01"
                min="0"
                className={styles.input}
                value={values.demo_hourly_rate}
                onChange={handleChange}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="event_rate">
                Event rate ($)
              </label>
              <input
                id="event_rate"
                name="event_rate"
                type="number"
                step="0.01"
                min="0"
                className={styles.input}
                value={values.event_rate}
                onChange={handleChange}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="event_hourly_rate">
                Event coordination rate ($/hr, optional)
              </label>
              <input
                id="event_hourly_rate"
                name="event_hourly_rate"
                type="number"
                step="0.01"
                min="0"
                className={styles.input}
                value={values.event_hourly_rate}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className={styles.col}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="placement_lockout_days">
                Placement lockout period (days)
              </label>
              <input
                id="placement_lockout_days"
                name="placement_lockout_days"
                type="number"
                step="1"
                min="0"
                className={styles.input}
                value={values.placement_lockout_days}
                onChange={handleChange}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="demo_complimentary">
                Complimentary demos per period
              </label>
              <input
                id="demo_complimentary"
                name="demo_complimentary"
                type="number"
                step="1"
                min="0"
                className={styles.input}
                value={values.demo_complimentary}
                onChange={handleChange}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="event_complimentary">
                Complimentary events per period
              </label>
              <input
                id="event_complimentary"
                name="event_complimentary"
                type="number"
                step="1"
                min="0"
                className={styles.input}
                value={values.event_complimentary}
                onChange={handleChange}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="min_recaps_required">
                Minimum recaps to generate invoice
              </label>
              <input
                id="min_recaps_required"
                name="min_recaps_required"
                type="number"
                step="1"
                min="0"
                className={styles.input}
                value={values.min_recaps_required}
                onChange={handleChange}
                required
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="effective_from">
                Effective from
              </label>
              <input
                id="effective_from"
                name="effective_from"
                type="date"
                className={styles.input}
                value={values.effective_from}
                onChange={handleChange}
                required
              />
            </div>
          </div>
        </div>

        {error && <p className={styles.errorBanner}>{error}</p>}

        <div className={styles.actions}>
          <button type="submit" className={styles.saveButton} disabled={saving}>
            {saving ? 'Saving…' : 'Save rates'}
          </button>
          {terms !== null && (
            <button type="button" className={styles.cancelButton} onClick={cancelEdit}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
