'use client';
// src/app/taste/TastePageClient.tsx
// Client component — brand tile grid, filters, and opt-in form.
// Rendered inside /taste/page.tsx (public, no auth).

import { useState, useMemo } from 'react';
import type { PublicBrandCard } from '@/lib/data';
import type { TeamSettings } from '@/types';
import styles from './taste.module.css';

interface Props {
  brands:   PublicBrandCard[];
  settings: TeamSettings | null;
  teamId:   string;
}

type WineFilter = 'All' | 'Red' | 'White' | 'Rosé' | 'Sparkling' | 'Dessert' | 'Spirit' | 'Other';
const FILTERS: WineFilter[] = ['All', 'Red', 'White', 'Rosé', 'Sparkling', 'Dessert', 'Spirit', 'Other'];

function buildCalendlyUrl(baseUrl: string, brandName: string, teamId: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('utm_source',   'pouradvice');
  url.searchParams.set('utm_campaign', 'tasting');
  url.searchParams.set('utm_medium',   teamId);
  url.searchParams.set('utm_content',  brandName);
  return url.toString();
}

function BrandCard({ brand, calendlyUrl, teamId }: {
  brand:       PublicBrandCard;
  calendlyUrl: string | null;
  teamId:      string;
}) {
  const [expanded, setExpanded] = useState(false);

  const types = [...new Set(brand.products.map(p => p.type).filter(Boolean))] as string[];
  const bookingUrl = calendlyUrl
    ? buildCalendlyUrl(calendlyUrl, brand.name, teamId)
    : null;

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardMeta}>
          {[brand.country, brand.region].filter(Boolean).join(' · ') && (
            <span className={styles.origin}>
              {[brand.country, brand.region].filter(Boolean).join(' · ')}
            </span>
          )}
          {types.map(t => (
            <span key={t} className={`${styles.typeBadge} ${styles[`type${t.replace(/[^a-z]/gi, '')}`]}`}>
              {t}
            </span>
          ))}
        </div>
        <h2 className={styles.brandName}>{brand.name}</h2>
        {brand.supplier && (
          <p className={styles.supplier}>by {brand.supplier.name}</p>
        )}
        {brand.description && (
          <p className={styles.description}>{brand.description}</p>
        )}
      </div>

      {brand.products.length > 0 && (
        <div className={styles.products}>
          <button
            className={styles.expandToggle}
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
          >
            {brand.products.length} SKU{brand.products.length !== 1 ? 's' : ''}
            <span className={styles.chevron}>{expanded ? '▲' : '▼'}</span>
          </button>

          {expanded && (
            <ul className={styles.skuList}>
              {brand.products.map(p => (
                <li key={p.id} className={styles.skuItem}>
                  <span className={styles.skuName}>{p.wine_name}</span>
                  {[p.varietal, p.vintage].filter(Boolean).length > 0 && (
                    <span className={styles.skuMeta}>
                      {[p.varietal, p.vintage].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {p.tasting_notes && (
                    <span className={styles.skuNotes}>{p.tasting_notes}</span>
                  )}
                  <span className={styles.skuFooter}>
                    {p.frontline_cost != null && (
                      <span className={styles.price}>${p.frontline_cost.toFixed(2)}</span>
                    )}
                    {p.tech_sheet_url && (
                      <a
                        href={p.tech_sheet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.techSheet}
                      >
                        Tech Sheet ↗
                      </a>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className={styles.cardFooter}>
        {bookingUrl ? (
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.bookBtn}
          >
            Schedule a Tasting
          </a>
        ) : (
          <span className={styles.bookBtnDisabled}>Booking coming soon</span>
        )}
      </div>
    </article>
  );
}

function OptInForm({ teamId }: { teamId: string }) {
  const [form,    setForm]    = useState({ name: '', email: '', company: '', role: '' });
  const [status,  setStatus]  = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    try {
      const res = await fetch('/api/public/subscribe', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ team_id: teamId, ...form }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage('You\'re on the list! We\'ll notify you when new brands arrive.');
      } else {
        setStatus('error');
        setMessage(json.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  }

  if (status === 'success') {
    return (
      <div className={styles.optInSuccess}>
        <span className={styles.checkmark}>✓</span>
        <p>{message}</p>
      </div>
    );
  }

  return (
    <form className={styles.optInForm} onSubmit={handleSubmit}>
      <h3 className={styles.optInTitle}>Get Notified When New Brands Arrive</h3>
      <p className={styles.optInSubtitle}>
        Join our tasting list and be the first to hear about new portfolio additions.
      </p>
      <div className={styles.formRow}>
        <input
          className={styles.formInput}
          type="text"
          placeholder="Your name *"
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          required
        />
        <input
          className={styles.formInput}
          type="email"
          placeholder="Email address *"
          value={form.email}
          onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
          required
        />
      </div>
      <div className={styles.formRow}>
        <input
          className={styles.formInput}
          type="text"
          placeholder="Company / Restaurant"
          value={form.company}
          onChange={e => setForm(f => ({ ...f, company: e.target.value }))}
        />
        <input
          className={styles.formInput}
          type="text"
          placeholder="Your role (e.g. Sommelier)"
          value={form.role}
          onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
        />
      </div>
      {status === 'error' && (
        <p className={styles.formError}>{message}</p>
      )}
      <button
        type="submit"
        className={styles.optInBtn}
        disabled={status === 'loading'}
      >
        {status === 'loading' ? 'Subscribing…' : 'Join the Tasting List'}
      </button>
    </form>
  );
}

export default function TastePageClient({ brands, settings, teamId }: Props) {
  const [activeFilter, setActiveFilter] = useState<WineFilter>('All');
  const [search,       setSearch]       = useState('');

  const visibleFilters = useMemo<WineFilter[]>(() => {
    const types = new Set(
      brands.flatMap(b => b.products.map(p => p.type).filter(Boolean)) as string[]
    );
    return FILTERS.filter(f => f === 'All' || types.has(f));
  }, [brands]);

  const filtered = useMemo(() => {
    return brands.filter(b => {
      const matchesFilter =
        activeFilter === 'All' ||
        b.products.some(p => p.type === activeFilter);
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        b.name.toLowerCase().includes(q) ||
        (b.country?.toLowerCase().includes(q) ?? false) ||
        (b.region?.toLowerCase().includes(q) ?? false) ||
        b.products.some(p => p.wine_name.toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });
  }, [brands, activeFilter, search]);

  const teamName    = settings?.team_name ?? 'Pour Advice';
  const tagline     = settings?.tagline ?? 'Private wine tastings by appointment';
  const calendlyUrl = settings?.calendly_url ?? null;

  return (
    <div className={styles.page}>
      {/* Hero */}
      <header className={styles.hero}>
        {settings?.logo_url && (
          <img src={settings.logo_url} alt={teamName} className={styles.logo} />
        )}
        <h1 className={styles.heroTitle}>{teamName}</h1>
        <p className={styles.heroTagline}>{tagline}</p>
      </header>

      {/* Controls */}
      {brands.length > 0 && (
        <div className={styles.controls}>
          <div className={styles.filterBar}>
            {visibleFilters.map(f => (
              <button
                key={f}
                className={`${styles.filterBtn} ${activeFilter === f ? styles.filterBtnActive : ''}`}
                onClick={() => setActiveFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search brands, wines, regions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Grid */}
      <main className={styles.main}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {brands.length === 0
              ? 'No active brands available at this time.'
              : 'No brands match your search.'}
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map(brand => (
              <BrandCard
                key={brand.id}
                brand={brand}
                calendlyUrl={calendlyUrl}
                teamId={teamId}
              />
            ))}
          </div>
        )}
      </main>

      {/* Opt-in form */}
      <section className={styles.optInSection}>
        <OptInForm teamId={teamId} />
      </section>
    </div>
  );
}
