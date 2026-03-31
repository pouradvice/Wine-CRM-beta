// src/app/supplier/[slug]/page.tsx
// Supplier Portal — authenticated route for supplier-side users.
//
// Auth:   middleware confirms the user is logged in.
// AuthZ:  this page confirms the user is in supplier_users for this slug.
//         Returns an inline 403 if not — no redirect loop for broker reps.
//
// Data:   all queries use the SSR Supabase client (enforces RLS).
//         Supplier-scoped read policies in 04_schema_rework.sql and
//         25_distributor_portal.sql grant access to products, recap_products,
//         recaps, accounts, and follow_ups for the supplier's own data.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────

interface SupplierPortalProduct {
  id: string;
  wine_name: string;
  sku_number: string;
  type: string | null;
  varietal: string | null;
}

interface PlacementRow {
  id: string;
  outcome: string;
  buyer_feedback: string | null;
  created_at: string;
  product: { wine_name: string; sku_number: string } | null;
  recap: {
    visit_date: string;
    account: { name: string; city: string | null; state: string | null } | null;
  } | null;
}

interface FollowUpRow {
  id: string;
  due_date: string | null;
  type: string;
  status: string;
  product: { wine_name: string } | null;
  account: { name: string; city: string | null } | null;
}

// ── Outcome display helpers ───────────────────────────────────

const OUTCOME_LABELS: Record<string, string> = {
  'Yes Today':      'Order',
  'Yes Later':      'Follow-up',
  'Maybe Later':    'Maybe',
  'No':             'No',
  'Discussed':      'Discussed',
  'Menu Placement': 'Menu',
};

const OUTCOME_CLASS: Record<string, string> = {
  'Yes Today':      styles.outcomeOrder,
  'Yes Later':      styles.outcomeYes,
  'Maybe Later':    styles.outcomeMaybe,
  'No':             styles.outcomeNo,
  'Discussed':      styles.outcomeDiscussed,
  'Menu Placement': styles.outcomeMenu,
};

// ── Page ──────────────────────────────────────────────────────

export default async function SupplierPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = await createClient();

  // Auth — middleware already guards this, but defence-in-depth.
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?redirect=/supplier/${slug}`);

  // AuthZ — confirm this user is mapped to this supplier.
  // Fetches supplier metadata in the same query to avoid a second round-trip.
  const { data: mapping } = await sb
    .from('supplier_users')
    .select('role, supplier:suppliers(id, name, country, region, website, is_active)')
    .eq('user_id', user.id)
    .eq('supplier_id', slug)
    .maybeSingle();

  if (!mapping || !mapping.supplier) {
    return (
      <main className={styles.forbidden}>
        <h1 className={styles.forbiddenCode}>403</h1>
        <p className={styles.forbiddenMsg}>
          You do not have access to this supplier portal.
        </p>
      </main>
    );
  }

  // Safe to cast — Supabase returns the joined object when selecting via FK.
  const supplier = mapping.supplier as unknown as {
    id: string;
    name: string;
    country: string | null;
    region: string | null;
    website: string | null;
    is_active: boolean;
  };

  // Fetch portal data in parallel.
  const [productsRes, placementsRes, outcomeSummaryRes, followUpsRes] = await Promise.all([

    // Portfolio: active products for this supplier across all teams.
    sb
      .from('products')
      .select('id, wine_name, sku_number, type, varietal')
      .eq('supplier_id', slug)
      .eq('is_active', true)
      .order('wine_name'),

    // Recent placements: last 30 recap_products for this supplier.
    // Joins through recaps (supplier-readable via recaps_supplier_read policy)
    // and accounts (supplier-readable via accounts_supplier_read policy).
    sb
      .from('recap_products')
      .select(`
        id, outcome, buyer_feedback, created_at,
        product:products(wine_name, sku_number),
        recap:recaps(visit_date, account:accounts(name, city, state))
      `)
      .eq('supplier_id', slug)
      .order('created_at', { ascending: false })
      .limit(30),

    // Outcome totals: all-time for this supplier.
    sb
      .from('recap_products')
      .select('outcome')
      .eq('supplier_id', slug),

    // Open follow-ups: overdue or upcoming, for pipeline view.
    sb
      .from('follow_ups')
      .select(`
        id, due_date, type, status,
        product:products(wine_name),
        account:accounts(name, city)
      `)
      .eq('supplier_id', slug)
      .eq('status', 'Open')
      .order('due_date'),
  ]);

  const products    = (productsRes.data    ?? []) as SupplierPortalProduct[];
  const placements  = (placementsRes.data  ?? []) as PlacementRow[];
  const allOutcomes = outcomeSummaryRes.data ?? [];
  const followUps   = (followUpsRes.data   ?? []) as FollowUpRow[];

  // Tally outcomes for the summary strip.
  const outcomeCounts = allOutcomes.reduce<Record<string, number>>((acc, row) => {
    const o = (row as { outcome: string }).outcome;
    acc[o] = (acc[o] ?? 0) + 1;
    return acc;
  }, {});

  const totalPlacements = allOutcomes.length;

  return (
    <main className={styles.page}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.portalLabel}>Supplier Portal</span>
          {!supplier.is_active && (
            <span className={styles.inactiveBadge}>Inactive</span>
          )}
        </div>
        <h1 className={styles.supplierName}>{supplier.name}</h1>
        <div className={styles.supplierSub}>
          {[supplier.region, supplier.country].filter(Boolean).join(' · ')}
          {supplier.website && (
            <>
              {' · '}
              <a
                href={supplier.website}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.websiteLink}
              >
                {supplier.website.replace(/^https?:\/\//, '')}
              </a>
            </>
          )}
        </div>
        <div className={styles.headerRole}>
          Signed in as <strong>{user.email}</strong>
          {' · '}
          <span className={styles.roleBadge}>{mapping.role}</span>
        </div>
      </header>

      {/* ── Outcome summary strip ───────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Placement Activity</h2>
        <div className={styles.summaryStrip}>
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>{totalPlacements}</span>
            <span className={styles.summaryLabel}>Total presentations</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={`${styles.summaryValue} ${styles.valueOrder}`}>
              {(outcomeCounts['Yes Today'] ?? 0) + (outcomeCounts['Menu Placement'] ?? 0)}
            </span>
            <span className={styles.summaryLabel}>Orders + menu placements</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={`${styles.summaryValue} ${styles.valueYes}`}>
              {outcomeCounts['Yes Later'] ?? 0}
            </span>
            <span className={styles.summaryLabel}>Pending follow-ups</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={styles.summaryValue}>{products.length}</span>
            <span className={styles.summaryLabel}>Active SKUs</span>
          </div>
          <div className={styles.summaryCell}>
            <span className={`${styles.summaryValue} ${styles.valuePipeline}`}>
              {followUps.length}
            </span>
            <span className={styles.summaryLabel}>Open follow-ups</span>
          </div>
        </div>
      </section>

      {/* ── Recent placements ──────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Recent Presentations</h2>
        {placements.length === 0 ? (
          <p className={styles.empty}>No presentation data yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Wine</th>
                  <th>Account</th>
                  <th>Outcome</th>
                  <th>Date</th>
                  <th>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className={styles.wineName}>{row.product?.wine_name ?? '—'}</span>
                      <span className={styles.skuNumber}>{row.product?.sku_number}</span>
                    </td>
                    <td>
                      {row.recap?.account ? (
                        <>
                          <span className={styles.accountName}>{row.recap.account.name}</span>
                          <span className={styles.accountLocation}>
                            {[row.recap.account.city, row.recap.account.state]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </>
                      ) : '—'}
                    </td>
                    <td>
                      <span className={`${styles.outcomePill} ${OUTCOME_CLASS[row.outcome] ?? ''}`}>
                        {OUTCOME_LABELS[row.outcome] ?? row.outcome}
                      </span>
                    </td>
                    <td className={styles.dateCell}>
                      {row.recap?.visit_date
                        ? new Date(row.recap.visit_date).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className={styles.feedbackCell}>
                      {row.buyer_feedback ?? <span className={styles.noFeedback}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Open follow-ups ───────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Open Follow-Ups</h2>
        {followUps.length === 0 ? (
          <p className={styles.empty}>No open follow-ups.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Wine</th>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Due</th>
                </tr>
              </thead>
              <tbody>
                {followUps.map((row) => {
                  const isOverdue =
                    row.due_date != null && new Date(row.due_date) < new Date();
                  return (
                    <tr key={row.id}>
                      <td className={styles.wineName}>{row.product?.wine_name ?? '—'}</td>
                      <td>
                        {row.account ? (
                          <>
                            <span className={styles.accountName}>{row.account.name}</span>
                            {row.account.city && (
                              <span className={styles.accountLocation}>{row.account.city}</span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td className={styles.followUpType}>{row.type}</td>
                      <td className={isOverdue ? styles.overdue : styles.dateCell}>
                        {row.due_date
                          ? new Date(row.due_date).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })
                          : '—'}
                        {isOverdue && <span className={styles.overdueLabel}> overdue</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Portfolio ─────────────────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Active Portfolio ({products.length} SKUs)</h2>
        {products.length === 0 ? (
          <p className={styles.empty}>No active SKUs linked to this supplier.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Wine name</th>
                  <th>Type</th>
                  <th>Varietal</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className={styles.skuCell}>{p.sku_number}</td>
                    <td className={styles.wineName}>{p.wine_name}</td>
                    <td>{p.type ?? '—'}</td>
                    <td>{p.varietal ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
