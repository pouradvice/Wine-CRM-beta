'use client';
// src/components/buyers/BuyersClient.tsx

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { upsertBuyer } from '@/lib/data';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type { Buyer, BuyerInsert, Client } from '@/types';
import styles from './BuyersClient.module.css';

interface BuyersClientProps {
  initialBuyers: Buyer[];
  activeClients: Client[];
  teamId: string;
}

interface BuyerForm {
  client_id: string;
  contact_name: string;
  role: string;
  phone: string;
  email: string;
  premise_type: string;
  notes: string;
}

const emptyForm = (): BuyerForm => ({
  client_id: '',
  contact_name: '',
  role: '',
  phone: '',
  email: '',
  premise_type: '',
  notes: '',
});

function buyerToForm(b: Buyer): BuyerForm {
  return {
    client_id: b.client_id,
    contact_name: b.contact_name,
    role: b.role ?? '',
    phone: b.phone ?? '',
    email: b.email ?? '',
    premise_type: b.premise_type ?? '',
    notes: b.notes ?? '',
  };
}

export function BuyersClient({ initialBuyers, activeClients, teamId }: BuyersClientProps) {
  const router = useRouter();
  const [buyers, setBuyers] = useState<Buyer[]>(initialBuyers);
  const [clientFilter, setClientFilter] = useState('');
  const [search, setSearch] = useState('');
  const [slideoverOpen, setSlideoverOpen] = useState(false);
  const [editingBuyer, setEditingBuyer] = useState<Buyer | null>(null);
  const [form, setForm] = useState<BuyerForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<BuyerForm>>({});

  // Build unique client list from buyers data
  const clientsInList = useMemo(() => {
    const seen = new Map<string, string>();
    buyers.forEach((b) => {
      if (b.client && !seen.has(b.client_id)) {
        seen.set(b.client_id, (b.client as Client).company_name);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [buyers]);

  const filtered = useMemo(() => {
    return buyers.filter((b) => {
      const q = search.toLowerCase();
      const matchSearch = !q || b.contact_name.toLowerCase().includes(q);
      const matchClient = !clientFilter || b.client_id === clientFilter;
      return matchSearch && matchClient;
    });
  }, [buyers, search, clientFilter]);

  const openAdd = () => {
    setEditingBuyer(null);
    setForm(emptyForm());
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const openEdit = (b: Buyer) => {
    setEditingBuyer(b);
    setForm(buyerToForm(b));
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const validate = (): boolean => {
    const errs: Partial<BuyerForm> = {};
    if (!form.client_id) errs.client_id = 'Client is required';
    if (!form.contact_name.trim()) errs.contact_name = 'Contact name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);

    const sb = createClient();
    try {
      const payload: BuyerInsert & { id?: string } = {
        client_id: form.client_id,
        contact_name: form.contact_name.trim(),
        role: form.role || null,
        phone: form.phone || null,
        email: form.email || null,
        premise_type: form.premise_type || null,
        notes: form.notes || null,
        team_id: teamId,
        is_active: true,
        ...(editingBuyer ? { id: editingBuyer.id } : {}),
      };

      const saved = await upsertBuyer(sb, payload);

      // Re-attach client info for display
      const clientData = activeClients.find((c) => c.id === saved.client_id) ?? null;
      const savedWithClient: Buyer = { ...saved, client: clientData };

      if (editingBuyer) {
        setBuyers((prev) => prev.map((b) => (b.id === saved.id ? savedWithClient : b)));
      } else {
        setBuyers((prev) => [savedWithClient, ...prev]);
      }

      setSlideoverOpen(false);
      router.refresh();
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setSaveError(e.error ?? e.message ?? 'Failed to save buyer.');
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof BuyerForm>(key: K, value: BuyerForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Buyers</h1>
        <Button variant="primary" onClick={openAdd}>Add Buyer</Button>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by contact name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
        >
          <option value="">All clients</option>
          {clientsInList.map(({ id, name }) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {search || clientFilter ? 'No buyers match your filters' : 'No buyers yet'}
          </p>
          <p className={styles.emptyDesc}>
            {search || clientFilter
              ? 'Try adjusting your search or filter.'
              : 'Add buyers (sommeliers, GMs, owners) to track who you meet at each account.'}
          </p>
          {!search && !clientFilter && (
            <Button variant="primary" onClick={openAdd}>Add Buyer</Button>
          )}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Contact Name</th>
              <th>Role</th>
              <th>Client</th>
              <th>Premise Type</th>
              <th>Email</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => (
              <tr key={b.id} className={styles.tableRow} onClick={() => openEdit(b)}>
                <td className={styles.nameCell}>{b.contact_name}</td>
                <td>{b.role ?? '—'}</td>
                <td>{(b.client as Client | null)?.company_name ?? '—'}</td>
                <td>{b.premise_type ?? '—'}</td>
                <td>{b.email ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Slideover
        open={slideoverOpen}
        onClose={() => setSlideoverOpen(false)}
        title={editingBuyer ? 'Edit Buyer' : 'Add Buyer'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSlideoverOpen(false)} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
          </>
        }
      >
        <div className={styles.formGrid}>
          <div className={`${styles.formField} ${styles.formGridFull}`}>
            <label className={styles.formLabel}>
              Client <span className={styles.required}>*</span>
            </label>
            <select
              className={styles.formSelect}
              value={form.client_id}
              onChange={(e) => setField('client_id', e.target.value)}
            >
              <option value="">Select client…</option>
              {activeClients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
            {errors.client_id && <span className={styles.formError}>{errors.client_id}</span>}
          </div>

          <div className={`${styles.formField} ${styles.formGridFull}`}>
            <label className={styles.formLabel}>
              Contact Name <span className={styles.required}>*</span>
            </label>
            <input
              className={styles.formInput}
              value={form.contact_name}
              onChange={(e) => setField('contact_name', e.target.value)}
            />
            {errors.contact_name && <span className={styles.formError}>{errors.contact_name}</span>}
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Role</label>
            <select className={styles.formSelect} value={form.role} onChange={(e) => setField('role', e.target.value)}>
              <option value="">Select role…</option>
              {['Sommelier', 'GM', 'Buyer', 'Owner', 'Other'].map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Premise Type</label>
            <select className={styles.formSelect} value={form.premise_type} onChange={(e) => setField('premise_type', e.target.value)}>
              <option value="">Select type…</option>
              <option value="On-Premise">On-Premise</option>
              <option value="Off-Premise">Off-Premise</option>
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Phone</label>
            <input type="tel" className={styles.formInput} value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Email</label>
            <input type="email" className={styles.formInput} value={form.email} onChange={(e) => setField('email', e.target.value)} />
          </div>

          <div className={`${styles.formField} ${styles.formGridFull}`}>
            <label className={styles.formLabel}>Notes</label>
            <textarea className={styles.formTextarea} value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} />
          </div>

          {saveError && <p className={styles.saveError}>{saveError}</p>}
        </div>
      </Slideover>
    </>
  );
}
