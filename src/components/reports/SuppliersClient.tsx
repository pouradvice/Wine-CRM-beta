'use client';
// src/components/reports/SuppliersClient.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Supplier } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { upsertSupplier, upsertSupplierContract } from '@/lib/data';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import styles from './ReportsClient.module.css';

interface SuppliersClientProps {
  suppliers: Supplier[];
  teamId: string;
}

interface SupplierForm {
  name: string;
  country: string;
  region: string;
  website: string;
  notes: string;
}

function emptyForm(): SupplierForm {
  return { name: '', country: '', region: '', website: '', notes: '' };
}

export function SuppliersClient({ suppliers: initialSuppliers, teamId }: SuppliersClientProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm());
  const [errors, setErrors] = useState<Partial<SupplierForm>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function setField(field: keyof SupplierForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate(): boolean {
    const e: Partial<SupplierForm> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setSaveError('');
    try {
      const sb = createClient();

      // Find existing supplier by name (case-insensitive exact match)
      const { data: existing } = await sb
        .from('suppliers')
        .select('id, name, country, region, website, notes, is_active, created_at, updated_at')
        .ilike('name', form.name.trim())
        .limit(1)
        .maybeSingle();

      let supplier: Supplier;
      if (existing) {
        supplier = existing as Supplier;
      } else {
        supplier = await upsertSupplier(sb, {
          name: form.name.trim(),
          country: form.country.trim() || null,
          region: form.region.trim() || null,
          website: form.website.trim() || null,
          notes: form.notes.trim() || null,
          is_active: true,
        });
      }

      // Link supplier to this team via a contract row
      await upsertSupplierContract(sb, {
        team_id: teamId,
        supplier_id: supplier.id,
        status: 'active',
        region: null,
        start_date: null,
        end_date: null,
        commission_pct: null,
        notes: null,
      });

      setOpen(false);
      setForm(emptyForm());
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Suppliers</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={styles.sectionMeta}>
            {initialSuppliers.length} supplier{initialSuppliers.length !== 1 ? 's' : ''}
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => { setForm(emptyForm()); setErrors({}); setSaveError(''); setOpen(true); }}
          >
            + Add Supplier
          </Button>
        </div>
      </div>

      {initialSuppliers.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No suppliers yet</p>
          <p className={styles.emptyDesc}>Add your first supplier to get started.</p>
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Country</th>
              <th>Region</th>
              <th>Website</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {initialSuppliers.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link
                    href={`/app/suppliers/${s.id}`}
                    style={{ color: 'var(--wine)', textDecoration: 'none', fontWeight: 500 }}
                  >
                    {s.name}
                  </Link>
                </td>
                <td>{s.country ?? '—'}</td>
                <td>{s.region ?? '—'}</td>
                <td>
                  {s.website ? (
                    <a href={s.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wine)' }}>
                      {s.website}
                    </a>
                  ) : '—'}
                </td>
                <td>{s.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Slideover
        open={open}
        onClose={() => setOpen(false)}
        title="Add Supplier"
        footer={
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              Save Supplier
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {saveError && <p className={styles.saveError}>{saveError}</p>}
          <div className={styles.formGrid}>
            <div className={`${styles.formField} ${styles.formGridFull}`}>
              <label className={styles.formLabel}>
                Name <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.formInput}
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="e.g. BonAnno Wine"
              />
              {errors.name && <span className={styles.formError}>{errors.name}</span>}
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Country</label>
              <input
                className={styles.formInput}
                value={form.country}
                onChange={(e) => setField('country', e.target.value)}
                placeholder="e.g. Italy"
              />
            </div>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Region</label>
              <input
                className={styles.formInput}
                value={form.region}
                onChange={(e) => setField('region', e.target.value)}
                placeholder="e.g. Tuscany"
              />
            </div>
            <div className={`${styles.formField} ${styles.formGridFull}`}>
              <label className={styles.formLabel}>Website</label>
              <input
                className={styles.formInput}
                value={form.website}
                onChange={(e) => setField('website', e.target.value)}
                placeholder="https://..."
                type="url"
              />
            </div>
            <div className={`${styles.formField} ${styles.formGridFull}`}>
              <label className={styles.formLabel}>Notes</label>
              <textarea
                className={styles.formTextarea}
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                rows={3}
                placeholder="Any additional notes..."
              />
            </div>
          </div>
        </div>
      </Slideover>
    </>
  );
}
