'use client';
// src/components/reports/ReportsClient.tsx

import { useState } from 'react';
import { DashboardClient } from './DashboardClient';
import { ExpensesClient } from './ExpensesClient';
import { ByAccountsClient } from './ByAccountsClient';
import { WeeklySummariesClient } from './WeeklySummariesClient';
import { createClient } from '@/lib/supabase/client';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type {
  ProductPerformance,
  Supplier,
  VisitsBySupplierRow,
  DashboardStats,
  TopAccount,
  InactiveAccount,
  PipelineHealth,
  ExpenseRecap,
  AccountReportRow,
  WeeklySummary,
} from '@/types';
import styles from './ReportsClient.module.css';

interface ReportVisitRow {
  visit_date: string;
  nature: string;
  outcome_summary: string;
}

interface ReportSkuRow {
  product_id: string;
  wine_name: string;
  sku_number: string;
}

interface ReportProductVisitRow {
  account_name: string;
  visit_date: string;
  salesperson: string;
  outcome: string;
}

type TabId = 'dashboard' | 'by-accounts' | 'performance' | 'by-supplier' | 'expenses' | 'weekly-summaries';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard',        label: 'Dashboard' },
  { id: 'by-accounts',      label: 'By Accounts' },
  { id: 'performance',      label: 'By Product' },
  { id: 'by-supplier',      label: 'By Supplier' },
  { id: 'expenses',         label: 'Expenses' },
  { id: 'weekly-summaries', label: 'Weekly Summaries' },
];

interface ReportsClientProps {
  teamId:           string;
  performance:      ProductPerformance[];
  visitsBySupplier: VisitsBySupplierRow[];
  dashboardStats:   DashboardStats;
  topSkus:          ProductPerformance[];
  topAccounts:      TopAccount[];
  inactiveAccounts: InactiveAccount[];
  pipelineHealth:   PipelineHealth[];
  expenses:         ExpenseRecap[];
  accountsReport:   AccountReportRow[];
  weeklySummaries:  WeeklySummary[];
  suppliers:        Supplier[];
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
  weeklySummaries,
  suppliers,
}: ReportsClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);

  // Account slideover
  const [acctSlideOpen, setAcctSlideOpen] = useState(false);
  const [acctLoading, setAcctLoading] = useState(false);
  const [acctName, setAcctName] = useState('');
  const [acctVisits, setAcctVisits] = useState<ReportVisitRow[]>([]);
  const [acctSkus, setAcctSkus] = useState<ReportSkuRow[]>([]);
  const [acctTab, setAcctTab] = useState<'history' | 'skus'>('history');

  // Product slideover
  const [prodSlideOpen, setProdSlideOpen] = useState(false);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodName, setProdName] = useState('');
  const [prodVisits, setProdVisits] = useState<ReportProductVisitRow[]>([]);

  const loadAccountDetail = async (accountId: string, name: string) => {
    setAcctName(name);
    setAcctTab('history');
    setAcctSlideOpen(true);
    setAcctLoading(true);
    try {
      const sb = createClient();
      const { data: recaps } = await sb
        .from('recaps')
        .select('visit_date, nature, recap_products(id)')
        .eq('account_id', accountId)
        .order('visit_date', { ascending: false })
        .limit(50);

      setAcctVisits(
        (recaps ?? []).map((r: { visit_date: string; nature: string; recap_products?: unknown[] }) => ({
          visit_date: r.visit_date,
          nature: r.nature,
          outcome_summary: `${(r.recap_products ?? []).length} product(s) shown`,
        }))
      );

      const { data: skus } = await sb
        .from('account_skus')
        .select('product_id, product:products(wine_name, sku_number)')
        .eq('account_id', accountId);

      setAcctSkus(
        ((skus ?? []) as unknown as Array<{ product_id: string; product: { wine_name: string; sku_number: string } | null }>).map((s) => ({
          product_id: s.product_id,
          wine_name: s.product?.wine_name ?? '—',
          sku_number: s.product?.sku_number ?? '—',
        }))
      );
    } finally {
      setAcctLoading(false);
    }
  };

  const loadProductDetail = async (productId: string, name: string) => {
    setProdName(name);
    setProdSlideOpen(true);
    setProdLoading(true);
    try {
      const sb = createClient();
      const { data: rps } = await sb
        .from('recap_products')
        .select('outcome, recap:recaps(visit_date, salesperson, account:accounts(name))')
        .eq('product_id', productId)
        .limit(100);

      setProdVisits(
        ((rps ?? []) as unknown as Array<{
          outcome: string;
          recap: { visit_date: string; salesperson: string; account: { name: string } | null } | null;
        }>).map((rp) => ({
          account_name: rp.recap?.account?.name ?? '—',
          visit_date: rp.recap?.visit_date ?? '—',
          salesperson: rp.recap?.salesperson ?? '—',
          outcome: rp.outcome,
        }))
      );
    } finally {
      setProdLoading(false);
    }
  };

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
            onAccountClick={(id, name) => loadAccountDetail(id, name)}
            onProductClick={(id, name) => loadProductDetail(id, name)}
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
                      <tr
                        key={p.product_id}
                        onClick={() => loadProductDetail(p.product_id, p.wine_name)}
                        style={{ cursor: 'pointer' }}
                      >
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

        {activeTab === 'by-supplier' && (() => {
          // Build supplier name lookup: full suppliers list takes priority, supplemented by visitsBySupplier
          const supplierNameMap = new Map<string, string>();
          for (const r of visitsBySupplier) {
            if (r.supplier_id && r.supplier_name) supplierNameMap.set(r.supplier_id, r.supplier_name);
          }
          for (const s of suppliers) {
            supplierNameMap.set(s.id, s.name);
          }

          // Group performance SKUs by supplier_id
          const grouped = new Map<string | null, typeof performance>();
          for (const p of performance) {
            const key = p.supplier_id ?? null;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(p);
          }

          // Sort groups: named suppliers alphabetically, then null last
          const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) => {
            if (a === null) return 1;
            if (b === null) return -1;
            return (supplierNameMap.get(a) ?? '').localeCompare(supplierNameMap.get(b) ?? '');
          });

          if (sortedGroups.length === 0) {
            return <Empty title="No SKU performance data yet" desc="Record visit recaps with products to see performance by supplier." />;
          }

          return (
            <>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>SKU Performance by Supplier</span>
                <button type="button" className={styles.printBtn} onClick={() => window.print()}>Print</button>
              </div>
              {sortedGroups.map(([supplierId, skus]) => {
                const key = supplierId ?? '__none';
                const supplierLabel = supplierId ? (supplierNameMap.get(supplierId) ?? 'Unknown Supplier') : 'No Supplier';
                const sorted = [...skus].sort((a, b) => b.times_shown - a.times_shown);
                const isOpen = expandedSupplier === key;

                // Per-supplier KPIs
                const totalShown    = sorted.reduce((s, p) => s + p.times_shown, 0);
                const totalOrders   = sorted.reduce((s, p) => s + p.orders_placed, 0);
                const totalPlace    = sorted.reduce((s, p) => s + (p.menu_placements ?? 0), 0);
                const convPct       = totalShown > 0 ? Math.round((totalOrders / totalShown) * 1000) / 10 : 0;

                return (
                  <div key={key} className={styles.supplierAccordion}>
                    <button
                      type="button"
                      className={styles.supplierToggleBtn}
                      onClick={() => setExpandedSupplier(isOpen ? null : key)}
                    >
                      <span className={styles.supplierToggleLeft}>
                        <span className={styles.supplierToggleName}>{supplierLabel}</span>
                        <span className={styles.supplierToggleChip}>{sorted.length} SKU{sorted.length !== 1 ? 's' : ''}</span>
                      </span>
                      <span className={styles.supplierToggleChevron}>{isOpen ? '▲' : '▼'}</span>
                    </button>

                    {isOpen && (
                      <div className={styles.supplierBody}>
                        {/* KPI strip */}
                        <div className={styles.supplierKpiRow}>
                          <div className={styles.supplierKpiCard}>
                            <span className={styles.supplierKpiValue}>{totalShown}</span>
                            <span className={styles.supplierKpiLabel}>Times Shown</span>
                          </div>
                          <div className={styles.supplierKpiCard}>
                            <span className={styles.supplierKpiValue}>{totalOrders}</span>
                            <span className={styles.supplierKpiLabel}>Orders</span>
                          </div>
                          <div className={styles.supplierKpiCard}>
                            <span className={styles.supplierKpiValue}>{totalPlace}</span>
                            <span className={styles.supplierKpiLabel}>Placements</span>
                          </div>
                          <div className={styles.supplierKpiCard}>
                            <span className={`${styles.supplierKpiValue} ${styles.supplierKpiWine}`}>{convPct}%</span>
                            <span className={styles.supplierKpiLabel}>Conversion</span>
                          </div>
                        </div>

                        {/* SKU table */}
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>SKU</th>
                              <th>Wine Name</th>
                              <th>Brand</th>
                              <th className={styles.numCell}>Shown</th>
                              <th className={styles.numCell}>Orders</th>
                              <th className={styles.numCell}>Placements</th>
                              <th>Conversion</th>
                              <th>Last Shown</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map((p) => (
                              <tr
                                key={p.product_id}
                                onClick={() => loadProductDetail(p.product_id, p.wine_name)}
                                style={{ cursor: 'pointer' }}
                              >
                                <td className={styles.skuCell}>{p.sku_number}</td>
                                <td>{p.wine_name}</td>
                                <td>{p.brand_name ?? '—'}</td>
                                <td className={styles.numCell}>{p.times_shown}</td>
                                <td className={styles.numCell}>{p.orders_placed}</td>
                                <td className={styles.numCell}>{p.menu_placements ?? 0}</td>
                                <td><ConversionBar pct={p.conversion_rate_pct ?? 0} /></td>
                                <td>{p.last_shown_date ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          );
        })()}

        {activeTab === 'by-accounts' && (
          <ByAccountsClient
            accounts={accountsReport}
            onAccountClick={(id, name) => loadAccountDetail(id, name)}
          />
        )}

        {activeTab === 'expenses' && (
          <ExpensesClient expenses={expenses} />
        )}

        {activeTab === 'weekly-summaries' && (
          <WeeklySummariesClient summaries={weeklySummaries} />
        )}
      </div>

      {/* Account Slideover */}
      <Slideover
        open={acctSlideOpen}
        onClose={() => setAcctSlideOpen(false)}
        title={acctName}
        footer={<Button variant="secondary" onClick={() => setAcctSlideOpen(false)}>Close</Button>}
      >
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid var(--mist)', marginBottom: 'var(--space-4)' }}>
          {(['history', 'skus'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setAcctTab(tab)}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                background: 'none',
                border: 'none',
                borderBottom: acctTab === tab ? '2px solid var(--wine)' : '2px solid transparent',
                marginBottom: '-2px',
                cursor: 'pointer',
                fontWeight: acctTab === tab ? 600 : 400,
                color: acctTab === tab ? 'var(--wine)' : 'var(--text-muted)',
                fontSize: 'var(--text-sm)',
              }}
            >
              {tab === 'history' ? 'Visit History' : 'Active SKUs'}
            </button>
          ))}
        </div>

        {acctLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>
        ) : acctTab === 'history' ? (
          acctVisits.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No visit history.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '400px', fontSize: 'var(--text-sm)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--mist)' }}>
                    <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Date</th>
                    <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Products</th>
                  </tr>
                </thead>
                <tbody>
                  {acctVisits.map((v, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--mist)' }}>
                      <td style={{ padding: 'var(--space-2)' }}>{v.visit_date}</td>
                      <td style={{ padding: 'var(--space-2)' }}>{v.nature}</td>
                      <td style={{ padding: 'var(--space-2)' }}>{v.outcome_summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          acctSkus.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No active SKUs.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: '300px', fontSize: 'var(--text-sm)', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--mist)' }}>
                    <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>SKU</th>
                    <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Wine</th>
                  </tr>
                </thead>
                <tbody>
                  {acctSkus.map((s) => (
                    <tr key={s.product_id} style={{ borderBottom: '1px solid var(--mist)' }}>
                      <td style={{ padding: 'var(--space-2)', fontFamily: 'monospace' }}>{s.sku_number}</td>
                      <td style={{ padding: 'var(--space-2)' }}>{s.wine_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Slideover>

      {/* Product Slideover */}
      <Slideover
        open={prodSlideOpen}
        onClose={() => setProdSlideOpen(false)}
        title={prodName}
        footer={<Button variant="secondary" onClick={() => setProdSlideOpen(false)}>Close</Button>}
      >
        {prodLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Loading…</p>
        ) : prodVisits.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>No visit history for this product.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: '480px', fontSize: 'var(--text-sm)', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--mist)' }}>
                  <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Account</th>
                  <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Date</th>
                  <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Rep</th>
                  <th style={{ textAlign: 'left', padding: 'var(--space-2)' }}>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {prodVisits.map((v, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--mist)' }}>
                    <td style={{ padding: 'var(--space-2)' }}>{v.account_name}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{v.visit_date}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{v.salesperson}</td>
                    <td style={{ padding: 'var(--space-2)' }}>{v.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Slideover>
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
