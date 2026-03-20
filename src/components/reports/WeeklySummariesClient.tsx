'use client';
// src/components/reports/WeeklySummariesClient.tsx

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { WeeklySummary } from '@/types';
import styles from './WeeklySummariesClient.module.css';

interface Props {
  summaries: WeeklySummary[];
}

const OUTCOME_COLOR: Record<string, string> = {
  'Yes Today':   'var(--outcome-yes)',
  'Yes Later':   'var(--outcome-later)',
  'Maybe Later': 'var(--outcome-maybe)',
  'No':          'var(--outcome-no)',
  'Discussed':   'var(--outcome-discussed)',
};

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end   = new Date(weekEnd   + 'T00:00:00');
  const fmtShort = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtFull  = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmtShort(start)} – ${fmtFull(end)}`;
}

function getMondayOfCurrentWeek(): string {
  const now = new Date();
  const day = now.getDay(); // local time: 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  const year  = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, '0');
  const date  = String(monday.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function DetailPanel({ summary }: { summary: WeeklySummary }) {
  const totalPipeline = Object.values(summary.pipeline_summary).reduce((s, v) => s + v, 0);

  return (
    <div className={styles.detailInner}>
      {/* KPI strip */}
      <div>
        <div className={styles.sectionHeader}>
          <h4 className={styles.sectionTitle}>Key Metrics</h4>
        </div>
        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{summary.total_visits}</span>
            <span className={styles.kpiLabel}>Visits</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{summary.accounts_visited}</span>
            <span className={styles.kpiLabel}>New Accounts</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{(summary.event_recaps ?? []).length}</span>
            <span className={styles.kpiLabel}>Events</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{(summary.off_site_recaps ?? []).length}</span>
            <span className={styles.kpiLabel}>Demos (In-Store)</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={`${styles.kpiValue} ${styles.kpiWine}`}>
              {(summary.new_menu_placements ?? []).length}
            </span>
            <span className={styles.kpiLabel}>Menu Placements</span>
          </div>
        </div>
      </div>

      {/* Top Products */}
      {summary.top_products.length > 0 && (
        <div>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Top 5 Products</h4>
          </div>
          <table className={styles.subTable}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Wine</th>
                <th className={styles.numCell}>Orders</th>
                <th className={styles.numCell}>Conv %</th>
              </tr>
            </thead>
            <tbody>
              {summary.top_products.map((p, i) => (
                <tr key={i}>
                  <td>{p.sku_number}</td>
                  <td>{p.wine_name}</td>
                  <td className={styles.numCell}>{p.orders_placed}</td>
                  <td className={styles.numCell}>
                    {p.conversion_rate_pct != null ? `${p.conversion_rate_pct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top Accounts */}
      {summary.top_accounts.length > 0 && (
        <div>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Top 5 Accounts</h4>
          </div>
          <table className={styles.subTable}>
            <thead>
              <tr>
                <th>Account</th>
                <th className={styles.numCell}>Visits</th>
                <th className={styles.numCell}>Orders</th>
              </tr>
            </thead>
            <tbody>
              {summary.top_accounts.map((a, i) => (
                <tr key={i}>
                  <td>{a.account_name}</td>
                  <td className={styles.numCell}>{a.visit_count}</td>
                  <td className={styles.numCell}>{a.orders_placed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pipeline Breakdown */}
      {Object.keys(summary.pipeline_summary).length > 0 && (
        <div>
          <div className={styles.sectionHeader}>
            <h4 className={styles.sectionTitle}>Pipeline Breakdown</h4>
            {totalPipeline > 0 && (
              <span className={styles.sectionMeta}>{totalPipeline} open follow-ups</span>
            )}
          </div>
          <div className={styles.pipeline}>
            {Object.entries(summary.pipeline_summary).map(([outcome, count]) => {
              const pct = totalPipeline > 0 ? (count / totalPipeline) * 100 : 0;
              return (
                <div key={outcome} className={styles.pipelineRow}>
                  <span className={styles.pipelineLabel}>{outcome}</span>
                  <div className={styles.pipelineTrack}>
                    <div
                      className={styles.pipelineBar}
                      style={{
                        width: `${pct.toFixed(1)}%`,
                        background: OUTCOME_COLOR[outcome] ?? 'var(--mist-dark)',
                      }}
                    />
                  </div>
                  <span className={styles.pipelineCount}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function WeeklySummariesClient({ summaries: initialSummaries }: Props) {
  const router = useRouter();
  const [summaries, setSummaries]     = useState<WeeklySummary[]>(initialSummaries);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState<string | null>(null);

  const handleGenerateCurrentWeek = async () => {
    setGenerating(true);
    setError(null);
    try {
      const weekStart = getMondayOfCurrentWeek();
      const res = await fetch('/api/weekly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error ?? 'Request failed');
      }
      const json = await res.json();
      const newSummary: WeeklySummary = json.summary;
      setSummaries((prev) => {
        const filtered = prev.filter((s) => s.week_start !== newSummary.week_start);
        return [newSummary, ...filtered].sort(
          (a, b) => b.week_start.localeCompare(a.week_start),
        );
      });
      setExpandedId(newSummary.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate summary');
    } finally {
      setGenerating(false);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const csvEscape = (value: string | number | null | undefined): string => {
    const str = value == null ? '' : String(value);
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const handleExportCsv = (summary: WeeklySummary) => {
    const rows: string[] = [];

    // Section 1 — Key Metrics
    rows.push(
      [
        'Week', 'Visits', 'Accounts Visited', 'Orders',
        'Conversion %', 'Open Follow-Ups', 'Inactive Accounts',
      ].map(csvEscape).join(','),
    );
    rows.push(
      [
        formatWeekRange(summary.week_start, summary.week_end),
        summary.total_visits,
        summary.accounts_visited,
        summary.total_orders,
        summary.conversion_rate_pct ?? '',
        summary.active_follow_ups,
        summary.inactive_accounts,
      ].map(csvEscape).join(','),
    );

    // Section 2 — Top Products
    if (summary.top_products.length > 0) {
      rows.push('');
      rows.push('Top Products');
      rows.push(['SKU', 'Wine', 'Orders', 'Conversion %'].map(csvEscape).join(','));
      for (const p of summary.top_products) {
        rows.push(
          [p.sku_number, p.wine_name, p.orders_placed, p.conversion_rate_pct ?? ''].map(csvEscape).join(','),
        );
      }
    }

    // Section 3 — Top Accounts
    if (summary.top_accounts.length > 0) {
      rows.push('');
      rows.push('Top Accounts');
      rows.push(['Account', 'Visits', 'Orders'].map(csvEscape).join(','));
      for (const a of summary.top_accounts) {
        rows.push(
          [a.account_name, a.visit_count, a.orders_placed].map(csvEscape).join(','),
        );
      }
    }

    // Section 4 — Pipeline Breakdown
    if (Object.keys(summary.pipeline_summary).length > 0) {
      rows.push('');
      rows.push('Pipeline Breakdown');
      rows.push(['Outcome', 'Count'].map(csvEscape).join(','));
      for (const [outcome, count] of Object.entries(summary.pipeline_summary)) {
        rows.push([outcome, count].map(csvEscape).join(','));
      }
    }

    // Section 5 — Events
    if ((summary.event_recaps ?? []).length > 0) {
      rows.push('');
      rows.push('Events');
      rows.push(['Date', 'Location (Account)', 'Occasion'].map(csvEscape).join(','));
      for (const e of summary.event_recaps) {
        rows.push([e.visit_date, e.account_name, e.occasion ?? ''].map(csvEscape).join(','));
      }
    }

    // Section 6 — Off-Site / Demo Visits
    if ((summary.off_site_recaps ?? []).length > 0) {
      rows.push('');
      rows.push('Off-Site / Demo Visits');
      rows.push(['Date', 'Location (Account)'].map(csvEscape).join(','));
      for (const o of summary.off_site_recaps) {
        rows.push([o.visit_date, o.account_name].map(csvEscape).join(','));
      }
    }

    // Section 7 — New Menu Placements
    if ((summary.new_menu_placements ?? []).length > 0) {
      rows.push('');
      rows.push('New Menu Placements');
      rows.push(['Date', 'Account', 'Product'].map(csvEscape).join(','));
      for (const m of summary.new_menu_placements) {
        rows.push([m.visit_date, m.account_name, m.wine_name].map(csvEscape).join(','));
      }
    }

    const csvString = rows.join('\n');
    const url = URL.createObjectURL(new Blob([csvString], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekly-summary-${summary.week_start}.csv`;
    a.click();
    // Delay revocation to give the browser time to initiate the download
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  const handlePrint = (summary: WeeklySummary) => {
    setExpandedId(summary.id);
    // Small delay to let the DOM update before printing
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Weekly Summaries</span>
        <button
          type="button"
          className={styles.generateBtn}
          onClick={handleGenerateCurrentWeek}
          disabled={generating}
        >
          {generating ? 'Generating…' : 'Generate Current Week'}
        </button>
      </div>

      {error && (
        <p className={styles.errorBanner}>{error}</p>
      )}

      {summaries.length === 0 ? (
        <p className={styles.empty}>No weekly summaries yet. Generate one to get started.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Week</th>
              <th className={styles.numCell}>Visits</th>
              <th className={styles.numCell}>Accounts</th>
              <th className={styles.numCell}>Orders</th>
              <th className={styles.numCell}>Conversion</th>
              <th className={styles.numCell}>Follow-Ups</th>
              <th className={styles.numCell}>Inactive</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => (
              <React.Fragment key={s.id}>
                <tr onClick={() => toggleRow(s.id)}>
                  <td>{formatWeekRange(s.week_start, s.week_end)}</td>
                  <td className={styles.numCell}>{s.total_visits}</td>
                  <td className={styles.numCell}>{s.accounts_visited}</td>
                  <td className={styles.numCell}>{s.total_orders}</td>
                  <td className={styles.numCell}>
                    {s.conversion_rate_pct != null ? `${s.conversion_rate_pct}%` : '—'}
                  </td>
                  <td className={styles.numCell}>{s.active_follow_ups}</td>
                  <td className={styles.numCell}>{s.inactive_accounts}</td>
                </tr>
                {expandedId === s.id && (
                  <tr className={styles.detailRow}>
                    <td colSpan={7}>
                      <div className={styles.exportBar}>
                        <button
                          type="button"
                          className={styles.exportBtn}
                          onClick={() => handleExportCsv(s)}
                        >
                          Export CSV
                        </button>
                        <button
                          type="button"
                          className={styles.exportBtn}
                          onClick={() => handlePrint(s)}
                        >
                          Print / Save as PDF
                        </button>
                      </div>
                      <DetailPanel summary={s} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
