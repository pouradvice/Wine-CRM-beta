'use client';
// src/components/RecapForm/RecapForm.tsx
//
// Changes from Phase 1 baseline:
//   • No longer accepts a `products` prop — searches server-side via
//     GET /api/products?search=&limit=20 with 300 ms debounce.
//   • No longer accepts a `buyers` prop — fetches contacts from
//     GET /api/contacts?accountId= when the selected account changes.
//   • selectedProducts state holds the products already added to the recap
//     so their rows stay visible while the search field is in use.

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { saveRecap } from '@/lib/data';
import type {
  Account,
  Contact,
  Product,
  RecapFormState,
  RecapFormProduct,
  RecapOutcome,
  RecapNature,
} from '@/types';
import { contactFullName } from '@/types';
import styles from './RecapForm.module.css';

const OUTCOMES: RecapOutcome[] = [
  'Yes Today',
  'Yes Later',
  'Maybe Later',
  'No',
  'Discussed',
];

const OUTCOME_COLORS: Record<RecapOutcome, string> = {
  'Yes Today':   'var(--outcome-yes)',
  'Yes Later':   'var(--outcome-later)',
  'Maybe Later': 'var(--outcome-maybe)',
  'No':          'var(--outcome-no)',
  'Discussed':   'var(--outcome-discussed)',
};

interface Props {
  clients: Account[];
  currentUser: string;
}

function buildDefaultProduct(product: Product): RecapFormProduct {
  return {
    product_id: product.id,
    outcome: 'Discussed',
    order_probability: 0,
    buyer_feedback: '',
    follow_up_date: '',
    bill_date: '',
  };
}

export function RecapForm({ clients, currentUser }: Props) {
  const router = useRouter();
  const sb = createClient();
  const today = new Date().toISOString().split('T')[0];

  // ── Form state ───────────────────────────────────────────────
  const [form, setForm] = useState<RecapFormState>({
    visit_date: today,
    salesperson: currentUser,
    account_id: '',
    contact_id: null,
    contact_name: '',
    nature: 'Sales Call',
    expense_receipt_url: null,
    notes: null,
    products: [],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Product search state (item 5) ────────────────────────────
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  // Products already added — kept separately so rows don't disappear
  // when the user types in the search box.
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);


  // ── Debounced product search ──────────────────────────────────
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
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(productSearch)}&limit=20`,
        );
        const result = await res.json();
        // Filter out products already added to the recap
        const addedIds = new Set(form.products.map((p) => p.product_id));
        setSearchResults(
          (result.data ?? []).filter((p: Product) => !addedIds.has(p.id)),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch]);

  // ── Product management ────────────────────────────────────────
  const addProduct = useCallback((product: Product) => {
    setSelectedProducts((prev) => [...prev, product]);
    setForm((prev) => ({
      ...prev,
      products: [...prev.products, buildDefaultProduct(product)],
    }));
    setProductSearch('');
    setSearchResults([]);
  }, []);

  const removeProduct = useCallback((productId: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== productId));
    setForm((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.product_id !== productId),
    }));
  }, []);

  const updateProductField = useCallback(
    <K extends keyof RecapFormProduct>(
      productId: string,
      field: K,
      value: RecapFormProduct[K],
    ) => {
      setForm((prev) => ({
        ...prev,
        products: prev.products.map((p) =>
          p.product_id === productId ? { ...p, [field]: value } : p,
        ),
      }));
    },
    [],
  );

  // ── Submit ────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.account_id) {
      setError('Please select an account.');
      return;
    }
    if (form.products.length === 0) {
      setError('Add at least one product to this recap.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const recapId = await saveRecap(sb, form);
      router.push(`/app/crm/history?highlight=${recapId}`);
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setError(e.error ?? e.message ?? 'Failed to save recap. Please try again.');
      setSaving(false);
    }
  };

  const getFormProduct = (productId: string) =>
    form.products.find((p) => p.product_id === productId);

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>

      {/* ── Visit Details ──────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Visit Details</h2>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="visit_date" className={styles.label}>Date</label>
            <input
              id="visit_date"
              type="date"
              className={styles.input}
              value={form.visit_date}
              max={today}
              onChange={(e) => setForm((f) => ({ ...f, visit_date: e.target.value }))}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="nature" className={styles.label}>Visit Type</label>
            <select
              id="nature"
              className={styles.select}
              value={form.nature}
              onChange={(e) =>
                setForm((f) => ({ ...f, nature: e.target.value as RecapNature }))
              }
            >
              <option value="Sales Call">Sales Call</option>
              <option value="Depletion Meeting">Depletion Meeting</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="salesperson" className={styles.label}>Salesperson</label>
            <input
              id="salesperson"
              type="text"
              className={styles.input}
              value={form.salesperson}
              readOnly
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor="account_id" className={styles.label}>
              Account <span className={styles.required}>*</span>
            </label>
            <select
              id="account_id"
              className={styles.select}
              value={form.account_id}
              onChange={(e) => {
                const acct = clients.find((c) => c.id === e.target.value);
                const accountId = e.target.value;
                setForm((f) => ({
                  ...f,
                  account_id: accountId,
                  contact_id: null,
                  contact_name: acct?.account_lead ?? '',
                }));
                // Pre-fill contact name from primary contact if set
                if (acct?.primary_contact_id && accountId) {
                  fetch(`/api/contacts?accountId=${accountId}&pageSize=100`)
                    .then((res) => res.json())
                    .then((result) => {
                      const contacts: Contact[] = result.data ?? [];
                      const primary = contacts.find((c) => c.id === acct.primary_contact_id);
                      if (primary) {
                        setForm((f) => ({ ...f, contact_name: contactFullName(primary) }));
                      }
                    })
                    .catch(() => {/* keep account_lead fallback */});
                }
              }}
              required
            >
              <option value="">Select account…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="contact_name" className={styles.label}>Contact</label>
            <input
              id="contact_name"
              type="text"
              className={styles.input}
              value={form.contact_name}
              placeholder="Account lead or contact name"
              onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="notes" className={styles.label}>Visit Notes</label>
          <textarea
            id="notes"
            className={styles.textarea}
            rows={3}
            placeholder="General notes about this visit…"
            value={form.notes ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </section>

      {/* ── Products Shown ─────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Products Shown</h2>

        {/* Server-side search input */}
        <div className={styles.productSearch}>
          <input
            type="search"
            className={styles.input}
            placeholder="Search by name or SKU…"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />

          {/* Dropdown: show while typing */}
          {productSearch && (
            <ul className={styles.productDropdown}>
              {searching && (
                <li className={styles.productDropdownStatus}>Searching…</li>
              )}
              {!searching && searchResults.length === 0 && (
                <li className={styles.productDropdownStatus}>No results</li>
              )}
              {!searching && searchResults.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={styles.productDropdownItem}
                    onClick={() => addProduct(p)}
                  >
                    <span className={styles.productSku}>{p.sku_number}</span>
                    <span className={styles.productName}>{p.wine_name}</span>
                    {p.type && <span className={styles.productType}>{p.type}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {form.products.length === 0 && (
          <p className={styles.emptyHint}>
            Search for products above to add them to this recap.
          </p>
        )}

        {/* Product feedback rows — driven by selectedProducts so they stay
            visible regardless of what's in the search box */}
        {selectedProducts.map((product) => {
          const fp = getFormProduct(product.id);
          if (!fp) return null;

          return (
            <div key={product.id} className={styles.productRow}>
              <div className={styles.productRowHeader}>
                <div className={styles.productRowTitle}>
                  <span className={styles.productSku}>{product.sku_number}</span>
                  <span className={styles.productName}>{product.wine_name}</span>
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeProduct(product.id)}
                  aria-label="Remove product"
                >
                  ×
                </button>
              </div>

              <div className={styles.outcomeButtons}>
                {OUTCOMES.map((outcome) => (
                  <button
                    key={outcome}
                    type="button"
                    className={`${styles.outcomeBtn} ${
                      fp.outcome === outcome ? styles.outcomeBtnActive : ''
                    }`}
                    style={
                      fp.outcome === outcome
                        ? { background: OUTCOME_COLORS[outcome] }
                        : {}
                    }
                    onClick={() => {
                      updateProductField(product.id, 'outcome', outcome);
                      if (outcome === 'Yes Today') {
                        updateProductField(product.id, 'order_probability', 100);
                      } else if (outcome === 'No') {
                        updateProductField(product.id, 'order_probability', 0);
                      }
                    }}
                  >
                    {outcome}
                  </button>
                ))}
              </div>

              {fp.outcome === 'Yes Later' && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Bill Date</label>
                    <input
                      type="date"
                      className={styles.input}
                      value={fp.bill_date ?? ''}
                      onChange={(e) =>
                        updateProductField(product.id, 'bill_date', e.target.value)
                      }
                    />
                  </div>
                </div>
              )}

              {fp.outcome === 'Maybe Later' && (
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>Follow-up Date</label>
                    <input
                      type="date"
                      className={styles.input}
                      value={fp.follow_up_date ?? ''}
                      onChange={(e) =>
                        updateProductField(product.id, 'follow_up_date', e.target.value)
                      }
                    />
                  </div>
                </div>
              )}

              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    Order Probability ({fp.order_probability}%)
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    className={styles.range}
                    value={fp.order_probability ?? 0}
                    disabled={fp.outcome === 'Yes Today' || fp.outcome === 'No'}
                    onChange={(e) =>
                      updateProductField(
                        product.id,
                        'order_probability',
                        Number(e.target.value),
                      )
                    }
                  />
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Buyer Feedback</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="Brief note…"
                    value={fp.buyer_feedback ?? ''}
                    onChange={(e) =>
                      updateProductField(product.id, 'buyer_feedback', e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Actions ───────────────────────────────────── */}
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </button>
        <button type="submit" className={styles.saveBtn} disabled={saving}>
          {saving ? 'Saving…' : 'Save Recap'}
        </button>
      </div>
    </form>
  );
}
