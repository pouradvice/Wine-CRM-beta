'use client';
// src/components/plan/PlanAccountsClient.tsx
//
// Client Component for the "Start with Accounts" planning flow.
// Allows the rep to multi-select accounts, fetches product suggestions via
// POST /api/plan/suggest-products, lets the rep confirm the product bag,
// then saves the plan via POST /api/plan/save.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Account, SuggestedProduct } from '@/types';
import styles from './PlanAccountsClient.module.css';

interface Props {
  accounts: Account[];
  teamId:   string;
}

export function PlanAccountsClient({ accounts, teamId }: Props) {
  const router = useRouter();

  // ── Account selection ─────────────────────────────────────────
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());

  // ── Product suggestions ───────────────────────────────────────
  const [suggestedProducts, setSuggestedProducts] = useState<SuggestedProduct[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // ── Save state ────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // Reset suggestions when selection changes
    setSuggestedProducts([]);
    setSelectedProductIds(new Set());
    setError(null);
  }

  async function handleSuggestProducts() {
    if (selectedAccountIds.size === 0) return;
    setLoadingSuggestions(true);
    setError(null);
    try {
      const res = await fetch('/api/plan/suggest-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_ids: Array.from(selectedAccountIds) }),
      });
      if (!res.ok) throw new Error('Failed to fetch suggestions');
      const data: SuggestedProduct[] = await res.json();
      setSuggestedProducts(data);
      // Pre-select all suggested products
      setSelectedProductIds(new Set(data.map((p) => p.product_id)));
    } catch {
      setError('Could not load product suggestions. Please try again.');
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function toggleProduct(id: string) {
    setSelectedProductIds((prev) => {
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
    if (selectedAccountIds.size === 0 || selectedProductIds.size === 0) {
      setError('Select at least one account and one product.');
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
          product_ids: Array.from(selectedProductIds),
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

  const accountsTotal = accounts.length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <a href="/app/crm/plan" className={styles.backLink}>← Back</a>
        <h1 className={styles.heading}>Choose Accounts</h1>
        <p className={styles.subheading}>
          Select the accounts you plan to visit today ({selectedAccountIds.size} selected)
        </p>
      </header>

      {/* Account list */}
      <section className={styles.section}>
        {accountsTotal === 0 && (
          <p className={styles.emptyHint}>No active accounts found.</p>
        )}
        <ul className={styles.list}>
          {accounts.map((acct) => {
            const checked = selectedAccountIds.has(acct.id);
            return (
              <li key={acct.id}>
                <label className={`${styles.listItem} ${checked ? styles.listItemSelected : ''}`}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={checked}
                    onChange={() => toggleAccount(acct.id)}
                  />
                  <span className={styles.accountName}>{acct.name}</span>
                  {acct.value_tier && (
                    <span className={styles.tierBadge}>{acct.value_tier}</span>
                  )}
                  {acct.city && (
                    <span className={styles.city}>{acct.city}</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>

        {selectedAccountIds.size > 0 && suggestedProducts.length === 0 && (
          <button
            type="button"
            className={styles.suggestBtn}
            onClick={handleSuggestProducts}
            disabled={loadingSuggestions}
          >
            {loadingSuggestions ? 'Loading suggestions…' : 'Suggest Products →'}
          </button>
        )}
      </section>

      {/* Suggested products */}
      {suggestedProducts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Suggested Products</h2>
          <p className={styles.sectionHint}>
            Uncheck any products you don't want to bring today.
          </p>
          <ul className={styles.list}>
            {suggestedProducts.map((p) => {
              const checked = selectedProductIds.has(p.product_id);
              return (
                <li key={p.product_id}>
                  <label className={`${styles.listItem} ${checked ? styles.listItemSelected : ''}`}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={checked}
                      onChange={() => toggleProduct(p.product_id)}
                    />
                    <span className={styles.productSku}>{p.sku_number}</span>
                    <span className={styles.productName}>{p.wine_name}</span>
                    <span className={styles.coversBadge}>
                      Covers {p.accounts_covered} of {selectedAccountIds.size}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {suggestedProducts.length > 0 && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSavePlan}
            disabled={saving || selectedProductIds.size === 0}
          >
            {saving ? 'Saving…' : 'Save Plan'}
          </button>
        </div>
      )}
    </div>
  );
}
