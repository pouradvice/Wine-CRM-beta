'use client';
// src/components/history/HistoryClient.tsx

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getRecaps } from '@/lib/data';
import { OutcomeBadge } from '@/components/ui/Badge';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type { Recap, Account, Contact, Product, RecapNature } from '@/types';
import styles from './HistoryClient.module.css';

interface HistoryClientProps {
  initialRecaps: Recap[];
  totalCount: number;
}

interface EditForm {
  visit_date: string;
  nature: RecapNature;
  contact_name: string;
  notes: string;
}

export function HistoryClient({ initialRecaps }: HistoryClientProps) {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [recaps, setRecaps] = useState<Recap[]>(initialRecaps);
  const [expandedId, setExpandedId] = useState<string | null>(highlightId);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecap, setEditingRecap] = useState<Recap | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ visit_date: '', nature: 'Sales Call', contact_name: '', notes: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId]);

  const accountsInList = useMemo(() => {
    const seen = new Map<string, string>();
    recaps.forEach((r) => {
      if (r.account && !seen.has(r.account_id)) {
        seen.set(r.account_id, (r.account as Account).name);
      }
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [recaps]);

  const filtered = useMemo(() => {
    return recaps.filter((r) => {
      const matchFrom = !fromDate || r.visit_date >= fromDate;
      const matchTo = !toDate || r.visit_date <= toDate;
      const matchAccount = !accountFilter || r.account_id === accountFilter;
      const matchSalesperson =
        !salespersonFilter ||
        r.salesperson.toLowerCase().includes(salespersonFilter.toLowerCase());
      return matchFrom && matchTo && matchAccount && matchSalesperson;
    });
  }, [recaps, fromDate, toDate, accountFilter, salespersonFilter]);

  const applyFilters = async () => {
    setLoading(true);
    try {
      const sb = createClient();
      const result = await getRecaps(sb, {
        from: fromDate || undefined,
        to: toDate || undefined,
        accountId: accountFilter || undefined,
        salesperson: salespersonFilter || undefined,
        page: 0,
        pageSize: 50,
      });
      setRecaps(result.data);
    } catch {
      // Keep existing data
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const openEdit = (e: React.MouseEvent, recap: Recap) => {
    e.stopPropagation();
    setEditingRecap(recap);
    setEditForm({
      visit_date: recap.visit_date,
      nature: recap.nature,
      contact_name: recap.contact_name ?? '',
      notes: recap.notes ?? '',
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingRecap) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const sb = createClient();
      const { error } = await sb
        .from('recaps')
        .update({
          visit_date:   editForm.visit_date,
          nature:       editForm.nature,
          contact_name: editForm.contact_name || null,
          notes:        editForm.notes || null,
        })
        .eq('id', editingRecap.id);
      if (error) throw error;
      setRecaps((prev) =>
        prev.map((r) =>
          r.id === editingRecap.id
            ? { ...r, ...editForm, contact_name: editForm.contact_name || null, notes: editForm.notes || null }
            : r,
        ),
      );
      setEditOpen(false);
    } catch (err) {
      const e = err as { message?: string };
      setEditError(e.message ?? 'Failed to save. Please try again.');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <>
      <h1 className={styles.pageTitle}>Visit History</h1>

      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>From</label>
          <input
            type="date"
            className={styles.filterInput}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>To</label>
          <input
            type="date"
            className={styles.filterInput}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Account</label>
          <select
            className={styles.filterSelect}
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
          >
            <option value="">All accounts</option>
            {accountsInList.map(({ id, name }) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Salesperson</label>
          <input
            type="text"
            className={styles.filterInput}
            placeholder="Search…"
            value={salespersonFilter}
            onChange={(e) => setSalespersonFilter(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={applyFilters}
          disabled={loading}
          style={{
            marginTop: 'auto',
            padding: 'var(--space-2) var(--space-4)',
            background: 'var(--wine)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Loading…' : 'Apply'}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No visit recaps found</p>
          <p className={styles.emptyDesc}>
            Completed visit recaps will appear here. Use the New Recap button to record a visit.
          </p>
        </div>
      ) : (
        <div className={styles.recapList}>
          {filtered.map((recap) => {
            const isExpanded = expandedId === recap.id;
            const isHighlighted = recap.id === highlightId;
            const account = recap.account as Account | null;
            const contact = recap.contact as Contact | null;
            const products = recap.recap_products ?? [];

            return (
              <div
                key={recap.id}
                className={`${styles.recapRow} ${isHighlighted ? styles.highlighted : ''}`}
                ref={isHighlighted ? highlightRef : null}
              >
                <div
                  className={styles.recapHeader}
                  onClick={() => toggleExpand(recap.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && toggleExpand(recap.id)}
                  aria-expanded={isExpanded}
                >
                  <span className={styles.recapDate}>{recap.visit_date}</span>
                  <div className={styles.recapMeta}>
                    <span className={styles.recapClient}>{account?.name ?? '—'}</span>
                    {(recap.contact_name || contact?.first_name) && (
                      <span className={styles.recapBuyer}>with {recap.contact_name || contact?.first_name}</span>
                    )}
                    <span className={styles.recapSalesperson}>{recap.salesperson}</span>
                    <span className={styles.recapType}>{recap.nature}</span>
                    <span className={styles.productCount}>
                      {products.length} product{products.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={styles.editRecapBtn}
                    onClick={(e) => openEdit(e, recap)}
                    aria-label="Edit recap"
                  >
                    Edit
                  </button>
                  <span className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ''}`}>
                    ▼
                  </span>
                </div>

                {isExpanded && (
                  <div className={styles.recapDetail}>
                    {recap.notes && (
                      <div className={styles.detailNotes}>
                        <strong>Notes:</strong> {recap.notes}
                      </div>
                    )}
                    <div className={styles.productsGrid}>
                      {products.map((rp) => {
                        const product = rp.product as Product | null;
                        return (
                          <div key={rp.id} className={styles.productItem}>
                            <div className={styles.productInfo}>
                              <div className={styles.productSku}>{product?.sku_number}</div>
                              <div className={styles.productName}>{product?.wine_name}</div>
                              {rp.buyer_feedback && (
                                <div className={styles.productMeta}>
                                  Feedback: {rp.buyer_feedback}
                                </div>
                              )}
                              {rp.bill_date && (
                                <div className={styles.productMeta}>Bill date: {rp.bill_date}</div>
                              )}
                              {rp.follow_up_date && (
                                <div className={styles.productMeta}>
                                  Follow-up: {rp.follow_up_date}
                                </div>
                              )}
                              {rp.order_probability != null && (
                                <div className={styles.productMeta}>
                                  Probability: {rp.order_probability}%
                                </div>
                              )}
                            </div>
                            <OutcomeBadge outcome={rp.outcome} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit recap slideover ─────────────────────────────── */}
      <Slideover
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Recap"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
            <Button variant="primary" onClick={handleEditSave} loading={editSaving}>Save</Button>
          </>
        }
      >
        <div className={styles.editForm}>
          <div className={styles.editField}>
            <label className={styles.editLabel}>Date</label>
            <input
              type="date"
              className={styles.editInput}
              value={editForm.visit_date}
              onChange={(e) => setEditForm((f) => ({ ...f, visit_date: e.target.value }))}
            />
          </div>
          <div className={styles.editField}>
            <label className={styles.editLabel}>Visit Type</label>
            <select
              className={styles.editSelect}
              value={editForm.nature}
              onChange={(e) => setEditForm((f) => ({ ...f, nature: e.target.value as RecapNature }))}
            >
              <option value="Sales Call">Sales Call</option>
              <option value="Depletion Meeting">Depletion Meeting</option>
            </select>
          </div>
          <div className={styles.editField}>
            <label className={styles.editLabel}>Contact</label>
            <input
              type="text"
              className={styles.editInput}
              value={editForm.contact_name}
              placeholder="Contact / account lead name"
              onChange={(e) => setEditForm((f) => ({ ...f, contact_name: e.target.value }))}
            />
          </div>
          <div className={styles.editField}>
            <label className={styles.editLabel}>Notes</label>
            <textarea
              className={styles.editTextarea}
              rows={4}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
          {editError && <p className={styles.editError}>{editError}</p>}
        </div>
      </Slideover>
    </>
  );
}
