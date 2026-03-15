'use client';
// src/components/reports/SalespersonClient.tsx

import { useState, useMemo } from 'react';
import type { SalespersonStats, SalespersonWeeklyTrend } from '@/types';
import BarChart from '@/components/ui/BarChart';
import styles from './SalespersonClient.module.css';

interface Props {
  allStats: SalespersonStats[];
  /** Team-wide trend (no salesperson filter) — used when "All" selected. */
  allTrend: SalespersonWeeklyTrend[];
}

export function SalespersonClient({ allStats, allTrend }: Props) {
  const [selected, setSelected] = useState<string>('__all__');

  const salespersonNames = useMemo(
    () => Array.from(new Set(allStats.map((s) => s.salesperson))).sort(),
    [allStats],
  );

  // Filter stats to selected salesperson
  const filteredStats = selected === '__all__'
    ? allStats
    : allStats.filter((s) => s.salesperson === selected);

  // Build per-salesperson weekly trend from allTrend (already team-wide)
  // For a specific salesperson we re-derive from allStats — but since we only
  // have pre-aggregated allTrend (team), we show it for "All" and blank for single.
  // In a future sprint an individual trend could be fetched client-side.
  const trendToShow: SalespersonWeeklyTrend[] = selected === '__all__' ? allTrend : [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Salesperson Report</h2>
        <div className={styles.filterRow}>
          <label htmlFor="sp-select" className={styles.filterLabel}>Salesperson</label>
          <select
            id="sp-select"
            className={styles.select}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="__all__">All</option>
            {salespersonNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Weekly trend chart */}
      {trendToShow.length > 0 && (
        <section className={styles.chartSection}>
          <h3 className={styles.sectionTitle}>12-Week Visit Trend (Team)</h3>
          <BarChart data={trendToShow} label="Visits per week" />
        </section>
      )}

      {/* Stats table */}
      <section>
        <h3 className={styles.sectionTitle}>Performance Summary</h3>
        {filteredStats.length === 0 ? (
          <p className={styles.empty}>No data found.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th>Total Visits</th>
                  <th>Accounts Seen</th>
                  <th>Orders Placed</th>
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((s) => (
                  <tr key={s.salesperson}>
                    <td className={styles.bold}>{s.salesperson}</td>
                    <td>{s.total_visits}</td>
                    <td>{s.accounts_seen}</td>
                    <td>{s.orders_placed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
