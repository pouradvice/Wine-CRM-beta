import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { isOrderOutcome } from '@/lib/outcomes';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface SupplierPortalProduct {
  id: string;
  wine_name: string;
  sku_number: string;
  type: string | null;
  varietal: string | null;
  brand: { name: string } | { name: string }[] | null;
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

interface DistributionRow {
  territory: string;
  distributor: { id: string; name: string } | { id: string; name: string }[] | null;
  product: { id: string; brand: { name: string } | { name: string }[] | null } | { id: string; brand: { name: string } | { name: string }[] | null }[] | null;
}

const OUTCOME_LABELS: Record<string, string> = {
  'Yes Today': 'Order',
  'Yes Later': 'Follow-up',
  'Maybe Later': 'Maybe',
  'No': 'No',
  'Discussed': 'Discussed',
  'Menu Placement': 'Menu',
};

const OUTCOME_CLASS: Record<string, string> = {
  'Yes Today': styles.outcomeOrder,
  'Yes Later': styles.outcomeYes,
  'Maybe Later': styles.outcomeMaybe,
  No: styles.outcomeNo,
  Discussed: styles.outcomeDiscussed,
  'Menu Placement': styles.outcomeMenu,
};

export default async function SupplierPortalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sb = await createClient();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?redirect=/supplier/${slug}`);

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
        <p className={styles.forbiddenMsg}>You do not have access to this supplier portal.</p>
      </main>
    );
  }

  const supplier = mapping.supplier as unknown as {
    id: string;
    name: string;
    country: string | null;
    region: string | null;
    website: string | null;
    is_active: boolean;
  };

  const [productsRes, placementsRes, outcomesRes, followUpsRes] = await Promise.all([
    sb
      .from('products')
      .select('id, wine_name, sku_number, type, varietal, brand:brands(name)')
      .eq('supplier_id', slug)
      .eq('is_active', true)
      .order('wine_name'),
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
    sb
      .from('recap_products')
      .select('outcome, product_id')
      .eq('supplier_id', slug),
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

  const products = (productsRes.data ?? []) as unknown as SupplierPortalProduct[];
  const placements = (placementsRes.data ?? []) as unknown as PlacementRow[];
  const allOutcomes = outcomesRes.data ?? [];
  const followUps = (followUpsRes.data ?? []) as unknown as FollowUpRow[];

  const productIds = products.map((p) => p.id);
  const { data: distributionsData } = productIds.length > 0
    ? await sb
        .from('product_distributions')
        .select(`
          territory,
          distributor:distributors(id, name),
          product:products(id, brand:brands(name))
        `)
        .eq('is_active', true)
        .in('product_id', productIds)
    : { data: [] };
  const distributions = (distributionsData ?? []) as unknown as DistributionRow[];

  const outcomeCounts = allOutcomes.reduce<Record<string, number>>((acc, row) => {
    const outcome = (row as { outcome: string }).outcome;
    acc[outcome] = (acc[outcome] ?? 0) + 1;
    return acc;
  }, {});

  const recapByProduct = new Map<string, { placements: number; orders: number }>();
  for (const row of allOutcomes) {
    const productId = (row as { product_id: string }).product_id;
    if (!recapByProduct.has(productId)) recapByProduct.set(productId, { placements: 0, orders: 0 });
    const stats = recapByProduct.get(productId)!;
    stats.placements += 1;
    const outcome = (row as { outcome: string }).outcome;
    if (isOrderOutcome(outcome, true)) stats.orders += 1;
  }

  const byDistributor = new Map<string, {
    distributor_name: string;
    placements: number;
    orders: number;
    productIds: Set<string>;
    territories: Set<string>;
  }>();
  const byTerritory = new Map<string, {
    placements: number;
    orders: number;
    distributorIds: Set<string>;
    productIds: Set<string>;
  }>();
  const matrix = new Map<string, {
    brand: string;
    distributor: string;
    territory: string;
    placements: number;
    orders: number;
  }>();

  for (const dist of distributions) {
    const distributor = Array.isArray(dist.distributor) ? dist.distributor[0] : dist.distributor;
    const product = Array.isArray(dist.product) ? dist.product[0] : dist.product;
    if (!distributor || !product) continue;
    const brand = Array.isArray(product.brand) ? product.brand[0] : product.brand;
    const recapStats = recapByProduct.get(product.id) ?? { placements: 0, orders: 0 };

    if (!byDistributor.has(distributor.id)) {
      byDistributor.set(distributor.id, {
        distributor_name: distributor.name,
        placements: 0,
        orders: 0,
        productIds: new Set(),
        territories: new Set(),
      });
    }
    const dRow = byDistributor.get(distributor.id)!;
    dRow.placements += recapStats.placements;
    dRow.orders += recapStats.orders;
    dRow.productIds.add(product.id);
    dRow.territories.add(dist.territory);

    if (!byTerritory.has(dist.territory)) {
      byTerritory.set(dist.territory, {
        placements: 0,
        orders: 0,
        distributorIds: new Set(),
        productIds: new Set(),
      });
    }
    const tRow = byTerritory.get(dist.territory)!;
    tRow.placements += recapStats.placements;
    tRow.orders += recapStats.orders;
    tRow.distributorIds.add(distributor.id);
    tRow.productIds.add(product.id);

    const matrixKey = [
      encodeURIComponent(brand?.name ?? 'Unbranded'),
      distributor.id,
      encodeURIComponent(dist.territory),
    ].join('::');
    if (!matrix.has(matrixKey)) {
      matrix.set(matrixKey, {
        brand: brand?.name ?? 'Unbranded',
        distributor: distributor.name,
        territory: dist.territory,
        placements: 0,
        orders: 0,
      });
    }
    const mRow = matrix.get(matrixKey)!;
    mRow.placements += recapStats.placements;
    mRow.orders += recapStats.orders;
  }

  const totalPlacements = allOutcomes.length;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.portalLabel}>Supplier Portal</span>
          {!supplier.is_active && <span className={styles.inactiveBadge}>Inactive</span>}
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
          Signed in as <strong>{user.email}</strong> · <span className={styles.roleBadge}>{mapping.role}</span>
        </div>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Placement Activity</h2>
        <div className={styles.summaryStrip}>
          <div className={styles.summaryCell}><span className={styles.summaryValue}>{totalPlacements}</span><span className={styles.summaryLabel}>Total presentations</span></div>
          <div className={styles.summaryCell}><span className={`${styles.summaryValue} ${styles.valueOrder}`}>{(outcomeCounts['Yes Today'] ?? 0) + (outcomeCounts['Menu Placement'] ?? 0)}</span><span className={styles.summaryLabel}>Orders + menu placements</span></div>
          <div className={styles.summaryCell}><span className={`${styles.summaryValue} ${styles.valueYes}`}>{outcomeCounts['Yes Later'] ?? 0}</span><span className={styles.summaryLabel}>Pending follow-ups</span></div>
          <div className={styles.summaryCell}><span className={styles.summaryValue}>{products.length}</span><span className={styles.summaryLabel}>Active SKUs</span></div>
          <div className={styles.summaryCell}><span className={`${styles.summaryValue} ${styles.valuePipeline}`}>{followUps.length}</span><span className={styles.summaryLabel}>Open follow-ups</span></div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>By Distributor</h2>
        {byDistributor.size === 0 ? (
          <p className={styles.empty}>No distributor assignments yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Distributor</th>
                  <th>Territories</th>
                  <th>SKUs</th>
                  <th>Presentations</th>
                  <th>Orders</th>
                  <th>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byDistributor.values()).map((row) => {
                  const conversion = row.placements > 0 ? Math.round((row.orders / row.placements) * 1000) / 10 : 0;
                  return (
                    <tr key={row.distributor_name}>
                      <td>{row.distributor_name}</td>
                      <td>{row.territories.size}</td>
                      <td>{row.productIds.size}</td>
                      <td>{row.placements}</td>
                      <td>{row.orders}</td>
                      <td>{conversion}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>By Territory</h2>
        {byTerritory.size === 0 ? (
          <p className={styles.empty}>No territory assignments yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Territory</th>
                  <th>Distributors</th>
                  <th>SKUs</th>
                  <th>Presentations</th>
                  <th>Orders</th>
                  <th>Conversion</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(byTerritory.entries()).map(([territory, row]) => {
                  const conversion = row.placements > 0 ? Math.round((row.orders / row.placements) * 1000) / 10 : 0;
                  return (
                    <tr key={territory}>
                      <td>{territory}</td>
                      <td>{row.distributorIds.size}</td>
                      <td>{row.productIds.size}</td>
                      <td>{row.placements}</td>
                      <td>{row.orders}</td>
                      <td>{conversion}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Distribution Matrix</h2>
        {matrix.size === 0 ? (
          <p className={styles.empty}>No matrix rows yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Distributor</th>
                  <th>Territory</th>
                  <th>Placements</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(matrix.values()).map((row) => (
                  <tr key={`${row.brand}-${row.distributor}-${row.territory}`}>
                    <td>{row.brand}</td>
                    <td>{row.distributor}</td>
                    <td>{row.territory}</td>
                    <td>{row.placements}</td>
                    <td>{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
                          <span className={styles.accountLocation}>{[row.recap.account.city, row.recap.account.state].filter(Boolean).join(', ')}</span>
                        </>
                      ) : '—'}
                    </td>
                    <td><span className={`${styles.outcomePill} ${OUTCOME_CLASS[row.outcome] ?? ''}`}>{OUTCOME_LABELS[row.outcome] ?? row.outcome}</span></td>
                    <td className={styles.dateCell}>
                      {row.recap?.visit_date
                        ? new Date(row.recap.visit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td className={styles.feedbackCell}>{row.buyer_feedback ?? <span className={styles.noFeedback}>—</span>}</td>
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
