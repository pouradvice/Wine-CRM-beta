'use client';

import { useMemo, useState } from 'react';
import styles from './page.module.css';

interface PortfolioPageSettings {
  id: string;
  team_id: string;
  slug: string;
  calendly_url: string;
  is_active: boolean;
  created_at: string;
}

interface PortfolioVisitorRow {
  id: string;
  email: string;
  company_name: string | null;
  created_at: string;
}

interface PortfolioRequestRow {
  id: string;
  company_name: string | null;
  visitor_email: string;
  status: string;
  created_at: string;
}

interface PortfolioStats {
  visitorCount: number;
  requestCount: number;
  recentVisitors: PortfolioVisitorRow[];
  recentRequests: PortfolioRequestRow[];
}

interface PortfolioAdminClientProps {
  initialPage: PortfolioPageSettings;
  stats: PortfolioStats;
}

const SLUG_RE = /^[a-z0-9-]+$/;

export function PortfolioAdminClient({ initialPage, stats }: PortfolioAdminClientProps) {
  const [slug, setSlug] = useState(initialPage.slug);
  const [calendlyUrl, setCalendlyUrl] = useState(initialPage.calendly_url);
  const [isActive, setIsActive] = useState(initialPage.is_active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const storefrontPath = useMemo(() => `/pouradvice/${slug || initialPage.slug}`, [initialPage.slug, slug]);

  async function handleSave() {
    const trimmedSlug = slug.trim().toLowerCase();
    const trimmedCalendly = calendlyUrl.trim();

    setError('');
    setSaved(false);

    if (!trimmedSlug) {
      setError('Slug is required');
      return;
    }

    if (!SLUG_RE.test(trimmedSlug)) {
      setError('Slug must use only lowercase letters, numbers, and hyphens');
      return;
    }

    if (!trimmedCalendly) {
      setError('Calendly URL is required');
      return;
    }

    try {
      const url = new URL(trimmedCalendly);
      if (!['http:', 'https:'].includes(url.protocol)) {
        setError('Calendly URL must start with http:// or https://');
        return;
      }
    } catch {
      setError('Calendly URL must be a valid URL');
      return;
    }

    setSaving(true);
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
      setCalendlyUrl(payload.data.calendly_url);
      setIsActive(payload.data.is_active);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save portfolio settings');
    } finally {
      setSaving(false);
    }
  }

  async function copyStorefrontLink() {
    const absoluteUrl = `${window.location.origin}${storefrontPath}`;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setSaved(true);
      setError('');
    } catch {
      setError('Unable to copy link. Please copy it manually.');
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Portfolio</h1>
        <p className={styles.subtle}>Manage your storefront page settings and review activity.</p>
      </header>

      <section className={styles.grid}>
        <article className={styles.card}>
          <h2 className={styles.cardTitle}>Settings</h2>

          <div className={styles.field}>
            <label className={styles.label}>Current storefront URL</label>
            <a href={storefrontPath} target="_blank" rel="noreferrer" className={styles.storefrontLink}>
              {storefrontPath}
            </a>
          </div>

          <div className={styles.field}>
            <label htmlFor="portfolio-slug" className={styles.label}>Slug</label>
            <input
              id="portfolio-slug"
              className={styles.input}
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="your-storefront-slug"
            />
            <p className={styles.helpText}>Use lowercase letters, numbers, and hyphens only.</p>
          </div>

          <div className={styles.field}>
            <label htmlFor="portfolio-calendly" className={styles.label}>Calendly URL</label>
            <input
              id="portfolio-calendly"
              className={styles.input}
              value={calendlyUrl}
              onChange={(event) => setCalendlyUrl(event.target.value)}
              placeholder="https://calendly.com/..."
            />
          </div>

          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Active storefront
          </label>

          {(error || saved) && (
            <p className={error ? styles.error : styles.success}>
              {error || 'Saved'}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </article>

        <article className={styles.card}>
          <h2 className={styles.cardTitle}>Quick actions</h2>
          <div className={styles.actions}>
            <button type="button" className={styles.secondaryButton} onClick={copyStorefrontLink}>
              Copy storefront link
            </button>
            <a className={styles.secondaryButton} href={storefrontPath} target="_blank" rel="noreferrer">
              View storefront
            </a>
          </div>
        </article>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Stats</h2>
        <div className={styles.kpis}>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Total visitors</span>
            <strong className={styles.kpiValue}>{stats.visitorCount}</strong>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Total tasting requests</span>
            <strong className={styles.kpiValue}>{stats.requestCount}</strong>
          </div>
        </div>

        <div className={styles.tables}>
          <div>
            <h3 className={styles.tableTitle}>Recent visitors</h3>
            {stats.recentVisitors.length === 0 ? (
              <p className={styles.empty}>No visitors yet.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Company</th>
                    <th>Visited</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentVisitors.map((visitor) => (
                    <tr key={visitor.id}>
                      <td>{visitor.email}</td>
                      <td>{visitor.company_name ?? '—'}</td>
                      <td>{new Date(visitor.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h3 className={styles.tableTitle}>Recent tasting requests</h3>
            {stats.recentRequests.length === 0 ? (
              <p className={styles.empty}>No tasting requests yet.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recentRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.company_name ?? '—'}</td>
                      <td>{request.visitor_email}</td>
                      <td>{request.status}</td>
                      <td>{new Date(request.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
