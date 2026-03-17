'use client';
// src/components/history/HistoryClient.tsx

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getRecaps } from '@/lib/data';
import { OutcomeBadge } from '@/components/ui/Badge';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type { Recap, Account, Contact, Product, RecapNature, RecapOutcome } from '@/types';
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

interface EditProduct {
  rpId: string | null;  // recap_products.id; null = newly added
  product_id: string;
  wine_name: string;
  sku_number: string;
  outcome: RecapOutcome;
  order_probability: number;
  buyer_feedback: string;
  follow_up_date: string;
  bill_date: string;
}

const OUTCOMES: RecapOutcome[] = ['Yes Today', 'Yes Later', 'Maybe Later', 'No', 'Discussed'];

function defaultEditProduct(product: Product): EditProduct {
  return {
    rpId: null,
    product_id: product.id,
    wine_name: product.wine_name,
    sku_number: product.sku_number,
    outcome: 'Discussed',
    order_probability: 0,
    buyer_feedback: '',
    follow_up_date: '',
    bill_date: '',
  };
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

  // Edit state — recap fields
  const [editOpen, setEditOpen] = useState(false);
  const [editingRecap, setEditingRecap] = useState<Recap | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ visit_date: '', nature: 'Sales Call', contact_name: '', notes: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Edit state — products
  const [editProducts, setEditProducts] = useState<EditProduct[]>([]);
  const [removedRpIds, setRemovedRpIds] = useState<string[]>([]);

  // Product search (within edit)
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId]);

  // Debounced product search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!productSearch.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&limit=20`);
        const result = await res.json();
        const addedIds = new Set(editProducts.map((p) => p.product_id));
        setSearchResults((result.data ?? []).filter((p: Product) => !addedIds.has(p.id)));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch]);

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
    const prods: EditProduct[] = (recap.recap_products ?? []).map((rp) => {
      const product = rp.product as Product | null;
      return {
        rpId: rp.id,
        product_id: rp.product_id,
        wine_name: product?.wine_name ?? '',
        sku_number: product?.sku_number ?? '',
        outcome: rp.outcome,
        order_probability: rp.order_probability ?? 0,
        buyer_feedback: rp.buyer_feedback ?? '',
        follow_up_date: rp.follow_up_date ?? '',
        bill_date: rp.bill_date ?? '',
      };
    });
    setEditProducts(prods);
    setRemovedRpIds([]);
    setProductSearch('');
    setSearchResults([]);
    setEditError(null);
    setEditOpen(true);
  };

  const updateEditProduct = (idx: number, patch: Partial<EditProduct>) => {
    setEditProducts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const removeEditProduct = (idx: number) => {
    setEditProducts((prev) => {
      const p = prev[idx];
      if (p.rpId) setRemovedRpIds((r) => [...r, p.rpId!]);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const addProductFromSearch = (product: Product) => {
    setEditProducts((prev) => [...prev, defaultEditProduct(product)]);
    setProductSearch('');
    setSearchResults([]);
  };

  const handleEditSave = async () => {
    if (!editingRecap) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const sb = createClient();

      // 1. Update recap fields
      const { error: recapErr } = await sb
        .from('recaps')
        .update({
          visit_date:   editForm.visit_date,
          nature:       editForm.nature,
          contact_name: editForm.contact_name || null,
          notes:        editForm.notes || null,
        })
        .eq('id', editingRecap.id);
      if (recapErr) throw recapErr;

      // 2. Delete removed recap_products
      if (removedRpIds.length > 0) {
        const { error: delErr } = await sb
          .from('recap_products')
          .delete()
          .in('id', removedRpIds);
        if (delErr) throw delErr;
      }

      // 3. Update existing recap_products
      for (const p of editProducts.filter((p) => p.rpId)) {
        const { error: upErr } = await sb
          .from('recap_products')
          .update({
            outcome:           p.outcome,
            order_probability: p.order_probability,
            buyer_feedback:    p.buyer_feedback || null,
            follow_up_date:    p.follow_up_date || null,
            bill_date:         p.bill_date || null,
          })
          .eq('id', p.rpId!);
        if (upErr) throw upErr;
      }

      // 4. Insert new recap_products
      const newProds = editProducts.filter((p) => !p.rpId);
      if (newProds.length > 0) {
        const { error: insErr } = await sb
          .from('recap_products')
          .insert(
            newProds.map((p) => ({
              recap_id:          editingRecap.id,
              product_id:        p.product_id,
              outcome:           p.outcome,
              order_probability: p.order_probability,
              buyer_feedback:    p.buyer_feedback || null,
              follow_up_date:    p.follow_up_date || null,
              bill_date:         p.bill_date || null,
            })),
          );
        if (insErr) throw insErr;
      }

      // Update local state
      setRecaps((prev) =>
        prev.map((r) => {
          if (r.id !== editingRecap.id) return r;
          const updatedProducts = editProducts.map((p) => ({
            id: p.rpId ?? crypto.randomUUID(),
            recap_id: r.id,
            product_id: p.product_id,
            supplier_id: null,
            outcome: p.outcome,
            order_probability: p.order_probability,
            buyer_feedback: p.buyer_feedback || null,
            follow_up_required: false,
            follow_up_date: p.follow_up_date || null,
            bill_date: p.bill_date || null,
            created_at: '',
            product: { id: p.product_id, wine_name: p.wine_name, sku_number: p.sku_number } as Product,
          }));
          return {
            ...r,
            visit_date:   editForm.visit_date,
            nature:       editForm.nature,
            contact_name: editForm.contact_name || null,
            notes:        editForm.notes || null,
            recap_products: updatedProducts,
          };
        }),
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
          {/* ── Visit fields ── */}
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
              rows={3}
              value={editForm.notes}
              onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          {/* ── Products ── */}
          <div className={styles.editSectionTitle}>Products</div>

          {editProducts.map((p, idx) => (
            <div key={p.rpId ?? `new-${idx}`} className={styles.editProductItem}>
              <div className={styles.editProductHeader}>
                <div>
                  <span className={styles.productSku}>{p.sku_number}</span>{' '}
                  <span className={styles.productName}>{p.wine_name}</span>
                </div>
                <button
                  type="button"
                  className={styles.editProductRemove}
                  onClick={() => removeEditProduct(idx)}
                  aria-label="Remove product"
                >
                  ×
                </button>
              </div>
              <div className={styles.editProductFields}>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>Outcome</label>
                  <select
                    className={styles.editSelect}
                    value={p.outcome}
                    onChange={(e) => {
                      const o = e.target.value as RecapOutcome;
                      updateEditProduct(idx, {
                        outcome: o,
                        order_probability: o === 'Yes Today' ? 100 : o === 'No' ? 0 : p.order_probability,
                      });
                    }}
                  >
                    {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>Probability ({p.order_probability}%)</label>
                  <input
                    type="range"
                    min={0} max={100} step={5}
                    className={styles.editRange}
                    value={p.order_probability}
                    disabled={p.outcome === 'Yes Today' || p.outcome === 'No'}
                    onChange={(e) => updateEditProduct(idx, { order_probability: Number(e.target.value) })}
                  />
                </div>
                <div className={styles.editField}>
                  <label className={styles.editLabel}>Buyer Feedback</label>
                  <input
                    type="text"
                    className={styles.editInput}
                    value={p.buyer_feedback}
                    onChange={(e) => updateEditProduct(idx, { buyer_feedback: e.target.value })}
                  />
                </div>
                {(p.outcome === 'Yes Later') && (
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Bill Date</label>
                    <input
                      type="date"
                      className={styles.editInput}
                      value={p.bill_date}
                      onChange={(e) => updateEditProduct(idx, { bill_date: e.target.value })}
                    />
                  </div>
                )}
                {(p.outcome === 'Maybe Later') && (
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Follow-up Date</label>
                    <input
                      type="date"
                      className={styles.editInput}
                      value={p.follow_up_date}
                      onChange={(e) => updateEditProduct(idx, { follow_up_date: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add product search */}
          <div className={styles.editField}>
            <label className={styles.editLabel}>Add Product</label>
            <div className={styles.editProductSearch}>
              <input
                type="search"
                className={styles.editInput}
                placeholder="Search by name or SKU…"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
              />
              {productSearch && (
                <ul className={styles.editProductDropdown}>
                  {searching && <li className={styles.editDropdownStatus}>Searching…</li>}
                  {!searching && searchResults.length === 0 && (
                    <li className={styles.editDropdownStatus}>No results</li>
                  )}
                  {!searching && searchResults.map((prod) => (
                    <li key={prod.id}>
                      <button
                        type="button"
                        className={styles.editDropdownItem}
                        onClick={() => addProductFromSearch(prod)}
                      >
                        <span className={styles.productSku}>{prod.sku_number}</span>{' '}
                        <span>{prod.wine_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {editError && <p className={styles.editError}>{editError}</p>}
        </div>
      </Slideover>
    </>
  );
}
