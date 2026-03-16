'use client';
// src/components/clients/ClientsClient.tsx

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { upsertAccount, getAccounts } from '@/lib/data';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import type { Account, AccountInsert, AccountStatus, AccountType, ValueTier } from '@/types';
import styles from './ClientsClient.module.css';

const STATUS_TABS: Array<{ label: string; value: AccountStatus | 'All' }> = [
  { label: 'All', value: 'All' },
  { label: 'Active', value: 'Active' },
  { label: 'Prospective', value: 'Prospective' },
  { label: 'Former', value: 'Former' },
];

interface ClientsClientProps {
  initialClients: Account[];
  totalCount: number;
  teamId: string;
}

interface ClientForm {
  name: string;
  type: string;
  value_tier: string;
  phone: string;
  email: string;
  address: string;
  commission_pct: string;
  billback_pct: string;
  contract_length: string;
  date_active_from: string;
  date_active_to: string;
  account_lead: string;
  status: AccountStatus;
  notes: string;
}

const emptyForm = (): ClientForm => ({
  name: '',
  type: '',
  value_tier: '',
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

function clientToForm(c: Account): ClientForm {
  return {
    name: c.name,
    type: c.type ?? '',
    value_tier: c.value_tier ?? '',
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

const PAGE_SIZE = 25;

export function ClientsClient({ initialClients, totalCount: initialTotal, teamId }: ClientsClientProps) {
  const router = useRouter();
  const [clients, setClients] = useState<Account[]>(initialClients);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(0);
  const [statusTab, setStatusTab] = useState<AccountStatus | 'All'>('All');
  const [search, setSearch] = useState('');
  const [slideoverOpen, setSlideoverOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Account | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<ClientForm>>({});

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q);
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

  const openEdit = (c: Account) => {
    setEditingClient(c);
    setForm(clientToForm(c));
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const fetchPage = useCallback(async (page: number, tab: AccountStatus | 'All') => {
    try {
      const sb = createClient();
      const status = tab === 'All' ? undefined : tab;
      const result = await getAccounts(sb, status, { page, pageSize: PAGE_SIZE });
      setClients(result.data);
      setTotalCount(result.count);
      setCurrentPage(page);
    } catch {
      // Keep existing data on error
    }
  }, []);

  const handleTabChange = async (tab: AccountStatus | 'All') => {
    setStatusTab(tab);
    setSearch('');
    await fetchPage(0, tab);
  };

  const validate = (): boolean => {
    const errs: Partial<ClientForm> = {};
    if (!form.name.trim()) errs.name = 'Company name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);

    const sb = createClient();
    try {
      const payload: AccountInsert & { id?: string } = {
        name: form.name.trim(),
        type: (form.type as AccountType) || null,
        value_tier: (form.value_tier as ValueTier) || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        commission_pct: form.commission_pct ? Number(form.commission_pct) : null,
        billback_pct: form.billback_pct ? Number(form.billback_pct) : null,
        contract_length: form.contract_length || null,
        date_active_from: form.date_active_from || null,
        date_active_to: form.date_active_to || null,
        account_lead: form.account_lead || null,
        city: null,
        state: null,
        country: null,
        team_id: teamId,
        status: form.status,
        notes: form.notes || null,
        is_active: true,
        ...(editingClient ? { id: editingClient.id } : {}),
      };

      const saved = await upsertAccount(sb, payload);

      if (editingClient) {
        setClients((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      } else {
        setClients((prev) => [saved, ...prev]);
      }

      setSlideoverOpen(false);
      router.refresh();
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setSaveError(e.error ?? e.message ?? 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof ClientForm>(key: K, value: ClientForm[K] | AccountStatus) => {
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
        <h1 className={styles.pageTitle}>Accounts</h1>
        <div className={styles.headerActions}>
          <Link href="/app/crm/onboarding/import" className={styles.importLink}>
            Import from CSV
          </Link>
          <Button variant="primary" onClick={openAdd}>Add Account</Button>
        </div>
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
            {search ? 'No accounts match your search' : 'No accounts yet'}
          </p>
          <p className={styles.emptyDesc}>
            {search
              ? 'Try a different name.'
              : 'Add your first account to get started with sales recaps.'}
          </p>
          {!search && (
            <div className={styles.emptyActions}>
              <Button variant="primary" onClick={openAdd}>Add Account</Button>
              <Link href="/app/crm/onboarding/import" className={styles.importLink}>
                Import from CSV →
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
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
                  <td className={styles.companyCell}>{c.name}</td>
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

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>
                {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} of {totalCount}
              </span>
              <div className={styles.pageButtons}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => fetchPage(currentPage - 1, statusTab)}
                  disabled={currentPage === 0}
                >
                  ← Previous
                </button>
                <span className={styles.pageCurrent}>
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => fetchPage(currentPage + 1, statusTab)}
                  disabled={currentPage >= totalPages - 1}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Slideover
        open={slideoverOpen}
        onClose={() => setSlideoverOpen(false)}
        title={editingClient ? 'Edit Account' : 'Add Account'}
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
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
            />
            {errors.name && <span className={styles.formError}>{errors.name}</span>}
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
            <select className={styles.formSelect} value={form.status} onChange={(e) => setField('status', e.target.value as AccountStatus)}>
              {(['Active', 'Prospective', 'Former'] as AccountStatus[]).map((s) => (
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
