'use client';
// src/components/reports/DashboardClient.tsx

import { useState } from 'react';
import type { DashboardStats, ProductPerformance, TopAccount } from '@/types';
import styles from './DashboardClient.module.css';

interface Props {
  stats: DashboardStats;
  topSkus: ProductPerformance[];
  topAccounts: TopAccount[];
}

interface KpiTile {
  label: string;
  value: number | string;
  accent?: boolean;
}

export function DashboardClient({ stats, topSkus, topAccounts }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const tiles: KpiTile[] = [
    { label: 'Total accounts',   value: stats.total_accounts },
    { label: 'Visits this month', value: stats.visits_this_month },
    { label: 'Active follow-ups', value: stats.active_follow_ups },
    { label: 'Conversion rate',   value: stats.conversion_rate_pct != null ? `${stats.conversion_rate_pct}%` : '—' },
  ];

  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stats, topSkus, topAccounts }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error ?? 'Request failed');
      }
      const json = await res.json();
      setSummary(json.summary);
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : 'Failed to generate summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>KPI Dashboard</h2>
        <button
          type="button"
          className={styles.summaryBtn}
          onClick={handleGenerateSummary}
          disabled={loadingSummary}
        >
          {loadingSummary ? 'Generating…' : 'Generate Weekly Summary'}
        </button>
      </div>

      {/* KPI tiles */}
      <div className={styles.kpiGrid}>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`${styles.tile} ${tile.accent ? styles.tileAccent : ''}`}
          >
            <span className={styles.tileValue}>{tile.value}</span>
            <span className={styles.tileLabel}>{tile.label}</span>
          </div>
        ))}
      </div>

      {/* AI Summary */}
      {(summary || summaryError) && (
        <div className={`${styles.summaryBox} ${summaryError ? styles.summaryError : ''}`}>
          {summaryError ? (
            <p className={styles.summaryText}>{summaryError}</p>
          ) : (
            <>
              <p className={styles.summaryHeading}>Weekly AI Summary</p>
              <p className={styles.summaryText}>{summary}</p>
            </>
          )}
        </div>
      )}

      <div className={styles.tables}>
        {/* Top SKUs */}
        <section className={styles.tableSection}>
          <h3 className={styles.sectionTitle}>Top 5 Products</h3>
          {topSkus.length === 0 ? (
            <p className={styles.empty}>No data yet.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Wine</th>
                    <th>Shown</th>
                    <th>Orders</th>
                    <th>Conv %</th>
                  </tr>
                </thead>
                <tbody>
                  {topSkus.map((p) => (
                    <tr key={p.product_id}>
                      <td className={styles.mono}>{p.sku_number}</td>
                      <td>{p.wine_name}</td>
                      <td>{p.times_shown}</td>
                      <td>{p.orders_placed}</td>
                      <td>{p.conversion_rate_pct !== null ? `${p.conversion_rate_pct}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Top Accounts */}
        <section className={styles.tableSection}>
          <h3 className={styles.sectionTitle}>Top 5 Accounts</h3>
          {topAccounts.length === 0 ? (
            <p className={styles.empty}>No data yet.</p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Visits</th>
                    <th>Orders</th>
                  </tr>
                </thead>
                <tbody>
                  {topAccounts.map((a) => (
                    <tr key={a.account_id}>
                      <td>{a.account_name}</td>
                      <td>{a.total_visits}</td>
                      <td>{a.orders_placed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
