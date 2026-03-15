'use client';
// src/components/history/HistoryClient.tsx

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getRecaps } from '@/lib/data';
import { OutcomeBadge } from '@/components/ui/Badge';
import type { Recap, Account, Contact, Product } from '@/types';
import styles from './HistoryClient.module.css';

interface HistoryClientProps {
  initialRecaps: Recap[];
  totalCount: number;
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

  const highlightRef = useRef<HTMLDivElement | null>(null);

  // Scroll to highlighted recap on mount
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId]);

  // Build unique accounts list from recaps
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
                    {contact && (
                      <span className={styles.recapBuyer}>with {contact.first_name}</span>
                    )}
                    <span className={styles.recapSalesperson}>{recap.salesperson}</span>
                    <span className={styles.recapType}>{recap.nature}</span>
                    <span className={styles.productCount}>
                      {products.length} product{products.length !== 1 ? 's' : ''}
                    </span>
                  </div>
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
    </>
  );
}
