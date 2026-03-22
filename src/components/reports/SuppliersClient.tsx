'use client';
// src/components/reports/SuppliersClient.tsx

import Link from 'next/link';
import type { Supplier } from '@/types';
import styles from './ReportsClient.module.css';

interface SuppliersClientProps {
  suppliers: Supplier[];
}

export function SuppliersClient({ suppliers }: SuppliersClientProps) {
  if (suppliers.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No suppliers yet</p>
        <p className={styles.emptyDesc}>Active suppliers will appear here once added.</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>Suppliers</span>
        <span className={styles.sectionMeta}>{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}</span>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Country</th>
            <th>Region</th>
            <th>Website</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id}>
              <td>
                <Link
                  href={`/app/suppliers/${s.id}`}
                  style={{ color: 'var(--wine)', textDecoration: 'none', fontWeight: 500 }}
                >
                  {s.name}
                </Link>
              </td>
              <td>{s.country ?? '—'}</td>
              <td>{s.region ?? '—'}</td>
              <td>
                {s.website ? (
                  <a href={s.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wine)' }}>
                    {s.website}
                  </a>
                ) : '—'}
              </td>
              <td>{s.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
