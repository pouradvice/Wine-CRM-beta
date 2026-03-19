'use client';
// src/components/reports/DashboardClient.tsx

import type { DashboardStats, ProductPerformance, TopAccount, InactiveAccount, PipelineHealth } from '@/types';
import styles from './DashboardClient.module.css';

interface Props {
  stats:            DashboardStats;
  topSkus:          ProductPerformance[];
  topAccounts:      TopAccount[];
  inactiveAccounts: InactiveAccount[];
  pipelineHealth:   PipelineHealth[];
  allPerformance?:  ProductPerformance[];
}

const OUTCOME_ORDER = ['Yes Today', 'Yes Later', 'Maybe Later', 'No', 'Discussed'];
const OUTCOME_COLOR: Record<string, string> = {
  'Yes Today':   'var(--outcome-yes)',
  'Yes Later':   'var(--outcome-later)',
  'Maybe Later': 'var(--outcome-maybe)',
  'No':          'var(--outcome-no)',
  'Discussed':   'var(--outcome-discussed)',
};

export function DashboardClient({ stats, topSkus, topAccounts, inactiveAccounts, pipelineHealth, allPerformance }: Props) {
  const totalFollowUps = pipelineHealth.reduce((s, p) => s + p.count, 0);
  const sortedHealth = [...pipelineHealth].sort(
    (a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome),
  );

  // Compute total menu placements from all performance data (or topSkus if not provided)
  const perfSource = allPerformance ?? topSkus;
  const totalPlacements = perfSource.reduce((sum, p) => sum + (p.menu_placements ?? 0), 0);
  const topPlacementProducts = [...perfSource]
    .filter((p) => (p.menu_placements ?? 0) > 0)
    .sort((a, b) => (b.menu_placements ?? 0) - (a.menu_placements ?? 0))
    .slice(0, 5);

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

      {/* ── Menu Placement Wins ───────────────────────── */}
      <section className={styles.fullSection}>
        <div className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>Menu Placement Wins</h3>
          {totalPlacements > 0 && (
            <span className={styles.sectionMeta}>{totalPlacements} total placements</span>
          )}
        </div>
        {topPlacementProducts.length === 0 ? (
          <p className={styles.empty}>No menu placements recorded yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Wine</th>
                <th className={styles.numCell}>Placements</th>
              </tr>
            </thead>
            <tbody>
              {topPlacementProducts.map((p) => (
                <tr key={p.product_id}>
                  <td className={styles.mono}>{p.sku_number}</td>
                  <td>{p.wine_name}</td>
                  <td className={styles.numCell}>{p.menu_placements}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
