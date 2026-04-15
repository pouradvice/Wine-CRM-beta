'use client';

import { useMemo, useState } from 'react';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type { AttributionMatch, AttributionMatchStatus, Supplier } from '@/types';
import styles from './AttributionClient.module.css';

interface AttributionClientProps {
  initialMatches: AttributionMatch[];
  suppliers: Supplier[];
}

type StatusFilter = 'all' | AttributionMatchStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'matched', label: 'Matched' },
  { value: 'disputed', label: 'Disputed' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'voided', label: 'Voided' },
];

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function exportToCSV(matches: AttributionMatch[]) {
  const rows = [
    ['Supplier', 'Account', 'Wine', 'SKU', 'Recap Date', 'Depletion Period', 'Confidence', 'Status', 'Matched At', 'Invoice Amount'].join(','),
  ];

  for (const m of matches) {
    const account = (m.placement?.account?.name ?? m.recap_product?.recap?.accounts?.name ?? '').replace(/"/g, '""');
    const wine = (m.placement?.product?.wine_name ?? m.recap_product?.products?.wine_name ?? '').replace(/"/g, '""');
    const sku = (m.placement?.product?.sku_number ?? m.recap_product?.products?.sku_number ?? '').replace(/"/g, '""');
    const supplier = (m.supplier?.name ?? '').replace(/"/g, '""');
    rows.push([
      `"${supplier}"`,
      `"${account}"`,
      `"${wine}"`,
      `"${sku}"`,
      `"${formatDate(m.recap_product?.recap?.visit_date)}"`,
      `"${m.depletion_report?.period_month ?? m.placement?.depletion_period ?? ''}"`,
      m.confidence_score ?? '',
      m.status,
      `"${formatDate(m.matched_at)}"`,
      m.invoice_line_item?.amount ?? '',
    ].join(','));
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'attribution-matches.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function StatusBadge({ status }: { status: AttributionMatchStatus }) {
  const cls = {
    matched: styles.statusMatched,
    disputed: styles.statusDisputed,
    resolved: styles.statusResolved,
    voided: styles.statusVoided,
  }[status] ?? '';
  return <span className={`${styles.statusBadge} ${cls}`}>{status}</span>;
}

export function AttributionClient({ initialMatches, suppliers }: AttributionClientProps) {
  const [matches, setMatches] = useState(initialMatches);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selected, setSelected] = useState<AttributionMatch | null>(null);
  const [editStatus, setEditStatus] = useState<AttributionMatchStatus>('matched');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const filtered = useMemo(() => {
    let list = matches;

    if (statusFilter !== 'all') list = list.filter((m) => m.status === statusFilter);
    if (supplierFilter) list = list.filter((m) => m.supplier_id === supplierFilter);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((m) => {
        const account = (m.placement?.account?.name ?? m.recap_product?.recap?.accounts?.name ?? '').toLowerCase();
        const wine = (m.placement?.product?.wine_name ?? m.recap_product?.products?.wine_name ?? '').toLowerCase();
        const sku = (m.placement?.product?.sku_number ?? m.recap_product?.products?.sku_number ?? '').toLowerCase();
        return account.includes(q) || wine.includes(q) || sku.includes(q);
      });
    }

    if (fromDate) {
      const fromTs = new Date(fromDate).getTime();
      list = list.filter((m) => new Date(m.matched_at).getTime() >= fromTs);
    }
    if (toDate) {
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      const toTs = to.getTime();
      list = list.filter((m) => new Date(m.matched_at).getTime() <= toTs);
    }

    return list;
  }, [matches, statusFilter, supplierFilter, search, fromDate, toDate]);

  function openDetails(match: AttributionMatch) {
    setSelected(match);
    setEditStatus(match.status);
    setEditNotes(match.notes ?? '');
    setSaveError('');
  }

  async function handleResolve() {
    if (!selected) return;
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch(`/api/attribution/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: editStatus, notes: editNotes }),
      });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.error ?? 'Failed to update attribution match');
      }
      const updated = await res.json() as AttributionMatch;
      setMatches((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
      setSelected((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update attribution match');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Attribution Audit</h1>
        <Button variant="secondary" size="sm" onClick={() => exportToCSV(filtered)}>Export CSV</Button>
      </div>

      <div className={styles.filterBar}>
        <select
          className={styles.select}
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          aria-label="Filter by supplier"
        >
          <option value="">All suppliers</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search account, wine, or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search attribution matches"
        />

        <input type="date" className={styles.dateInput} value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="Matched from date" />
        <input type="date" className={styles.dateInput} value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="Matched to date" />
      </div>

      <div className={styles.tabs} role="tablist">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            className={`${styles.tab} ${statusFilter === value ? styles.tabActive : ''}`}
            aria-selected={statusFilter === value}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>No attribution matches found.</div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Wine/SKU</th>
                  <th>Recap Date</th>
                  <th>Depletion Period</th>
                  <th>Confidence</th>
                  <th>Status</th>
                  <th>Invoice</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id} className={styles.tableRow} onClick={() => openDetails(m)}>
                    <td>{m.placement?.account?.name ?? m.recap_product?.recap?.accounts?.name ?? '—'}</td>
                    <td>
                      <div>{m.placement?.product?.wine_name ?? m.recap_product?.products?.wine_name ?? '—'}</div>
                      <div className={styles.meta}>{m.placement?.product?.sku_number ?? m.recap_product?.products?.sku_number ?? '—'}</div>
                    </td>
                    <td>{formatDate(m.recap_product?.recap?.visit_date)}</td>
                    <td>{m.depletion_report?.period_month ?? m.placement?.depletion_period ?? '—'}</td>
                    <td>{m.confidence_score == null ? '—' : `${Math.round(m.confidence_score * 100)}%`}</td>
                    <td><StatusBadge status={m.status} /></td>
                    <td>{m.invoice_line_item ? `$${Number(m.invoice_line_item.amount).toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.mobileList}>
              {filtered.map((m) => (
                <div key={m.id} className={styles.mobileCard} onClick={() => openDetails(m)}>
                  <div className={styles.mobileTop}>
                    <strong>{m.placement?.account?.name ?? m.recap_product?.recap?.accounts?.name ?? '—'}</strong>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className={styles.meta}>
                    {(m.placement?.product?.wine_name ?? m.recap_product?.products?.wine_name ?? '—')} · {(m.placement?.product?.sku_number ?? m.recap_product?.products?.sku_number ?? '—')}
                  </div>
                  <div className={styles.meta}>Matched {formatDate(m.matched_at)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Slideover
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Attribution Match"
        footer={
          selected ? (
            <div className={styles.footer}>
              <Button variant="secondary" size="sm" onClick={() => setSelected(null)} disabled={saving}>Close</Button>
              <Button variant="primary" size="sm" onClick={handleResolve} loading={saving}>Resolve</Button>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div>
            {saveError && <p className={styles.error}>{saveError}</p>}

            <div className={styles.detailBlock}>
              <p className={styles.detailLabel}>Audit trail</p>
              <ol className={styles.lineage}>
                <li>Recap: {selected.recap_product?.recap?.id ?? '—'} ({formatDate(selected.recap_product?.recap?.visit_date)})</li>
                <li>Depletion: {selected.depletion_report?.id ?? '—'} ({selected.depletion_report?.period_month ?? '—'})</li>
                <li>Placement: {selected.placement?.id ?? '—'}</li>
                <li>Contract: {selected.supplier?.name ?? 'Supplier contract terms'}</li>
                <li>Invoice: {selected.invoice_line_item?.id ?? '—'}</li>
              </ol>
            </div>

            <div className={styles.detailBlock}>
              <p className={styles.detailLabel}>Source links</p>
              <div className={styles.links}>
                {selected.recap_product?.recap?.id && <a href={`/app/crm/history`} className={styles.link}>Open Recap History</a>}
                {selected.placement?.id && <a href="/app/crm/suppliers" className={styles.link}>Open Placement Source</a>}
                {selected.invoice_line_item?.invoice_id && (
                  <a href={`/app/suppliers/${selected.supplier_id}/invoices/${selected.invoice_line_item.invoice_id}`} className={styles.link}>
                    Open Invoice
                  </a>
                )}
              </div>
            </div>

            <div className={styles.detailBlock}>
              <p className={styles.detailLabel}>Status</p>
              <select className={styles.select} value={editStatus} onChange={(e) => setEditStatus(e.target.value as AttributionMatchStatus)}>
                <option value="matched">matched</option>
                <option value="disputed">disputed</option>
                <option value="resolved">resolved</option>
                <option value="voided">voided</option>
              </select>
            </div>

            <div className={styles.detailBlock}>
              <p className={styles.detailLabel}>Notes</p>
              <textarea
                className={styles.notes}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Dispute resolution notes…"
              />
            </div>
          </div>
        )}
      </Slideover>
    </div>
  );
}
