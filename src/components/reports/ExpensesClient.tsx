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

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (from && e.visit_date < from) return false;
      if (to && e.visit_date > to) return false;
      return true;
    });
  }, [expenses, from, to]);

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
        {(from || to) && (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={() => { setFrom(''); setTo(''); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No expense receipts match the current filters.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Salesperson</th>
                <th>Account</th>
                <th>Amount</th>
                <th>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e, i) => (
                <tr key={i}>
                  <td className={styles.mono}>{e.visit_date}</td>
                  <td>{e.salesperson}</td>
                  <td>{e.account_name}</td>
                  <td className={styles.mono}>
                    {e.expense_amount != null ? `$${e.expense_amount.toFixed(2)}` : '—'}
                  </td>
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
      )}
    </div>
  );
}
