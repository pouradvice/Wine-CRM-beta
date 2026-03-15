'use client';
// src/components/reports/ManagerClient.tsx

import type { SalespersonStats, InactiveAccount, PipelineHealth } from '@/types';
import styles from './ManagerClient.module.css';

interface Props {
  teamStats: SalespersonStats[];
  inactiveAccounts: InactiveAccount[];
  pipelineHealth: PipelineHealth[];
}

const OUTCOME_ORDER = ['Yes Today', 'Yes Later', 'Maybe Later', 'No', 'Discussed'];
const OUTCOME_COLOR: Record<string, string> = {
  'Yes Today':  'var(--outcome-yes)',
  'Yes Later':  'var(--outcome-later)',
  'Maybe Later':'var(--outcome-maybe)',
  'No':         'var(--outcome-no)',
  'Discussed':  'var(--outcome-discussed)',
};

export function ManagerClient({ teamStats, inactiveAccounts, pipelineHealth }: Props) {
  const totalFollowUps = pipelineHealth.reduce((s, p) => s + p.count, 0);

  const sortedHealth = [...pipelineHealth].sort(
    (a, b) => OUTCOME_ORDER.indexOf(a.outcome) - OUTCOME_ORDER.indexOf(b.outcome),
  );

  return (
    <div className={styles.page}>
      <h2 className={styles.title}>Manager Overview</h2>

      {/* Team Stats Table */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Team Performance</h3>
        {teamStats.length === 0 ? (
          <p className={styles.empty}>No data yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th>Visits</th>
                  <th>Accounts</th>
                  <th>Products</th>
                  <th>Orders</th>
                  <th>Avg Prob</th>
                  <th>Last Visit</th>
                </tr>
              </thead>
              <tbody>
                {teamStats.map((s) => (
                  <tr key={s.salesperson}>
                    <td className={styles.bold}>{s.salesperson}</td>
                    <td>{s.total_visits}</td>
                    <td>{s.unique_accounts}</td>
                    <td>{s.products_shown}</td>
                    <td>{s.orders}</td>
                    <td>{s.avg_probability}%</td>
                    <td>{s.last_visit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pipeline Health */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Pipeline Health (Open Follow-Ups)</h3>
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

      {/* Inactive Accounts */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Inactive Accounts (60+ days)</h3>
        {inactiveAccounts.length === 0 ? (
          <p className={styles.empty}>All accounts visited within 60 days.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Lead</th>
                  <th>Value Tier</th>
                  <th>Last Visit</th>
                  <th>Days Since</th>
                </tr>
              </thead>
              <tbody>
                {inactiveAccounts.map((a) => {
                  const isHighPriority = a.value_tier?.toUpperCase() === 'A' && (a.days_since_visit ?? 0) >= 60;
                  return (
                    <tr key={a.id} className={isHighPriority ? styles.rowAlert : ''}>
                      <td className={styles.bold}>{a.company_name}</td>
                      <td>{a.account_lead ?? '—'}</td>
                      <td>
                        {a.value_tier ? (
                          <span className={`${styles.tier} ${isHighPriority ? styles.tierAlert : ''}`}>
                            {a.value_tier}
                          </span>
                        ) : '—'}
                      </td>
                      <td>{a.last_visit ?? 'Never'}</td>
                      <td>{a.days_since_visit !== null ? `${a.days_since_visit}d` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
