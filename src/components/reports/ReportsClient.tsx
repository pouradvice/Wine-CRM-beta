'use client';
// src/components/reports/ReportsClient.tsx

import { useState } from 'react';
import { DashboardClient } from './DashboardClient';
import { ExpensesClient } from './ExpensesClient';
import { ByAccountsClient } from './ByAccountsClient';
import type {
  ProductPerformance,
  VisitsBySupplierRow,
  DashboardStats,
  TopAccount,
  InactiveAccount,
  PipelineHealth,
  ExpenseRecap,
  AccountReportRow,
} from '@/types';
import styles from './ReportsClient.module.css';

type TabId = 'dashboard' | 'by-accounts' | 'performance' | 'by-supplier' | 'expenses';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'by-accounts', label: 'By Accounts' },
  { id: 'performance', label: 'By Product' },
  { id: 'by-supplier', label: 'By Supplier' },
  { id: 'expenses',    label: 'Expenses' },
];

interface ReportsClientProps {
  performance:      ProductPerformance[];
  visitsBySupplier: VisitsBySupplierRow[];
  dashboardStats:   DashboardStats;
  topSkus:          ProductPerformance[];
  topAccounts:      TopAccount[];
  inactiveAccounts: InactiveAccount[];
  pipelineHealth:   PipelineHealth[];
  expenses:         ExpenseRecap[];
  accountsReport:   AccountReportRow[];
}

export function ReportsClient({
  performance,
  visitsBySupplier,
  dashboardStats,
  topSkus,
  topAccounts,
  inactiveAccounts,
  pipelineHealth,
  expenses,
  accountsReport,
}: ReportsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  const perfData = [...performance]
    .filter((p) => p.times_shown >= 1)
    .sort((a, b) => (b.conversion_rate_pct ?? 0) - (a.conversion_rate_pct ?? 0));

  return (
    <>
      <h1 className={styles.pageTitle}>Reports</h1>

      <div className={styles.tabs}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`${styles.tab} ${activeTab === id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.panel}>
        {activeTab === 'dashboard' && (
          <DashboardClient
            stats={dashboardStats}
            topSkus={topSkus}
            topAccounts={topAccounts}
            inactiveAccounts={inactiveAccounts}
            pipelineHealth={pipelineHealth}
            allPerformance={performance}
          />
        )}

        {activeTab === 'performance' && (
          <>
            {perfData.length === 0 ? (
              <Empty title="No performance data yet" desc="Record visit recaps to see product performance metrics." />
            ) : (
              <>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Product Performance</span>
                  <span className={styles.sectionMeta}>{perfData.length} products</span>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Wine Name</th>
                      <th>Brand</th>
                      <th>Type</th>
                      <th className={styles.numCell}>Shown</th>
                      <th className={styles.numCell}>Orders</th>
                      <th className={styles.numCell}>Committed</th>
                      <th className={styles.numCell}>Placements</th>
                      <th className={styles.numCell}>Avg Prob</th>
                      <th>Conversion</th>
                      <th>Last Shown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perfData.map((p) => (
                      <tr key={p.product_id}>
                        <td className={styles.skuCell}>{p.sku_number}</td>
                        <td>{p.wine_name}</td>
                        <td>{p.brand_name ?? '—'}</td>
                        <td>{p.type ?? '—'}</td>
                        <td className={styles.numCell}>{p.times_shown}</td>
                        <td className={styles.numCell}>{p.orders_placed}</td>
                        <td className={styles.numCell}>{p.committed}</td>
                        <td className={styles.numCell}>{p.menu_placements ?? 0}</td>
                        <td className={styles.numCell}>
                          {p.avg_order_probability != null
                            ? `${Math.round(p.avg_order_probability)}%`
                            : '—'}
                        </td>
                        <td><ConversionBar pct={p.conversion_rate_pct ?? 0} /></td>
                        <td>{p.last_shown_date ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {activeTab === 'by-supplier' && (
          <>
            {visitsBySupplier.length === 0 ? (
              <Empty title="No supplier visits yet" desc="Visit recaps with product data will appear here grouped by brand." />
            ) : (
              <>
                <div className={styles.sectionHeader}>
                  <span className={styles.sectionTitle}>Visits by Supplier</span>
                </div>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Brand</th>
                      <th className={styles.numCell}>Total Visits</th>
                      <th className={styles.numCell}>Orders Placed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visitsBySupplier.map((r, i) => (
                      <tr key={i}>
                        <td>{r.supplier_name ?? '—'}</td>
                        <td>{r.brand_name ?? '—'}</td>
                        <td className={styles.numCell}>{r.total_visits}</td>
                        <td className={styles.numCell}>{r.orders_placed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}

        {activeTab === 'by-accounts' && (
          <ByAccountsClient accounts={accountsReport} />
        )}

        {activeTab === 'expenses' && (
          <ExpensesClient expenses={expenses} />
        )}
      </div>
    </>
  );
}

function ConversionBar({ pct }: { pct: number }) {
  return (
    <div className={styles.conversionBar}>
      <div
        className={styles.conversionFill}
        style={{ width: `${Math.min(pct, 100)}px` }}
      />
      <span className={styles.conversionPct}>{Math.round(pct)}%</span>
    </div>
  );
}

function Empty({ title, desc }: { title: string; desc: string }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyDesc}>{desc}</p>
    </div>
  );
}
