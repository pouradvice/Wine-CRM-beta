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
  const day = now.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return monday.toISOString().split('T')[0];
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
            <span className={styles.kpiLabel}>Accounts Visited</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{summary.total_orders}</span>
            <span className={styles.kpiLabel}>Orders</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={`${styles.kpiValue} ${styles.kpiWine}`}>
              {summary.conversion_rate_pct != null ? `${summary.conversion_rate_pct}%` : '—'}
            </span>
            <span className={styles.kpiLabel}>Conversion</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{summary.active_follow_ups}</span>
            <span className={styles.kpiLabel}>Open Follow-Ups</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiValue}>{summary.inactive_accounts}</span>
            <span className={styles.kpiLabel}>Inactive Accounts</span>
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

  return (
    <>
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
                      <DetailPanel summary={s} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
