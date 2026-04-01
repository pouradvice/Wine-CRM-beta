// src/app/distributor/[slug]/page.tsx
// Distributor Portal — authenticated route for distributor-side users.
//
// Auth:   middleware confirms the user is logged in.
// AuthZ:  this page confirms the user is in distributor_users for this slug.
//         Returns an inline 403 if not — no redirect loop for other user types.
//
// Data:   RLS-scoped reads via distributor_users policies from
//         25_distributor_portal.sql.
//
// SCOPE NOTE (SCH-02 boundary):
//   Portfolio analytics (placements by SKU, conversion rates) require
//   products.distributor to be migrated from a free-text TEXT column to
//   a distributor_id FK. That migration is deferred to the SCH-02 workstream.
//   This sprint delivers the auth infrastructure and distributor metadata view.
//   The analytics section is scaffolded with a clear status message.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function DistributorPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = await createClient();

  // Auth — middleware already guards this, but defence-in-depth.
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?redirect=/distributor/${slug}`);

  // AuthZ — confirm this user is mapped to this distributor.
  // The distributors_read RLS policy ensures only mapped users can read the row.
  const { data: mapping } = await sb
    .from('distributor_users')
    .select('role, distributor:distributors(id, name, region, state, country, website, is_active)')
    .eq('user_id', user.id)
    .eq('distributor_id', slug)
    .maybeSingle();

  if (!mapping || !mapping.distributor) {
    return (
      <main className={styles.forbidden}>
        <h1 className={styles.forbiddenCode}>403</h1>
        <p className={styles.forbiddenMsg}>
          You do not have access to this distributor portal.
        </p>
      </main>
    );
  }

  const distributor = mapping.distributor as unknown as {
    id: string;
    name: string;
    region: string | null;
    state: string | null;
    country: string | null;
    website: string | null;
    is_active: boolean;
  };

  const locationParts = [distributor.region, distributor.state, distributor.country].filter(Boolean);

  return (
    <main className={styles.page}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.portalLabel}>Distributor Portal</span>
          {!distributor.is_active && (
            <span className={styles.inactiveBadge}>Inactive</span>
          )}
        </div>
        <h1 className={styles.distributorName}>{distributor.name}</h1>
        {locationParts.length > 0 && (
          <div className={styles.distributorSub}>
            {locationParts.join(' · ')}
            {distributor.website && (
              <>
                {' · '}
                <a
                  href={distributor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.websiteLink}
                >
                  {distributor.website.replace(/^https?:\/\//, '')}
                </a>
              </>
            )}
          </div>
        )}
        <div className={styles.headerRole}>
          Signed in as <strong>{user.email}</strong>
          {' · '}
          <span className={styles.roleBadge}>{mapping.role}</span>
        </div>
      </header>

      {/* ── Analytics scaffold (SCH-02 boundary) ────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Portfolio Analytics</h2>
        <div className={styles.pendingCard}>
          <div className={styles.pendingIcon} aria-hidden="true">⚙</div>
          <h3 className={styles.pendingTitle}>Analytics coming in the next release</h3>
          <p className={styles.pendingBody}>
            Portfolio placement data — SKU conversion rates, account coverage,
            and depletion reports — will appear here once the distributor
            product linkage migration (SCH-02) is complete.
          </p>
          <p className={styles.pendingBody}>
            If you need immediate visibility into your portfolio&apos;s performance,
            contact your Pour Advice account manager.
          </p>
        </div>
      </section>

      {/* ── Distributor details ───────────────────────────── */}
      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Your Account</h2>
        <dl className={styles.detailList}>
          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Distributor name</dt>
            <dd className={styles.detailValue}>{distributor.name}</dd>
          </div>
          {distributor.region && (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>Region</dt>
              <dd className={styles.detailValue}>{distributor.region}</dd>
            </div>
          )}
          {distributor.state && (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>State</dt>
              <dd className={styles.detailValue}>{distributor.state}</dd>
            </div>
          )}
          {distributor.country && (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>Country</dt>
              <dd className={styles.detailValue}>{distributor.country}</dd>
            </div>
          )}
          {distributor.website && (
            <div className={styles.detailRow}>
              <dt className={styles.detailLabel}>Website</dt>
              <dd className={styles.detailValue}>
                <a
                  href={distributor.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.websiteLink}
                >
                  {distributor.website}
                </a>
              </dd>
            </div>
          )}
          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Portal user</dt>
            <dd className={styles.detailValue}>{user.email}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt className={styles.detailLabel}>Access level</dt>
            <dd className={styles.detailValue}>
              <span className={styles.roleBadge}>{mapping.role}</span>
            </dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
