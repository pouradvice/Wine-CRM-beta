'use client';
// src/components/clients/ClientsClient.tsx

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { upsertClient, getClients } from '@/lib/data';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import type { Client, ClientInsert, ClientStatus } from '@/types';
import styles from './ClientsClient.module.css';

const STATUS_TABS: Array<{ label: string; value: ClientStatus | 'All' }> = [
  { label: 'All', value: 'All' },
  { label: 'Active', value: 'Active' },
  { label: 'Prospective', value: 'Prospective' },
  { label: 'Former', value: 'Former' },
];

interface ClientsClientProps {
  initialClients: Client[];
  totalCount: number;
  teamId: string;
}

interface ClientForm {
  company_name: string;
  type: string;
  value_tier: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  commission_pct: string;
  billback_pct: string;
  contract_length: string;
  date_active_from: string;
  date_active_to: string;
  account_lead: string;
  status: ClientStatus;
  notes: string;
}

const emptyForm = (): ClientForm => ({
  company_name: '',
  type: '',
  value_tier: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  commission_pct: '',
  billback_pct: '',
  contract_length: '',
  date_active_from: '',
  date_active_to: '',
  account_lead: '',
  status: 'Active',
  notes: '',
});

function clientToForm(c: Client): ClientForm {
  return {
    company_name: c.company_name,
    type: c.type ?? '',
    value_tier: c.value_tier ?? '',
    contact_name: c.contact_name ?? '',
    phone: c.phone ?? '',
    email: c.email ?? '',
    address: c.address ?? '',
    commission_pct: c.commission_pct != null ? String(c.commission_pct) : '',
    billback_pct: c.billback_pct != null ? String(c.billback_pct) : '',
    contract_length: c.contract_length ?? '',
    date_active_from: c.date_active_from ?? '',
    date_active_to: c.date_active_to ?? '',
    account_lead: c.account_lead ?? '',
    status: c.status,
    notes: c.notes ?? '',
  };
}

export function ClientsClient({ initialClients, teamId }: ClientsClientProps) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [statusTab, setStatusTab] = useState<ClientStatus | 'All'>('All');
  const [search, setSearch] = useState('');
  const [slideoverOpen, setSlideoverOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<ClientForm>>({});

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !q || c.company_name.toLowerCase().includes(q);
      const matchStatus = statusTab === 'All' || c.status === statusTab;
      return matchSearch && matchStatus;
    });
  }, [clients, search, statusTab]);

  const openAdd = () => {
    setEditingClient(null);
    setForm(emptyForm());
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditingClient(c);
    setForm(clientToForm(c));
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const handleTabChange = async (tab: ClientStatus | 'All') => {
    setStatusTab(tab);
    // Fetch from server for non-initial tabs
    try {
      const sb = createClient();
      const status = tab === 'All' ? undefined : tab;
      const result = await getClients(sb, status, { page: 0, pageSize: 50 });
      setClients(result.data);
    } catch {
      // Keep existing data on error
    }
  };

  const validate = (): boolean => {
    const errs: Partial<ClientForm> = {};
    if (!form.company_name.trim()) errs.company_name = 'Company name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);

    const sb = createClient();
    try {
      const payload: ClientInsert & { id?: string } = {
        company_name: form.company_name.trim(),
        type: form.type || null,
        value_tier: form.value_tier || null,
        contact_name: form.contact_name || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        commission_pct: form.commission_pct ? Number(form.commission_pct) : null,
        billback_pct: form.billback_pct ? Number(form.billback_pct) : null,
        contract_length: form.contract_length || null,
        date_active_from: form.date_active_from || null,
        date_active_to: form.date_active_to || null,
        account_lead: form.account_lead || null,
        team_id: teamId,
        status: form.status,
        notes: form.notes || null,
        is_active: true,
        ...(editingClient ? { id: editingClient.id } : {}),
      };

      const saved = await upsertClient(sb, payload);

      if (editingClient) {
        setClients((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      } else {
        setClients((prev) => [saved, ...prev]);
      }

      setSlideoverOpen(false);
      router.refresh();
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setSaveError(e.error ?? e.message ?? 'Failed to save client.');
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof ClientForm>(key: K, value: ClientForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const tierClass = (tier: string | null) => {
    if (tier === 'A') return styles.tierA;
    if (tier === 'B') return styles.tierB;
    return styles.tierC;
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Clients</h1>
        <Button variant="primary" onClick={openAdd}>Add Client</Button>
      </div>

      <div className={styles.statusTabs}>
        {STATUS_TABS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            className={`${styles.statusTab} ${statusTab === value ? styles.statusTabActive : ''}`}
            onClick={() => handleTabChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by company name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {search ? 'No clients match your search' : 'No clients yet'}
          </p>
          <p className={styles.emptyDesc}>
            {search
              ? 'Try a different name.'
              : 'Add your first client account to get started with sales recaps.'}
          </p>
          {!search && <Button variant="primary" onClick={openAdd}>Add Client</Button>}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Company</th>
              <th>Type</th>
              <th>Tier</th>
              <th>Account Lead</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className={styles.tableRow} onClick={() => openEdit(c)}>
                <td className={styles.companyCell}>{c.company_name}</td>
                <td>{c.type ?? '—'}</td>
                <td>
                  {c.value_tier ? (
                    <span className={`${styles.tierBadge} ${tierClass(c.value_tier)}`}>
                      {c.value_tier}
                    </span>
                  ) : '—'}
                </td>
                <td>{c.account_lead ?? '—'}</td>
                <td><StatusBadge status={c.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Slideover
        open={slideoverOpen}
        onClose={() => setSlideoverOpen(false)}
        title={editingClient ? 'Edit Client' : 'Add Client'}
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
              Company Name <span className={styles.required}>*</span>
            </label>
            <input
              className={styles.formInput}
              value={form.company_name}
              onChange={(e) => setField('company_name', e.target.value)}
            />
            {errors.company_name && <span className={styles.formError}>{errors.company_name}</span>}
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Type</label>
            <select className={styles.formSelect} value={form.type} onChange={(e) => setField('type', e.target.value)}>
              <option value="">Select type…</option>
              {['Restaurant', 'Retail', 'Hotel', 'Bar', 'Other'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Value Tier</label>
            <select className={styles.formSelect} value={form.value_tier} onChange={(e) => setField('value_tier', e.target.value)}>
              <option value="">Select tier…</option>
              {['A', 'B', 'C'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Contact Name</label>
            <input className={styles.formInput} value={form.contact_name} onChange={(e) => setField('contact_name', e.target.value)} />
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
            <label className={styles.formLabel}>Address</label>
            <input className={styles.formInput} value={form.address} onChange={(e) => setField('address', e.target.value)} />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Commission %</label>
            <input type="number" step="0.1" className={styles.formInput} value={form.commission_pct} onChange={(e) => setField('commission_pct', e.target.value)} />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Billback %</label>
            <input type="number" step="0.1" className={styles.formInput} value={form.billback_pct} onChange={(e) => setField('billback_pct', e.target.value)} />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Contract Length</label>
            <input className={styles.formInput} value={form.contract_length} onChange={(e) => setField('contract_length', e.target.value)} placeholder="e.g. 12 months" />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Account Lead</label>
            <input className={styles.formInput} value={form.account_lead} onChange={(e) => setField('account_lead', e.target.value)} />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Date Active From</label>
            <input type="date" className={styles.formInput} value={form.date_active_from} onChange={(e) => setField('date_active_from', e.target.value)} />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Date Active To</label>
            <input type="date" className={styles.formInput} value={form.date_active_to} onChange={(e) => setField('date_active_to', e.target.value)} />
          </div>

          <div className={styles.formField}>
            <label className={styles.formLabel}>Status</label>
            <select className={styles.formSelect} value={form.status} onChange={(e) => setField('status', e.target.value as ClientStatus)}>
              {(['Active', 'Prospective', 'Former'] as ClientStatus[]).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
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
