'use client';
// src/components/reports/ExpensesClient.tsx

import { useState, useMemo } from 'react';
import type { ExpenseRecap } from '@/types';
import styles from './ExpensesClient.module.css';

interface Props {
  expenses: ExpenseRecap[];
}

export function ExpensesClient({ expenses }: Props) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplier, setSupplier] = useState('');

  const suppliers = useMemo(
    () => Array.from(new Set(expenses.map((e) => e.supplier).filter(Boolean) as string[])).sort(),
    [expenses],
  );

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (from && e.visit_date < from) return false;
      if (to && e.visit_date > to) return false;
      if (supplier && e.supplier !== supplier) return false;
      return true;
    });
  }, [expenses, from, to, supplier]);

  // Group by supplier (null → "Unattributed")
  const grouped = useMemo(() => {
    const map = new Map<string, ExpenseRecap[]>();
    for (const e of filtered) {
      const key = e.supplier ?? 'Unattributed';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Expense Receipts</h2>
        <button type="button" className={styles.printBtn} onClick={() => window.print()}>
          Print
        </button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>From</span>
          <input
            type="date"
            className={styles.input}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>To</span>
          <input
            type="date"
            className={styles.input}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label className={styles.filterGroup}>
          <span className={styles.filterLabel}>Supplier</span>
          <select
            className={styles.input}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          >
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        {(from || to || supplier) && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => { setFrom(''); setTo(''); setSupplier(''); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {grouped.length === 0 ? (
        <p className={styles.empty}>No expense receipts match the current filters.</p>
      ) : (
        grouped.map(([supplierName, rows]) => (
          <section key={supplierName} className={styles.group}>
            <h3 className={styles.groupTitle}>{supplierName}</h3>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Salesperson</th>
                    <th>Account</th>
                    <th>Brand</th>
                    <th>Notes</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => (
                    <tr key={i}>
                      <td className={styles.mono}>{e.visit_date}</td>
                      <td>{e.salesperson}</td>
                      <td>{e.client_name}</td>
                      <td>{e.brand_name ?? '—'}</td>
                      <td className={styles.notes}>{e.notes ?? '—'}</td>
                      <td>
                        {e.expense_receipt_url ? (
                          <a
                            href={e.expense_receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.receiptLink}
                          >
                            View
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
