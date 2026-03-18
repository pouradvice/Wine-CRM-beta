'use client';
// src/components/plan/PlanProductsClient.tsx
//
// Client Component for the "Start with Products" planning flow.
// Rep uses ProductSearchInput to build a multi-product bag, fetches account
// suggestions via POST /api/plan/suggest-accounts, selects accounts, then
// saves the plan via POST /api/plan/save.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Product, SuggestedAccount } from '@/types';
import { ProductSearchInput } from '@/components/shared/ProductSearchInput';
import styles from './PlanProductsClient.module.css';

interface Props {
  teamId: string;
}

export function PlanProductsClient({ teamId: _teamId }: Props) {
  const router = useRouter();

  // ── Product selection ─────────────────────────────────────────
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);

  // ── Account suggestions ───────────────────────────────────────
  const [suggestedAccounts, setSuggestedAccounts] = useState<SuggestedAccount[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());

  // ── Save state ────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addProduct(product: Product) {
    if (selectedProducts.some((p) => p.id === product.id)) return;
    setSelectedProducts((prev) => [...prev, product]);
    // Reset suggestions when bag changes
    setSuggestedAccounts([]);
    setSelectedAccountIds(new Set());
    setError(null);
  }

  function removeProduct(id: string) {
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));
    setSuggestedAccounts([]);
    setSelectedAccountIds(new Set());
    setError(null);
  }

  async function handleSuggestAccounts() {
    if (selectedProducts.length === 0) return;
    setLoadingSuggestions(true);
    setError(null);
    try {
      const res = await fetch('/api/plan/suggest-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: selectedProducts.map((p) => p.id) }),
      });
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      const data: SuggestedAccount[] = await res.json();
      setSuggestedAccounts(data);
      // Pre-select all suggested accounts
      setSelectedAccountIds(new Set(data.map((a) => a.account_id)));
    } catch {
      setError('Could not load account suggestions. Please try again.');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSavePlan() {
    if (selectedProducts.length === 0 || selectedAccountIds.size === 0) {
      setError('Select at least one product and one account.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_ids: Array.from(selectedAccountIds),
          product_ids: selectedProducts.map((p) => p.id),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to save plan');
      }
      router.push('/app/crm/plan/review');
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message ?? 'Failed to save plan. Please try again.');
      setSaving(false);
    }
  }

  const excludeIds = selectedProducts.map((p) => p.id);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/app/crm/plan" className={styles.backLink}>← Back</a>
        <h1 className={styles.heading}>Choose Products</h1>
        <p className={styles.subheading}>
          Search and add the wines you plan to pitch today ({selectedProducts.length} selected)
        </p>
      </header>

      {/* Product search */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Add Products</h2>
        <ProductSearchInput onSelect={addProduct} excludeIds={excludeIds} />

        {selectedProducts.length > 0 && (
          <ul className={styles.list}>
            {selectedProducts.map((p) => (
              <li key={p.id} className={styles.productRow}>
                <span className={styles.productSku}>{p.sku_number}</span>
                <span className={styles.productName}>{p.wine_name}</span>
                {p.type && <span className={styles.productType}>{p.type}</span>}
                <button
                  type="button"
                  className={styles.removeBtn}
                  onClick={() => removeProduct(p.id)}
                  aria-label={`Remove ${p.wine_name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {selectedProducts.length > 0 && suggestedAccounts.length === 0 && (
          <button
            type="button"
            className={styles.suggestBtn}
            onClick={handleSuggestAccounts}
            disabled={loadingSuggestions}
          >
            {loadingSuggestions ? 'Loading suggestions…' : 'Suggest Accounts →'}
          </button>
        )}
      </section>

      {/* Suggested accounts */}
      {suggestedAccounts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Suggested Accounts</h2>
          <p className={styles.sectionHint}>
            Uncheck any accounts you don't plan to visit today.
          </p>
          <ul className={styles.list}>
            {suggestedAccounts.map((a) => {
              const checked = selectedAccountIds.has(a.account_id);
              return (
                <li key={a.account_id}>
                  <label className={`${styles.listItem} ${checked ? styles.listItemSelected : ''}`}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={checked}
                      onChange={() => toggleAccount(a.account_id)}
                    />
                    <span className={styles.accountName}>{a.account_name}</span>
                    {a.value_tier && (
                      <span className={styles.tierBadge}>{a.value_tier}</span>
                    )}
                    <span className={styles.matchesBadge}>
                      Matches {a.products_matched} product{a.products_matched !== 1 ? 's' : ''}
                    </span>
                    {a.last_visit_date && (
                      <span className={styles.lastVisit}>
                        Last visit: {a.last_visit_date}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {suggestedAccounts.length > 0 && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSavePlan}
            disabled={saving || selectedAccountIds.size === 0}
          >
            {saving ? 'Saving…' : 'Save Plan'}
          </button>
        </div>
      )}
    </div>
  );
}
