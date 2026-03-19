'use client';
// src/components/reports/ByAccountsClient.tsx

import { useState, useMemo } from 'react';
import type { AccountReportRow } from '@/types';
import styles from './ReportsClient.module.css';

interface Props {
  accounts: AccountReportRow[];
  onAccountClick?: (id: string, name: string) => void;
}

type SortKey = 'account_name' | 'visit_count' | 'last_visit_date' | 'orders_placed';

export function ByAccountsClient({ accounts, onAccountClick }: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('visit_count');
  const [asc, setAsc] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAsc((v) => !v);
    else { setSort(key); setAsc(false); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return accounts
      .filter((a) => !q || a.account_name.toLowerCase().includes(q))
      .sort((x, y) => {
        let cmp = 0;
        if (sort === 'account_name') {
          cmp = x.account_name.localeCompare(y.account_name);
        } else if (sort === 'visit_count') {
          cmp = x.visit_count - y.visit_count;
        } else if (sort === 'orders_placed') {
          cmp = x.orders_placed - y.orders_placed;
        } else if (sort === 'last_visit_date') {
          const a = x.last_visit_date ?? '';
          const b = y.last_visit_date ?? '';
          cmp = a < b ? -1 : a > b ? 1 : 0;
        }
        return asc ? cmp : -cmp;
      });
  }, [accounts, search, sort, asc]);

  const SortArrow = ({ col }: { col: SortKey }) =>
    sort === col ? <span className={styles.sortArrow}>{asc ? '↑' : '↓'}</span> : null;

  if (accounts.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No accounts yet</p>
        <p className={styles.emptyDesc}>Add accounts and record visit recaps to see data here.</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>By Account</span>
        <span className={styles.sectionMeta}>{filtered.length} accounts</span>
      </div>
      <div style={{ padding: '0.75rem 1.25rem' }}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search accounts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th
              className={styles.sortable}
              onClick={() => toggleSort('account_name')}
            >
              Account <SortArrow col="account_name" />
            </th>
            <th>Type</th>
            <th>Tier</th>
            <th>Status</th>
            <th
              className={`${styles.numCell} ${styles.sortable}`}
              onClick={() => toggleSort('visit_count')}
            >
              Visits <SortArrow col="visit_count" />
            </th>
            <th
              className={`${styles.numCell} ${styles.sortable}`}
              onClick={() => toggleSort('orders_placed')}
            >
              Orders <SortArrow col="orders_placed" />
            </th>
            <th
              className={`${styles.numCell} ${styles.sortable}`}
              onClick={() => toggleSort('last_visit_date')}
            >
              Last Visit <SortArrow col="last_visit_date" />
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((a) => (
            <tr
              key={a.account_id}
              onClick={() => onAccountClick?.(a.account_id, a.account_name)}
              style={{ cursor: onAccountClick ? 'pointer' : undefined }}
            >
              <td>{a.account_name}</td>
              <td>{a.account_type ?? '—'}</td>
              <td>{a.value_tier ?? '—'}</td>
              <td>{a.status}</td>
              <td className={styles.numCell}>{a.visit_count}</td>
              <td className={styles.numCell}>{a.orders_placed}</td>
              <td className={styles.numCell}>{a.last_visit_date ?? 'Never'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
