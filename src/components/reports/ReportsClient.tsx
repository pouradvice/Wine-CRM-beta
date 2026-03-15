'use client';
// src/components/reports/ReportsClient.tsx
// Unified reports page with expanded tab bar (Phase 1 + Phase 2 tabs).

import { useState } from 'react';
import { OutcomeBadge } from '@/components/ui/Badge';
import { DashboardClient } from './DashboardClient';
import { SalespersonClient } from './SalespersonClient';
import { ManagerClient } from './ManagerClient';
import { ExpensesClient } from './ExpensesClient';
import type {
  ProductPerformance,
  FollowUpQueueRow,
  VisitsBySupplierRow,
  ProductsByContactRow,
  DashboardStats,
  TopAccount,
  SalespersonStats,
  SalespersonWeeklyTrend,
  InactiveAccount,
  PipelineHealth,
  ExpenseRecap,
} from '@/types';
import styles from './ReportsClient.module.css';

type TabId =
  | 'dashboard'
  | 'salesperson'
  | 'manager'
  | 'expenses'
  | 'performance'
  | 'by-supplier'
  | 'by-contact';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'salesperson', label: 'Salesperson' },
  { id: 'manager',     label: 'Manager' },
  { id: 'expenses',    label: 'Expenses' },
  { id: 'performance', label: 'Performance' },
  { id: 'by-supplier', label: 'By Supplier' },
  { id: 'by-contact',  label: 'By Contact' },
];

interface ReportsClientProps {
  // Phase 1
  performance: ProductPerformance[];
  followUps: FollowUpQueueRow[];
  visitsBySupplier: VisitsBySupplierRow[];
  productsByContact: ProductsByContactRow[];
  // Phase 2
  dashboardStats: DashboardStats;
  topSkus: ProductPerformance[];
  topAccounts: TopAccount[];
  salespersonStats: SalespersonStats[];
  salespersonTrend: SalespersonWeeklyTrend[];
  inactiveAccounts: InactiveAccount[];
  pipelineHealth: PipelineHealth[];
  expenses: ExpenseRecap[];
}

export function ReportsClient({
  performance,
  followUps,
  visitsBySupplier,
  productsByContact,
  dashboardStats,
  topSkus,
  topAccounts,
  salespersonStats,
  salespersonTrend,
  inactiveAccounts,
  pipelineHealth,
  expenses,
}: ReportsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  const perfData = [...performance]
    .filter((p) => p.times_shown >= 1)
    .sort((a, b) => (b.conversion_rate_pct ?? 0) - (a.conversion_rate_pct ?? 0));

  const supplierGroups = groupBy(visitsBySupplier, (r) => r.brand_name ?? 'Unknown');
  const contactGroups = groupBy(
    productsByContact,
    (r) => `${r.account_name} — ${r.contact_name ?? 'Unknown contact'}`,
  );

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

      {activeTab === 'dashboard' && (
        <DashboardClient
          stats={dashboardStats}
          topSkus={topSkus}
          topAccounts={topAccounts}
        />
      )}

      {activeTab === 'salesperson' && (
        <SalespersonClient
          allStats={salespersonStats}
          allTrend={salespersonTrend}
        />
      )}

      {activeTab === 'manager' && (
        <ManagerClient
          teamStats={salespersonStats}
          inactiveAccounts={inactiveAccounts}
          pipelineHealth={pipelineHealth}
        />
      )}

      {activeTab === 'expenses' && (
        <ExpensesClient expenses={expenses} />
      )}

      {activeTab === 'performance' && (
        <>
          {perfData.length === 0 ? (
            <Empty title="No performance data yet" desc="Record visit recaps to see product performance metrics." />
          ) : (
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
                    <td className={styles.numCell}>
                      {p.avg_order_probability != null
                        ? `${Math.round(p.avg_order_probability)}%`
                        : '—'}
                    </td>
                    <td>
                      <ConversionBar pct={p.conversion_rate_pct ?? 0} />
                    </td>
                    <td>{p.last_shown_date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {activeTab === 'by-supplier' && (
        <>
          {visitsBySupplier.length === 0 ? (
            <Empty title="No supplier visits yet" desc="Visit recaps with product data will appear here grouped by brand." />
          ) : (
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
          )}
        </>
      )}

      {activeTab === 'by-contact' && (
        <>
          {productsByContact.length === 0 ? (
            <Empty title="No contact data yet" desc="Products shown to contacts will appear here." />
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Wine Name</th>
                  <th className={styles.numCell}>Times Shown</th>
                  <th>Last Shown</th>
                  <th>Outcome History</th>
                  <th className={styles.numCell}>Orders</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(contactGroups).map(([contactKey, rows]) => (
                  <>
                    <tr key={`header-${contactKey}`} className={styles.groupHeader}>
                      <td colSpan={6}>{contactKey}</td>
                    </tr>
                    {rows.map((r, i) => (
                      <tr key={`${contactKey}-${i}`}>
                        <td className={styles.skuCell}>{r.sku_number}</td>
                        <td>{r.wine_name}</td>
                        <td className={styles.numCell}>{r.times_shown}</td>
                        <td>{r.last_shown ?? '—'}</td>
                        <td>{r.outcome_history ?? '—'}</td>
                        <td className={styles.numCell}>{r.orders}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
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

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}
