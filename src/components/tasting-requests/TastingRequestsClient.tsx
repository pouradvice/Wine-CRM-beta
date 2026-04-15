'use client';
// src/components/tasting-requests/TastingRequestsClient.tsx

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type { TastingRequest, TastingRequestStatus } from '@/types';
import styles from './TastingRequestsClient.module.css';

interface TastingRequestsClientProps {
  initialRequests: TastingRequest[];
  teamId: string;
}

type StatusFilter = 'all' | TastingRequestStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABELS: Record<TastingRequestStatus, string> = {
  pending:   'Pending',
  confirmed: 'Confirmed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function StatusBadge({ status }: { status: TastingRequestStatus }) {
  const cls = {
    pending:   styles.statusPending,
    confirmed: styles.statusConfirmed,
    completed: styles.statusCompleted,
    cancelled: styles.statusCancelled,
  }[status] ?? '';
  return (
    <span className={`${styles.statusBadge} ${cls}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function exportToCSV(requests: TastingRequest[]) {
  const rows: string[] = [
    ['Company', 'Email', 'Status', '# Wines', 'Calendly Linked', 'Notes', 'Created At'].join(','),
  ];
  for (const r of requests) {
    const wines = r.tasting_request_items?.length ?? 0;
    const hasCalendly = r.calendly_event_uri ? 'Yes' : 'No';
    const company = (r.company_name ?? '').replace(/"/g, '""');
    const notes = (r.notes ?? '').replace(/"/g, '""');
    rows.push(
      [
        `"${company}"`,
        `"${r.visitor_email}"`,
        r.status,
        wines,
        hasCalendly,
        `"${notes}"`,
        `"${formatDate(r.created_at)}"`,
      ].join(','),
    );
  }
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tasting-requests.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function TastingRequestsClient({ initialRequests, teamId: _teamId }: TastingRequestsClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<TastingRequest[]>(initialRequests);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TastingRequest | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const filtered = useMemo(() => {
    let list = requests;
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => {
        if (r.visitor_email.toLowerCase().includes(q)) return true;
        if ((r.company_name ?? '').toLowerCase().includes(q)) return true;
        return r.tasting_request_items?.some(
          (item) => item.product?.wine_name?.toLowerCase().includes(q),
        );
      });
    }
    return list;
  }, [requests, statusFilter, search]);

  async function handleStatusChange(req: TastingRequest, newStatus: TastingRequestStatus) {
    setUpdating(true);
    setUpdateError('');
    try {
      const res = await fetch(`/api/tasting-requests/${req.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to update status');
      }
      setRequests((prev) =>
        prev.map((r) => (r.id === req.id ? { ...r, status: newStatus } : r)),
      );
      if (selected?.id === req.id) {
        setSelected((prev) => prev ? { ...prev, status: newStatus } : prev);
      }
      router.refresh();
    } catch (err) {
      setUpdateError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  }

  async function handleMarkFulfilled(req: TastingRequest) {
    await handleStatusChange(req, 'completed');
  }

  return (
    <div className={styles.page}>
      {/* ── Page header ── */}
      <div className={styles.header}>
        <h1 className={styles.title}>Tasting Requests</h1>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportToCSV(filtered)}
          >
            Export CSV
          </Button>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className={styles.filterBar}>
        <input
          className={styles.searchInput}
          type="search"
          placeholder="Search by company, email, or wine…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search tasting requests"
        />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {filtered.length} request{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Status tabs ── */}
      <div className={styles.tabs} role="tablist">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={statusFilter === value}
            className={`${styles.tab} ${statusFilter === value ? styles.tabActive : ''}`}
            onClick={() => setStatusFilter(value)}
          >
            {label}
            {value !== 'all' && (
              <span style={{ marginLeft: '0.3em', opacity: 0.65 }}>
                ({requests.filter((r) => r.status === value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Table / card list ── */}
      <div className={styles.card}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No tasting requests found</p>
            <p className={styles.emptyDesc}>
              {search || statusFilter !== 'all'
                ? 'Try adjusting your search or filter.'
                : 'Tasting requests submitted from the storefront will appear here.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Visitor Email</th>
                  <th># Wines</th>
                  <th>Status</th>
                  <th>Calendly</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((req) => (
                  <tr
                    key={req.id}
                    className={styles.tableRow}
                    onClick={() => { setSelected(req); setUpdateError(''); }}
                  >
                    <td>{req.company_name ?? '—'}</td>
                    <td>{req.visitor_email}</td>
                    <td>{req.tasting_request_items?.length ?? 0}</td>
                    <td><StatusBadge status={req.status} /></td>
                    <td>
                      {req.calendly_event_uri ? (
                        <span className={styles.calendlyChip}>📅 Linked</span>
                      ) : '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{formatDate(req.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <div className={styles.mobileList}>
              {filtered.map((req) => (
                <div
                  key={req.id}
                  className={styles.mobileCard}
                  onClick={() => { setSelected(req); setUpdateError(''); }}
                >
                  <div className={styles.mobileCardTop}>
                    <span className={styles.mobileEmail}>{req.company_name || req.visitor_email}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {req.company_name && <span className={styles.mobileMeta}>{req.visitor_email}</span>}
                    <span className={styles.mobileMeta}>
                      {req.tasting_request_items?.length ?? 0} wine{(req.tasting_request_items?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                    {req.calendly_event_uri && (
                      <span className={styles.calendlyChip}>📅 Linked</span>
                    )}
                    <span className={styles.mobileMeta}>{formatDate(req.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Detail slideover ── */}
      <Slideover
        open={!!selected}
        onClose={() => { setSelected(null); setUpdateError(''); }}
        title="Tasting Request"
        footer={
          selected ? (
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setSelected(null); setUpdateError(''); }}
                disabled={updating}
              >
                Close
              </Button>
              {selected.status !== 'completed' && (
                <Button
                  variant="primary"
                  size="sm"
                  loading={updating}
                  onClick={() => handleMarkFulfilled(selected)}
                >
                  ✓ Mark as Fulfilled
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div>
            {updateError && <p className={styles.saveError}>{updateError}</p>}

            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Company</p>
              <p className={styles.detailValue}>{selected.company_name ?? '—'}</p>
            </div>

            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Visitor Email</p>
              <p className={styles.detailValue}>{selected.visitor_email}</p>
            </div>

            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Status</p>
              <select
                className={styles.statusSelect}
                value={selected.status}
                disabled={updating}
                onChange={(e) =>
                  handleStatusChange(selected, e.target.value as TastingRequestStatus)
                }
              >
                {STATUS_TABS.filter((t) => t.value !== 'all').map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>Created</p>
              <p className={styles.detailValue}>{formatDate(selected.created_at)}</p>
            </div>

            {selected.calendly_event_uri && (
              <div className={styles.detailSection}>
                <p className={styles.detailLabel}>Calendly Event</p>
                <a
                  href={selected.calendly_event_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.detailLink}
                >
                  {selected.calendly_event_uri}
                </a>
              </div>
            )}

            {selected.notes && (
              <div className={styles.detailSection}>
                <p className={styles.detailLabel}>Overall Notes</p>
                <p className={styles.detailValue}>{selected.notes}</p>
              </div>
            )}

            <hr className={styles.divider} />

            <div className={styles.detailSection}>
              <p className={styles.detailLabel}>
                Wines Requested ({selected.tasting_request_items?.length ?? 0})
              </p>
              {(selected.tasting_request_items?.length ?? 0) === 0 ? (
                <p className={styles.detailValue} style={{ color: 'var(--text-muted)' }}>
                  No wines listed.
                </p>
              ) : (
                selected.tasting_request_items?.map((item) => (
                  <div key={item.id} className={styles.wineItem}>
                    <p className={styles.wineName}>
                      {item.product?.wine_name ?? 'Unknown Wine'}
                    </p>
                    {(item.product?.type || item.product?.varietal) && (
                      <p className={styles.wineMeta}>
                        {[item.product.type, item.product.varietal]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}
                    {item.buyer_notes && (
                      <p className={styles.wineBuyerNotes}>
                        &ldquo;{item.buyer_notes}&rdquo;
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </Slideover>
    </div>
  );
}
