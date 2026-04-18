'use client';
// src/components/tasting-requests/TastingRequestsClient.tsx

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Slideover } from '@/components/ui/Slideover';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import type { TastingRequest, TastingRequestStatus } from '@/types';
import { PORTFOLIO_SLUG_RE, storefrontPathForSlug } from '@/lib/portfolio';
import styles from './TastingRequestsClient.module.css';

interface PortfolioPageSettings {
  slug: string;
  calendly_url: string;
  is_active: boolean;
}

interface PortfolioVisitorRow {
  id: string;
  email: string;
  company_name: string | null;
  created_at: string;
}

interface TastingRequestsClientProps {
  initialRequests: TastingRequest[];
  teamId: string;
  initialPortfolioPage: PortfolioPageSettings | null;
  visitorCount: number;
  nonRequestingVisitors: PortfolioVisitorRow[];
}

type StatusFilter = 'all' | TastingRequestStatus;
type TabFilter = StatusFilter | 'visitors';

const REQUEST_STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_TABS: { value: TabFilter; label: string }[] = [
  ...REQUEST_STATUS_TABS,
  { value: 'visitors', label: 'Visitors' },
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

export function TastingRequestsClient({
  initialRequests,
  teamId: _teamId,
  initialPortfolioPage,
  visitorCount,
  nonRequestingVisitors,
}: TastingRequestsClientProps) {
  const router = useRouter();
  const [requests, setRequests] = useState<TastingRequest[]>(initialRequests);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<TastingRequest | null>(null);
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentSlug, setCurrentSlug] = useState(initialPortfolioPage?.slug ?? '');
  const [slug, setSlug] = useState(initialPortfolioPage?.slug ?? '');
  const [calendlyUrl, setCalendlyUrl] = useState(initialPortfolioPage?.calendly_url ?? '');
  const [isActive, setIsActive] = useState(initialPortfolioPage?.is_active ?? true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsCopied, setSettingsCopied] = useState(false);

  const storefrontPath = useMemo(() => storefrontPathForSlug(currentSlug), [currentSlug]);

  const filtered = useMemo(() => {
    let list = requests;
    if (activeTab !== 'all' && activeTab !== 'visitors') {
      list = list.filter((r) => r.status === activeTab);
    }
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
  }, [requests, activeTab, search]);

  useEffect(() => {
    if (activeTab === 'visitors') {
      setSelected(null);
      setUpdateError('');
    }
  }, [activeTab]);

  async function handleSaveSettings() {
    const trimmedSlug = slug.trim().toLowerCase();
    const trimmedCalendly = calendlyUrl.trim();

    setSettingsError('');
    setSettingsSaved(false);
    setSettingsCopied(false);

    if (!trimmedSlug) {
      setSettingsError('Slug is required');
      return;
    }

    if (!PORTFOLIO_SLUG_RE.test(trimmedSlug)) {
      setSettingsError('Slug must use only lowercase letters, numbers, and hyphens');
      return;
    }

    if (!trimmedCalendly) {
      setSettingsError('Calendly URL is required');
      return;
    }

    try {
      const url = new URL(trimmedCalendly);
      if (!['http:', 'https:'].includes(url.protocol)) {
        setSettingsError('Calendly URL must start with http:// or https://');
        return;
      }
    } catch {
      setSettingsError('Calendly URL must be a valid URL');
      return;
    }

    setSavingSettings(true);
    try {
      const response = await fetch('/api/portfolio', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: trimmedSlug,
          calendly_url: trimmedCalendly,
          is_active: isActive,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to save portfolio settings');
      }

      setSlug(payload.data.slug);
      setCurrentSlug(payload.data.slug);
      setCalendlyUrl(payload.data.calendly_url);
      setIsActive(payload.data.is_active);
      setSettingsSaved(true);
      setSettingsCopied(false);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save portfolio settings');
    } finally {
      setSavingSettings(false);
    }
  }

  async function copyStorefrontLink() {
    const absoluteUrl = `${window.location.origin}${storefrontPath}`;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setSettingsError('');
      setSettingsSaved(false);
      setSettingsCopied(true);
    } catch {
      setSettingsError('Unable to copy link. Please copy it manually.');
      setSettingsCopied(false);
    }
  }

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

  function handleMarkFulfilled(req: TastingRequest) {
    const qs = new URLSearchParams();
    qs.set('tasting_request_id', req.id);
    if (req.company_name) qs.set('company_name', req.company_name);
    for (const item of req.tasting_request_items ?? []) {
      qs.append('product_id', item.product_id);
      if (item.buyer_notes) qs.append('buyer_note', item.buyer_notes);
    }
    router.push(`/app/crm/recaps/new?${qs.toString()}`);
  }

  return (
    <div className={styles.page}>
      {/* ── Page header ── */}
      <div className={styles.header}>
        <h1 className={styles.title}>Tasting Requests</h1>
        <div className={styles.headerActions}>
          {initialPortfolioPage && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSettingsOpen(true);
                setSettingsError('');
                setSettingsSaved(false);
                setSettingsCopied(false);
              }}
              aria-label="Open portfolio settings"
              title="Portfolio settings"
              className={styles.iconButton}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V22a2 2 0 0 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H2a2 2 0 0 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H8a1.7 1.7 0 0 0 1-1.55V2a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.04a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V8c0 .68.4 1.29 1.03 1.55.17.07.34.1.52.1H22a2 2 0 0 1 0 4h-.09c-.69 0-1.31.4-1.58 1.03-.07.17-.1.34-.1.52Z" />
              </svg>
            </Button>
          )}
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
        <span
          className={styles.totalStatsLine}
          aria-label={`${requests.length} requests, ${visitorCount} total visitors`}
        >
          <span>{requests.length} request{requests.length !== 1 ? 's' : ''}</span>
          <span aria-hidden="true"> · </span>
          <span>{visitorCount} total visitor{visitorCount !== 1 ? 's' : ''}</span>
        </span>
      </div>

      {/* ── Status tabs ── */}
      <div className={styles.tabs} role="tablist">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            role="tab"
            aria-selected={activeTab === value}
            className={`${styles.tab} ${activeTab === value ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(value)}
          >
            {label}
            {value !== 'all' && (
              <span style={{ marginLeft: '0.3em', opacity: 0.65 }}>
                ({value === 'visitors'
                  ? nonRequestingVisitors.length
                  : requests.filter((r) => r.status === value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Table / card list ── */}
      <div className={styles.card}>
        {activeTab === 'visitors' ? (
          nonRequestingVisitors.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>No visitors found</p>
              <p className={styles.emptyDesc}>
                Visitors who browse your storefront without submitting a tasting request will appear here.
              </p>
            </div>
          ) : (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Email</th>
                    <th>Visited</th>
                  </tr>
                </thead>
                <tbody>
                  {nonRequestingVisitors.map((visitor) => (
                    <tr key={visitor.id}>
                      <td>{visitor.company_name ?? '—'}</td>
                      <td>{visitor.email}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{formatDate(visitor.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={styles.mobileList}>
                {nonRequestingVisitors.map((visitor) => (
                  <div key={visitor.id} className={styles.mobileCard}>
                    <div className={styles.mobileCardTop}>
                      <span className={styles.mobileEmail}>{visitor.company_name || visitor.email}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {visitor.company_name && <span className={styles.mobileMeta}>{visitor.email}</span>}
                      <span className={styles.mobileMeta}>{formatDate(visitor.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No tasting requests found</p>
            <p className={styles.emptyDesc}>
              {search || activeTab !== 'all'
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
                  onClick={() => handleMarkFulfilled(selected)}
                >
                  Fulfill → Create Recap
                </Button>
              )}
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div>
            {updateError && <p className={styles.saveError}>{updateError}</p>}

            <div className={styles.companyHero}>
              <p className={styles.companyHeroLabel}>Company</p>
              <p className={styles.companyHeroName}>{selected.company_name ?? '—'}</p>
              <p className={styles.companyHeroEmail}>{selected.visitor_email}</p>
            </div>

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
                {REQUEST_STATUS_TABS.filter((t) => t.value !== 'all').map(({ value, label }) => (
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

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Portfolio settings"
      >
        <div className={styles.settingsField}>
          <label htmlFor="portfolio-slug" className={styles.settingsLabel}>Slug</label>
          <input
            id="portfolio-slug"
            className={styles.settingsInput}
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="your-storefront-slug"
          />
          <p className={styles.settingsHelp}>Use lowercase letters, numbers, and hyphens only.</p>
        </div>

        <div className={styles.settingsField}>
          <label htmlFor="portfolio-calendly" className={styles.settingsLabel}>Calendly URL</label>
          <input
            id="portfolio-calendly"
            className={styles.settingsInput}
            value={calendlyUrl}
            onChange={(event) => setCalendlyUrl(event.target.value)}
            placeholder="https://calendly.com/..."
          />
        </div>

        <label className={styles.settingsToggleRow}>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          Active storefront
        </label>

        {(settingsError || settingsSaved || settingsCopied) && (
          <p className={settingsError ? styles.settingsError : styles.settingsSuccess}>
            {settingsError || (settingsSaved ? 'Saved' : 'Link copied')}
          </p>
        )}

        <div className={styles.settingsActions}>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSaveSettings}
            loading={savingSettings}
          >
            Save
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={copyStorefrontLink}>
            Copy storefront link
          </Button>
          <a
            className={styles.settingsLinkButton}
            href={storefrontPath}
            target="_blank"
            rel="noreferrer"
          >
            View storefront
          </a>
        </div>
      </Modal>
    </div>
  );
}
