'use client';
// src/components/reports/DashboardClient.tsx

import { useState } from 'react';
import type { DashboardStats, ProductPerformance, TopAccount, InactiveAccount, PipelineHealth } from '@/types';
import styles from './DashboardClient.module.css';

interface Props {
  stats:            DashboardStats;
  topSkus:          ProductPerformance[];
  topAccounts:      TopAccount[];
  inactiveAccounts: InactiveAccount[];
  pipelineHealth:   PipelineHealth[];
}

const OUTCOME_ORDER = ['Yes Today', 'Yes Later', 'Maybe Later', 'No', 'Discussed'];
const OUTCOME_COLOR: Record<string, string> = {
  'Yes Today':   'var(--outcome-yes)',
  'Yes Later':   'var(--outcome-later)',
  'Maybe Later': 'var(--outcome-maybe)',
  'No':          'var(--outcome-no)',
  'Discussed':   'var(--outcome-discussed)',
};

export function DashboardClient({ stats, topSkus, topAccounts, inactiveAccounts, pipelineHealth }: Props) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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

  const totalFollowUps = pipelineHealth.reduce((s, p) => s + p.count, 0);
  const sortedHealth = [...pipelineHealth].sort(
    (a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome),
  );

  return (
    <div className={styles.page}>

      {/* ── KPI strip ─────────────────────────────────────── */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiValue}>{stats.total_accounts}</span>
          <span className={styles.kpiLabel}>Total Accounts</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiValue}>{stats.visits_this_month}</span>
          <span className={styles.kpiLabel}>Visits This Month</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={styles.kpiValue}>{stats.active_follow_ups}</span>
          <span className={styles.kpiLabel}>Active Follow-Ups</span>
        </div>
        <div className={styles.kpiCard}>
          <span className={`${styles.kpiValue} ${styles.kpiWine}`}>
            {stats.conversion_rate_pct != null ? `${stats.conversion_rate_pct}%` : '—'}
          </span>
          <span className={styles.kpiLabel}>Conversion Rate</span>
        </div>
      </div>

      {/* ── AI Summary ────────────────────────────────────── */}
      <div className={styles.summaryRow}>
        <button
          type="button"
          className={styles.summaryBtn}
          onClick={handleGenerateSummary}
          disabled={loadingSummary}
        >
          {loadingSummary ? 'Generating…' : 'Generate Weekly Summary'}
        </button>
      </div>

      {(summary || summaryError) && (
        <div className={`${styles.summaryBox} ${summaryError ? styles.summaryBoxError : ''}`}>
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

      {/* ── Top 5 tables ──────────────────────────────────── */}
      <div className={styles.tables}>
        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Top 5 Products</h3>
          </div>
          {topSkus.length === 0 ? (
            <p className={styles.empty}>No data yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Wine</th>
                  <th className={styles.numCell}>Shown</th>
                  <th className={styles.numCell}>Orders</th>
                  <th className={styles.numCell}>Conv %</th>
                </tr>
              </thead>
              <tbody>
                {topSkus.map((p) => (
                  <tr key={p.product_id}>
                    <td className={styles.mono}>{p.sku_number}</td>
                    <td>{p.wine_name}</td>
                    <td className={styles.numCell}>{p.times_shown}</td>
                    <td className={styles.numCell}>{p.orders_placed}</td>
                    <td className={styles.numCell}>
                      {p.conversion_rate_pct !== null ? `${p.conversion_rate_pct}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className={styles.tableSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Top 5 Accounts</h3>
          </div>
          {topAccounts.length === 0 ? (
            <p className={styles.empty}>No data yet.</p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th className={styles.numCell}>Visits</th>
                  <th className={styles.numCell}>Orders</th>
                </tr>
              </thead>
              <tbody>
                {topAccounts.map((a) => (
                  <tr key={a.account_id}>
                    <td>{a.account_name}</td>
                    <td className={styles.numCell}>{a.total_visits}</td>
                    <td className={styles.numCell}>{a.orders_placed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* ── Pipeline Health ───────────────────────────────── */}
      <section className={styles.fullSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Pipeline Health</h3>
          {totalFollowUps > 0 && (
            <span className={styles.sectionMeta}>{totalFollowUps} open follow-ups</span>
          )}
        </div>
        {sortedHealth.length === 0 ? (
          <p className={styles.empty}>No open follow-ups.</p>
        ) : (
          <div className={styles.pipeline}>
            {sortedHealth.map((p) => {
              const pct = totalFollowUps > 0 ? (p.count / totalFollowUps) * 100 : 0;
              return (
                <div key={p.outcome} className={styles.pipelineRow}>
                  <span className={styles.pipelineLabel}>{p.outcome}</span>
                  <div className={styles.pipelineTrack}>
                    <div
                      className={styles.pipelineBar}
                      style={{
                        width: `${pct.toFixed(1)}%`,
                        background: OUTCOME_COLOR[p.outcome] ?? 'var(--mist-dark)',
                      }}
                    />
                  </div>
                  <span className={styles.pipelineCount}>{p.count}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Inactive Accounts ─────────────────────────────── */}
      <section className={styles.fullSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Inactive Accounts</h3>
          <span className={styles.sectionMeta}>60+ days since last visit</span>
        </div>
        {inactiveAccounts.length === 0 ? (
          <p className={styles.empty}>All accounts visited within 60 days.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Account</th>
                <th>Last Visit</th>
                <th className={styles.numCell}>Days Since</th>
              </tr>
            </thead>
            <tbody>
              {inactiveAccounts.map((a) => (
                <tr key={a.account_id}>
                  <td className={styles.bold}>{a.account_name}</td>
                  <td className={a.last_visit_date == null || a.days_inactive >= 90 ? styles.urgent : undefined}>
                    {a.last_visit_date ?? 'Never'}
                  </td>
                  <td className={`${styles.numCell} ${a.days_inactive >= 90 ? styles.urgent : ''}`}>
                    {a.days_inactive >= 0 ? `${a.days_inactive}d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

    </div>
  );
}
