'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import type { StorefrontProduct, TastingTrayItem, WineType } from '@/types';
import { WINE_TYPES } from '@/types';
import styles from './StorefrontClient.module.css';

const MAX_TRAY_ITEMS = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let calendlyScriptPromise: Promise<void> | null = null;

declare global {
  interface Window {
    Calendly?: {
      initPopupWidget: (options: { url: string }) => void;
    };
  }
}

interface StorefrontClientProps {
  slug: string;
  teamId: string;
  calendlyUrl: string;
}

function getCookie(name: string): string | null {
  const target = `${name}=`;
  const item = document.cookie.split('; ').find((value) => value.startsWith(target));
  if (!item) return null;
  return decodeURIComponent(item.slice(target.length));
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function formatPrice(value: number | null): string | null {
  if (value == null) return null;
  return `$${value.toFixed(2)}`;
}

function originFor(product: StorefrontProduct): string {
  return [product.country, product.region, product.appellation].filter(Boolean).join(' · ');
}

function loadCalendlyScript(): Promise<void> {
  if (window.Calendly) return Promise.resolve();
  if (calendlyScriptPromise) return calendlyScriptPromise;

  calendlyScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-calendly-widget="true"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Calendly')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://assets.calendly.com/assets/external/widget.js';
    script.async = true;
    script.dataset.calendlyWidget = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Calendly'));
    document.body.appendChild(script);
  });

  return calendlyScriptPromise;
}

export function StorefrontClient({ slug, teamId, calendlyUrl }: StorefrontClientProps) {
  const [products, setProducts] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<StorefrontProduct | null>(null);
  const [trayItems, setTrayItems] = useState<TastingTrayItem[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [overallNotes, setOverallNotes] = useState('');

  const [visitorEmail, setVisitorEmail] = useState('');
  const [gateEmail, setGateEmail] = useState('');
  const [gateOpen, setGateOpen] = useState(false);
  const [gateSaving, setGateSaving] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const [booking, setBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  const cookieKey = useMemo(() => `pa_visitor_${slug}`, [slug]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (typeFilter) params.set('type', typeFilter);

      const response = await fetch(`/api/storefront/${slug}/products?${params.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to fetch products');
      }

      setProducts(payload.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }, [search, slug, typeFilter]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const savedEmail = getCookie(cookieKey);
    if (savedEmail) {
      setVisitorEmail(savedEmail);
      setGateEmail(savedEmail);
      setGateOpen(false);
      return;
    }

    setGateOpen(true);
  }, [cookieKey]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.event !== 'calendly.event_scheduled') return;
      const eventUri = event.data?.payload?.event?.uri as string | undefined;
      const requestId = pendingRequestId;

      if (!requestId || !eventUri) return;
      setPendingRequestId(null);

      void (async () => {
        try {
          const patchRes = await fetch('/api/storefront/tasting-request', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: requestId, calendly_event_uri: eventUri }),
          });

          if (!patchRes.ok) {
            throw new Error('Unable to attach the appointment details.');
          }

          setBookingSuccess(true);
          setBookingError(null);
          setTrayItems([]);
          setOverallNotes('');
          setReviewOpen(false);
        } catch (err) {
          setBookingError(err instanceof Error ? err.message : 'Unable to update booking details.');
        }
      })();
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [pendingRequestId]);

  const trayProductIds = useMemo(() => new Set(trayItems.map((item) => item.product.id)), [trayItems]);
  const trayIsFull = trayItems.length >= MAX_TRAY_ITEMS;

  const addToTray = (product: StorefrontProduct) => {
    if (trayProductIds.has(product.id) || trayIsFull) return;
    setTrayItems((prev) => [...prev, { product, buyer_notes: '' }]);
  };

  const removeFromTray = (productId: string) => {
    setTrayItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateItemNote = (productId: string, value: string) => {
    setTrayItems((prev) => prev.map((item) => (
      item.product.id === productId ? { ...item, buyer_notes: value } : item
    )));
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
  };

  const handleGateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const email = gateEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setGateError('Please enter a valid email address.');
      return;
    }

    setGateSaving(true);
    setGateError(null);

    try {
      const response = await fetch('/api/storefront/visitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'Unable to save visitor email');
      }

      setVisitorEmail(email);
      setCookie(cookieKey, email, 365);
      setGateOpen(false);
    } catch (err) {
      setGateError(err instanceof Error ? err.message : 'Unable to continue right now.');
    } finally {
      setGateSaving(false);
    }
  };

  const handleBookTasting = async () => {
    if (!visitorEmail) {
      setGateOpen(true);
      return;
    }

    if (trayItems.length === 0 || booking) return;

    setBooking(true);
    setBookingError(null);
    setBookingSuccess(false);

    try {
      const createResponse = await fetch('/api/storefront/tasting-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          email: visitorEmail,
          notes: overallNotes,
          items: trayItems.map((item) => ({
            product_id: item.product.id,
            buyer_notes: item.buyer_notes.trim() || undefined,
          })),
        }),
      });

      const payload = await createResponse.json();
      if (!createResponse.ok || !payload.request_id) {
        throw new Error(payload.error ?? 'Unable to create tasting request');
      }

      setPendingRequestId(payload.request_id);
      await loadCalendlyScript();

      if (!window.Calendly?.initPopupWidget) {
        throw new Error('Calendly failed to initialize.');
      }

      window.Calendly.initPopupWidget({ url: calendlyUrl });
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className={styles.page} data-team-id={teamId}>
      <header className={styles.banner}>
        <img src="/logo.jpeg" alt="Pour Advice logo" className={styles.logo} />
        <h1 className={styles.title}>Pour Advice Portfolio</h1>
        <button
          type="button"
          className={styles.hamburger}
          onClick={() => setFiltersOpen((prev) => !prev)}
          aria-expanded={filtersOpen}
          aria-controls="storefront-filters"
        >
          ☰
        </button>
      </header>

      {filtersOpen && (
        <section id="storefront-filters" className={styles.filtersPanel}>
          <label className="form-label" htmlFor="storefront-search">Search</label>
          <input
            id="storefront-search"
            className="form-control"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by wine, SKU, region, or distributor"
          />

          <label className="form-label" htmlFor="storefront-type">Wine type</label>
          <select
            id="storefront-type"
            className="form-control"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">All types</option>
            {WINE_TYPES.map((wineType: WineType) => (
              <option key={wineType} value={wineType}>{wineType}</option>
            ))}
          </select>

          <Button variant="secondary" onClick={clearFilters}>Clear Filters</Button>
        </section>
      )}

      {bookingSuccess && (
        <div className={styles.successBanner}>
          Your tasting has been booked! We&apos;ll reach out to confirm details.
        </div>
      )}

      <section className={styles.content}>
        {loading ? (
          <div className={styles.loadingWrap}>
            <LoadingSpinner label="Loading storefront products" />
          </div>
        ) : error ? (
          <p className={styles.error}>{error}</p>
        ) : products.length === 0 ? (
          <p className={styles.empty}>No products match your filters right now.</p>
        ) : (
          <div className={styles.grid}>
            {products.map((product) => {
              const inTray = trayProductIds.has(product.id);
              const fullAndUnavailable = !inTray && trayIsFull;
              const origin = originFor(product);
              const price = formatPrice(product.frontline_cost);

              return (
                <article key={product.id} className={styles.card}>
                  <h2 className={styles.cardTitle}>{product.wine_name}</h2>
                  <div className={styles.metaRow}>
                    {product.type && <span className={styles.typeBadge}>{product.type}</span>}
                    {product.varietal && <span className={styles.metaText}>{product.varietal}</span>}
                  </div>
                  <p className={styles.metaText}>{[product.brand_name, product.supplier_name].filter(Boolean).join(' / ') || '—'}</p>
                  {origin && <p className={styles.metaText}>{origin}</p>}
                  {product.vintage && <p className={styles.metaText}>Vintage {product.vintage}</p>}
                  {price && <p className={styles.price}>{price}</p>}

                  <div className={styles.cardActions}>
                    <Button variant="secondary" onClick={() => setSelectedProduct(product)}>View Details</Button>
                    <Button
                      title={fullAndUnavailable ? 'Tasting is full (6 wines max)' : undefined}
                      onClick={() => addToTray(product)}
                      disabled={inTray || fullAndUnavailable}
                    >
                      {inTray ? 'Added' : fullAndUnavailable ? 'Tasting is full (6 wines max)' : 'Add to Tasting'}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <Slideover
        open={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        title={selectedProduct?.wine_name ?? 'Wine Details'}
        footer={selectedProduct ? (
          <Button
            onClick={() => addToTray(selectedProduct)}
            disabled={trayProductIds.has(selectedProduct.id) || trayIsFull}
            title={trayIsFull && !trayProductIds.has(selectedProduct.id) ? 'Tasting is full (6 wines max)' : undefined}
          >
            {trayProductIds.has(selectedProduct.id)
              ? 'Already in Tasting'
              : trayIsFull
                ? 'Tasting is full (6 wines max)'
                : 'Add to Tasting'}
          </Button>
        ) : null}
      >
        {selectedProduct && (
          <div className={styles.detailCard}>
            <div className={styles.detailRow}><span>SKU</span><strong>{selectedProduct.sku_number}</strong></div>
            {selectedProduct.type && <div className={styles.detailRow}><span>Type</span><strong>{selectedProduct.type}</strong></div>}
            {selectedProduct.varietal && <div className={styles.detailRow}><span>Varietal</span><strong>{selectedProduct.varietal}</strong></div>}
            {selectedProduct.brand_name && <div className={styles.detailRow}><span>Brand</span><strong>{selectedProduct.brand_name}</strong></div>}
            {selectedProduct.supplier_name && <div className={styles.detailRow}><span>Supplier</span><strong>{selectedProduct.supplier_name}</strong></div>}
            {originFor(selectedProduct) && <div className={styles.detailRow}><span>Origin</span><strong>{originFor(selectedProduct)}</strong></div>}
            {selectedProduct.vintage && <div className={styles.detailRow}><span>Vintage</span><strong>{selectedProduct.vintage}</strong></div>}
            {selectedProduct.distributor && <div className={styles.detailRow}><span>Distributor</span><strong>{selectedProduct.distributor}</strong></div>}
            {formatPrice(selectedProduct.frontline_cost) && <div className={styles.detailRow}><span>Frontline cost</span><strong>{formatPrice(selectedProduct.frontline_cost)}</strong></div>}
            {selectedProduct.tech_sheet_url && (
              <div className={styles.detailRow}>
                <span>Tech sheet</span>
                <a href={selectedProduct.tech_sheet_url} target="_blank" rel="noopener noreferrer">View</a>
              </div>
            )}
            {selectedProduct.tasting_notes && <p className={styles.longText}><strong>Tasting notes:</strong> {selectedProduct.tasting_notes}</p>}
            {selectedProduct.description && <p className={styles.longText}><strong>Description:</strong> {selectedProduct.description}</p>}
            {selectedProduct.notes && <p className={styles.longText}><strong>Notes:</strong> {selectedProduct.notes}</p>}
          </div>
        )}
      </Slideover>

      <Slideover
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Review Tasting"
        footer={(
          <Button onClick={handleBookTasting} loading={booking} disabled={trayItems.length === 0}>
            Book This Tasting
          </Button>
        )}
      >
        {trayItems.map((item) => (
          <div key={item.product.id} className={styles.reviewItem}>
            <div className={styles.reviewHeader}>
              <h3>{item.product.wine_name}</h3>
              <button
                type="button"
                className={styles.removeBtn}
                onClick={() => removeFromTray(item.product.id)}
              >
                Remove
              </button>
            </div>
            <p className={styles.metaText}>{[item.product.type, item.product.varietal].filter(Boolean).join(' · ') || 'Wine'}</p>
            <input
              className="form-control"
              value={item.buyer_notes}
              onChange={(event) => updateItemNote(item.product.id, event.target.value)}
              placeholder="Any notes for this wine? e.g. 'interested in BTG placement'"
            />
          </div>
        ))}

        <div className={styles.notesBlock}>
          <label className="form-label" htmlFor="overall-notes">Overall notes (optional)</label>
          <textarea
            id="overall-notes"
            className="form-control"
            value={overallNotes}
            onChange={(event) => setOverallNotes(event.target.value)}
            placeholder="Anything else we should know before the tasting?"
          />
        </div>

        {bookingError && <p className={styles.error}>{bookingError}</p>}
      </Slideover>

      {trayItems.length > 0 && (
        <div className={styles.trayBar}>
          <div>
            <p className={styles.trayCount}>{trayItems.length} of {MAX_TRAY_ITEMS} wines selected</p>
            <p className={styles.trayHint}>We recommend 6 wines for an ideal tasting experience.</p>
          </div>
          <Button onClick={() => setReviewOpen(true)}>Review Tasting</Button>
        </div>
      )}

      {gateOpen && (
        <div className={styles.gateBackdrop} role="dialog" aria-modal="true" aria-label="Email capture">
          <form className={styles.gateModal} onSubmit={handleGateSubmit}>
            <h2>Enter the email you&apos;d like us to use for communications</h2>
            <input
              type="email"
              className="form-control"
              value={gateEmail}
              onChange={(event) => setGateEmail(event.target.value)}
              placeholder="you@example.com"
              required
            />
            {gateError && <p className={styles.error}>{gateError}</p>}
            <Button type="submit" loading={gateSaving}>Continue</Button>
          </form>
        </div>
      )}
    </div>
  );
}
