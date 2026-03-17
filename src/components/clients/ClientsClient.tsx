'use client';
// src/components/clients/ClientsClient.tsx

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { upsertAccount, getAccounts, archiveAccount, getAccountSkus, setAccountSkus } from '@/lib/data';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import type { Account, AccountInsert, AccountStatus, AccountType, ValueTier, Product, Contact } from '@/types';
import { contactFullName } from '@/types';
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
  account_lead: string;
  primary_contact_id: string;
  status: AccountStatus;
  notes: string;
}

interface VisitRow {
  visit_date: string;
  salesperson: string;
  wine_name: string | null;
  outcome: string | null;
}

const emptyForm = (): ClientForm => ({
  name: '',
  type: '',
  value_tier: '',
  phone: '',
  email: '',
  address: '',
  account_lead: '',
  primary_contact_id: '',
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
    account_lead: c.account_lead ?? '',
    primary_contact_id: c.primary_contact_id ?? '',
    status: c.status,
    notes: c.notes ?? '',
  };
}

type SlideoverMode = 'closed' | 'view' | 'edit' | 'add';

const PAGE_SIZE = 25;

export function ClientsClient({ initialClients, totalCount: initialTotal, teamId }: ClientsClientProps) {
  const router = useRouter();
  const [clients, setClients] = useState<Account[]>(initialClients);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(0);
  const [statusTab, setStatusTab] = useState<AccountStatus | 'All'>('All');
  const [search, setSearch] = useState('');

  // Unified slideover state
  const [mode, setMode] = useState<SlideoverMode>('closed');
  const [activeClient, setActiveClient] = useState<Account | null>(null);
  const [form, setForm] = useState<ClientForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<ClientForm>>({});

  // Visit history (detail view)
  const [detailVisits, setDetailVisits] = useState<VisitRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Active SKUs
  const [accountSkus, setAccountSkus_] = useState<Product[]>([]);
  const [editSkus, setEditSkus] = useState<Product[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const [skuResults, setSkuResults] = useState<Product[]>([]);
  const [skuSearching, setSkuSearching] = useState(false);
  const skuDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Primary contact
  const [accountContacts, setAccountContacts] = useState<Contact[]>([]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ── Debounced SKU product search ──────────────────────────────
  useEffect(() => {
    if (skuDebounceRef.current) clearTimeout(skuDebounceRef.current);
    if (!skuSearch.trim()) { setSkuResults([]); setSkuSearching(false); return; }
    setSkuSearching(true);
    skuDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(skuSearch)}&limit=20`);
        const result = await res.json();
        const addedIds = new Set(editSkus.map((p) => p.id));
        setSkuResults((result.data ?? []).filter((p: Product) => !addedIds.has(p.id)));
      } catch { setSkuResults([]); }
      finally { setSkuSearching(false); }
    }, 300);
    return () => { if (skuDebounceRef.current) clearTimeout(skuDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skuSearch]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q);
      const matchStatus = statusTab === 'All' || c.status === statusTab;
      return matchSearch && matchStatus;
    });
  }, [clients, search, statusTab]);

  const loadVisitHistory = async (c: Account) => {
    setDetailVisits([]);
    setDetailLoading(true);
    try {
      const sb = createClient();
      const { data } = await sb
        .from('recaps')
        .select(`
          visit_date,
          salesperson,
          recap_products (
            outcome,
            product:products ( wine_name )
          )
        `)
        .eq('account_id', c.id)
        .order('visit_date', { ascending: false })
        .limit(50);

      type RawRecap = {
        visit_date: string;
        salesperson: string;
        recap_products: Array<{
          outcome: string;
          product: { wine_name: string } | null;
        }>;
      };

      const rows: VisitRow[] = [];
      for (const r of (data ?? []) as unknown as RawRecap[]) {
        if (!r.recap_products || r.recap_products.length === 0) {
          rows.push({ visit_date: r.visit_date, salesperson: r.salesperson, wine_name: null, outcome: null });
        } else {
          for (const rp of r.recap_products) {
            rows.push({
              visit_date: r.visit_date,
              salesperson: r.salesperson,
              wine_name: rp.product?.wine_name ?? null,
              outcome: rp.outcome,
            });
          }
        }
      }
      setDetailVisits(rows);
    } catch {
      setDetailVisits([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadAccountSkus_ = async (c: Account) => {
    try {
      const sb = createClient();
      const skus = await getAccountSkus(sb, c.id);
      setAccountSkus_(skus);
    } catch { setAccountSkus_([]); }
  };

  const loadAccountContacts = async (c: Account) => {
    try {
      const res = await fetch(`/api/contacts?accountId=${c.id}&pageSize=100`);
      const result = await res.json();
      setAccountContacts(result.data ?? []);
    } catch { setAccountContacts([]); }
  };

  const openView = async (c: Account) => {
    setActiveClient(c);
    setMode('view');
    await Promise.all([loadVisitHistory(c), loadAccountSkus_(c), loadAccountContacts(c)]);
  };

  const openAdd = () => {
    setActiveClient(null);
    setForm(emptyForm());
    setErrors({});
    setSaveError(null);
    setEditSkus([]);
    setSkuSearch('');
    setSkuResults([]);
    setAccountContacts([]);
    setMode('add');
  };

  const openEdit = async (c: Account) => {
    setActiveClient(c);
    setForm(clientToForm(c));
    setErrors({});
    setSaveError(null);
    setSkuSearch('');
    setSkuResults([]);
    setMode('edit');
    try {
      const sb = createClient();
      const skus = await getAccountSkus(sb, c.id);
      setEditSkus(skus);
    } catch { setEditSkus([]); }
    await loadAccountContacts(c);
  };

  const closeSlide = () => {
    setMode('closed');
  };

  const fetchPage = useCallback(async (page: number, tab: AccountStatus | 'All') => {
    try {
      const sb = createClient();
      const status = tab === 'All' ? undefined : tab;
      const result = await getAccounts(sb, status, { page, pageSize: PAGE_SIZE }, teamId);
      setClients(result.data);
      setTotalCount(result.count);
      setCurrentPage(page);
    } catch {
      // Keep existing data on error
    }
  }, [teamId]);

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
    if (!confirm('Save changes to this account?')) return;
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
        account_lead: form.account_lead || null,
        primary_contact_id: form.primary_contact_id || null,
        city: null,
        state: null,
        country: null,
        team_id: teamId,
        status: form.status,
        notes: form.notes || null,
        is_active: true,
        ...(activeClient ? { id: activeClient.id } : {}),
      };

      const saved = await upsertAccount(sb, payload);
      await setAccountSkus(sb, saved.id, editSkus.map((p) => p.id), teamId);

      if (activeClient) {
        setClients((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      } else {
        setClients((prev) => [saved, ...prev]);
      }

      setMode('closed');
      router.refresh();
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setSaveError(e.error ?? e.message ?? 'Failed to save account.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!activeClient) return;
    if (!confirm(`Archive "${activeClient.name}"? It will be moved to Former status and excluded from new recaps.`)) return;
    const sb = createClient();
    try {
      await archiveAccount(sb, activeClient.id, teamId);
      setClients((prev) =>
        prev.map((c) => (c.id === activeClient.id ? { ...c, status: 'Former' as AccountStatus } : c)),
      );
      setMode('closed');
      router.refresh();
    } catch {
      setSaveError('Failed to archive account. Please try again.');
    }
  };

  const addEditSku = (p: Product) => {
    setEditSkus((prev) => [...prev, p]);
    setSkuSearch('');
    setSkuResults([]);
  };

  const removeEditSku = (id: string) => {
    setEditSkus((prev) => prev.filter((p) => p.id !== id));
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

  const slideoverOpen = mode !== 'closed';
  const slideoverTitle =
    mode === 'add' ? 'Add Account' :
    mode === 'edit' ? 'Edit Account' :
    activeClient?.name ?? 'Account';

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
            {search
              ? 'No accounts match your search'
              : statusTab === 'Prospective' ? 'No prospective accounts'
              : statusTab === 'Former' ? 'No former accounts'
              : 'No accounts yet'}
          </p>
          <p className={styles.emptyDesc}>
            {search
              ? 'Try a different name.'
              : statusTab === 'Prospective' ? 'Accounts marked as Prospective will appear here.'
              : statusTab === 'Former' ? 'Accounts moved to Former status will appear here.'
              : 'Add your first account to get started with sales recaps.'}
          </p>
          {!search && statusTab !== 'Prospective' && statusTab !== 'Former' && (
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
          <div className={styles.tableWrapper}>
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
                  <tr key={c.id} className={styles.tableRow} onClick={() => openView(c)}>
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
          </div>

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

      {/* ── Unified slideover ─────────────────────────────────────── */}
      <Slideover
        open={slideoverOpen}
        onClose={closeSlide}
        title={slideoverTitle}
        footer={
          mode === 'view' ? (
            <>
              <Button variant="secondary" onClick={closeSlide}>Close</Button>
              <Button variant="danger" onClick={handleArchive}>Archive</Button>
              <Button variant="primary" onClick={() => activeClient && openEdit(activeClient)}>Edit</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={mode === 'edit' ? () => activeClient && openView(activeClient) : closeSlide} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
            </>
          )
        }
      >
        {mode === 'view' && activeClient ? (
          <>
            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Account Info</h3>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Company Name</span>
                <span>{activeClient.name || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Type</span>
                <span>{activeClient.type || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Value Tier</span>
                <span>{activeClient.value_tier || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Phone</span>
                <span>{activeClient.phone || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Email</span>
                <span>{activeClient.email || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Address</span>
                <span>{activeClient.address || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Account Lead</span>
                <span>{activeClient.account_lead || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Primary Contact</span>
                <span>
                  {activeClient.primary_contact_id
                    ? (accountContacts.find((c) => c.id === activeClient.primary_contact_id)
                        ? contactFullName(accountContacts.find((c) => c.id === activeClient.primary_contact_id)!)
                        : '—')
                    : '—'}
                </span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Status</span>
                <span>{activeClient.status || '—'}</span>
              </div>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>Notes</span>
                <span>{activeClient.notes || '—'}</span>
              </div>
            </div>

            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Active SKUs</h3>
              {accountSkus.length === 0 ? (
                <p className={styles.detailEmpty}>No active SKUs assigned.</p>
              ) : (
                <ul className={styles.skuList}>
                  {accountSkus.map((p) => (
                    <li key={p.id} className={styles.skuItem}>
                      <span className={styles.skuItemName}>{p.wine_name}</span>
                      <span className={styles.skuItemNumber}>{p.sku_number}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className={styles.detailSection}>
              <h3 className={styles.detailSectionTitle}>Visit History</h3>
              {detailLoading ? (
                <p className={styles.detailEmpty}>Loading…</p>
              ) : detailVisits.length === 0 ? (
                <p className={styles.detailEmpty}>No visits recorded yet.</p>
              ) : (
                <div className={styles.visitTableWrapper}>
                  <table className={styles.visitTable}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Salesperson</th>
                        <th>Wine</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailVisits.map((v, i) => (
                        <tr key={i}>
                          <td>{v.visit_date}</td>
                          <td>{v.salesperson}</td>
                          <td>{v.wine_name ?? '—'}</td>
                          <td>{v.outcome ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (mode === 'edit' || mode === 'add') ? (
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
              <label className={styles.formLabel}>Account Lead</label>
              <input className={styles.formInput} value={form.account_lead} onChange={(e) => setField('account_lead', e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Primary Contact</label>
              <select
                className={styles.formSelect}
                value={form.primary_contact_id}
                onChange={(e) => setField('primary_contact_id', e.target.value)}
                disabled={mode === 'add'}
              >
                <option value="">None</option>
                {accountContacts.map((c) => (
                  <option key={c.id} value={c.id}>{contactFullName(c)}</option>
                ))}
              </select>
              {mode === 'add' && (
                <span className={styles.formHint}>Save the account first, then add contacts to set a primary contact.</span>
              )}
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

            <div className={`${styles.formField} ${styles.formGridFull}`}>
              <label className={styles.formLabel}>Active SKUs</label>
              {editSkus.length > 0 && (
                <div className={styles.skuChips}>
                  {editSkus.map((p) => (
                    <span key={p.id} className={styles.skuChip}>
                      {p.wine_name}
                      <span className={styles.skuChipSku}>{p.sku_number}</span>
                      <button
                        type="button"
                        className={styles.skuChipRemove}
                        onClick={() => removeEditSku(p.id)}
                        aria-label={`Remove ${p.wine_name}`}
                      >×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className={styles.skuSearchWrap}>
                <input
                  className={styles.formInput}
                  placeholder="Search by wine name or SKU…"
                  value={skuSearch}
                  onChange={(e) => setSkuSearch(e.target.value)}
                  autoComplete="off"
                />
                {skuSearching && <span className={styles.skuSearchSpinner}>Searching…</span>}
                {skuResults.length > 0 && (
                  <ul className={styles.skuDropdown}>
                    {skuResults.map((p) => (
                      <li
                        key={p.id}
                        className={styles.skuDropdownItem}
                        onMouseDown={(e) => { e.preventDefault(); addEditSku(p); }}
                      >
                        <span>{p.wine_name}</span>
                        <span className={styles.skuDropdownSku}>{p.sku_number}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {saveError && <p className={styles.saveError}>{saveError}</p>}
          </div>
        ) : null}
      </Slideover>
    </>
  );
}
