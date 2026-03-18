'use client';
// src/components/plan/PlanBuilderClient.tsx
// Client component for the plan builder page — lets users pick accounts and
// products for today's route, then saves to /api/plan/save.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AccountSelect } from '@/components/shared/AccountSelect';
import { ProductSearchInput } from '@/components/shared/ProductSearchInput';
import type { Account, Product } from '@/types';
import styles from './PlanBuilderClient.module.css';

interface Props {
  accounts: Account[];
}

export function PlanBuilderClient({ accounts }: Props) {
  const router = useRouter();
  const [selectedAccounts, setSelectedAccounts] = useState<Account[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addAccount = (id: string) => {
    if (!id) return;
    if (selectedAccounts.some((a) => a.id === id)) return;
    const account = accounts.find((a) => a.id === id);
    if (account) setSelectedAccounts((prev) => [...prev, account]);
  };

  const removeAccount = (id: string) =>
    setSelectedAccounts((prev) => prev.filter((a) => a.id !== id));

  const addProduct = (product: Product) => {
    if (selectedProducts.some((p) => p.id === product.id)) return;
    setSelectedProducts((prev) => [...prev, product]);
  };

  const removeProduct = (id: string) =>
    setSelectedProducts((prev) => prev.filter((p) => p.id !== id));

  const handleSave = async () => {
    if (selectedAccounts.length === 0) {
      setError('Select at least one account.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/plan/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_ids: selectedAccounts.map((a) => a.id),
          product_ids: selectedProducts.map((p) => p.id),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to save plan.');
        return;
      }
      router.push('/app/crm/plan/review');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Plan Today&apos;s Route</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Accounts</h2>
        <div className={styles.selectRow}>
          <AccountSelect
            accounts={accounts.filter((a) => !selectedAccounts.some((s) => s.id === a.id))}
            value=""
            onChange={addAccount}
            placeholder="Add an account…"
            className={styles.select}
          />
        </div>
        {selectedAccounts.length > 0 && (
          <ul className={styles.chipList}>
            {selectedAccounts.map((a) => (
              <li key={a.id} className={styles.chip}>
                {a.name}
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={() => removeAccount(a.id)}
                  aria-label={`Remove ${a.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Bag Products</h2>
        <ProductSearchInput
          onSelect={addProduct}
          excludeIds={selectedProducts.map((p) => p.id)}
          placeholder="Search products to add…"
          className={styles.searchInput}
        />
        {selectedProducts.length > 0 && (
          <ul className={styles.chipList}>
            {selectedProducts.map((p) => (
              <li key={p.id} className={styles.chip}>
                <span className={styles.sku}>{p.sku_number}</span> {p.wine_name}
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={() => removeProduct(p.id)}
                  aria-label={`Remove ${p.wine_name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className={styles.error}>{error}</p>}

      <button
        type="button"
        className={styles.saveBtn}
        onClick={handleSave}
        disabled={saving || selectedAccounts.length === 0}
      >
        {saving ? 'Saving…' : 'Start Route →'}
      </button>
    </div>
  );
}
