import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface DistributionRow {
  id: string;
  territory: string;
  product_id: string;
  product: {
    id: string;
    sku_number: string;
    wine_name: string;
    type: string | null;
    varietal: string | null;
    brand: { id: string; name: string } | { id: string; name: string }[] | null;
  } | null;
}

interface PlacementRow {
  id: string;
  product_id: string;
  outcome: string;
  buyer_feedback: string | null;
  created_at: string;
  recap: {
    visit_date: string;
    account: { name: string } | { name: string }[] | null;
  } | null;
}

export default async function DistributorPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ territory?: string }>;
}) {
  const { slug } = await params;
  const { territory: territoryFilter = '' } = await searchParams;
  const sb = await createClient();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect(`/login?redirect=/distributor/${slug}`);

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
        <p className={styles.forbiddenMsg}>You do not have access to this distributor portal.</p>
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

  const territoriesRes = await sb
    .from('product_distributions')
    .select('territory')
    .eq('distributor_id', slug)
    .eq('is_active', true)
    .order('territory');

  let distributionQuery = sb
    .from('product_distributions')
    .select(`
      id,
      territory,
      product_id,
      product:products(
        id,
        sku_number,
        wine_name,
        type,
        varietal,
        brand:brands(id, name)
      )
    `)
    .eq('distributor_id', slug)
    .eq('is_active', true)
    .order('territory')
    .order('created_at', { ascending: false });

  if (territoryFilter) distributionQuery = distributionQuery.eq('territory', territoryFilter);

  const { data: distributionsData } = await distributionQuery;
  const distributions = (distributionsData ?? []) as unknown as DistributionRow[];
  const territories = Array.from(new Set((territoriesRes.data ?? []).map((r) => r.territory as string).filter(Boolean)));

  const productIds = Array.from(new Set(distributions.map((d) => d.product_id).filter(Boolean)));

  const { data: placementsData } = productIds.length > 0
    ? await sb
        .from('recap_products')
        .select(`
          id,
          product_id,
          outcome,
          buyer_feedback,
          created_at,
          recap:recaps(
            visit_date,
            account:accounts(name)
          )
        `)
        .in('product_id', productIds)
        .order('created_at', { ascending: false })
        .limit(250)
    : { data: [] };

  const placements = (placementsData ?? []) as unknown as PlacementRow[];
  const placementsByProductId = new Map<string, PlacementRow[]>();
  for (const row of placements) {
    if (!placementsByProductId.has(row.product_id)) placementsByProductId.set(row.product_id, []);
    placementsByProductId.get(row.product_id)!.push(row);
  }

  const uniqueProductIds = new Set(distributions.map((d) => d.product_id));
  const totalSkus = uniqueProductIds.size;
  const totalPresentations = placements.length;
  const totalOrders = placements.filter((p) => p.outcome === 'Yes Today' || p.outcome === 'Menu Placement').length;
  const conversionRate = totalPresentations > 0 ? Math.round((totalOrders / totalPresentations) * 1000) / 10 : 0;

  const productsByBrand = new Map<string, Array<{
    distribution_id: string;
    territory: string;
    sku_number: string;
    wine_name: string;
    type: string | null;
    varietal: string | null;
    presentations: number;
    orders: number;
  }>>();

  for (const dist of distributions) {
    if (!dist.product) continue;
    const brand = Array.isArray(dist.product.brand) ? dist.product.brand[0] : dist.product.brand;
    const brandName = brand?.name ?? 'Unbranded';
    const productPlacements = placementsByProductId.get(dist.product_id) ?? [];
    const orders = productPlacements.filter((p) => p.outcome === 'Yes Today' || p.outcome === 'Menu Placement').length;
    if (!productsByBrand.has(brandName)) productsByBrand.set(brandName, []);
    productsByBrand.get(brandName)!.push({
      distribution_id: dist.id,
      territory: dist.territory,
      sku_number: dist.product.sku_number,
      wine_name: dist.product.wine_name,
      type: dist.product.type,
      varietal: dist.product.varietal,
      presentations: productPlacements.length,
      orders,
    });
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.portalLabel}>Distributor Portal</span>
          {!distributor.is_active && <span className={styles.inactiveBadge}>Inactive</span>}
        </div>
        <h1 className={styles.distributorName}>{distributor.name}</h1>
        <div className={styles.headerRole}>
          Signed in as <strong>{user.email}</strong> · <span className={styles.roleBadge}>{mapping.role}</span>
        </div>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeadRow}>
          <h2 className={styles.sectionHeading}>Portfolio Summary</h2>
          {territories.length > 1 && (
            <form className={styles.territoryFilter} method="GET">
              <label htmlFor="territory" className={styles.filterLabel}>Territory</label>
              <select id="territory" name="territory" defaultValue={territoryFilter} className={styles.filterSelect}>
                <option value="">All territories</option>
                {territories.map((territory) => (
                  <option key={territory} value={territory}>{territory}</option>
                ))}
              </select>
              <button type="submit" className={styles.filterBtn}>Apply</button>
            </form>
          )}
        </div>
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}><span className={styles.kpiValue}>{totalSkus}</span><span className={styles.kpiLabel}>SKUs</span></div>
          <div className={styles.kpiCard}><span className={styles.kpiValue}>{totalPresentations}</span><span className={styles.kpiLabel}>Presentations</span></div>
          <div className={styles.kpiCard}><span className={styles.kpiValue}>{totalOrders}</span><span className={styles.kpiLabel}>Orders</span></div>
          <div className={styles.kpiCard}><span className={styles.kpiValue}>{conversionRate}%</span><span className={styles.kpiLabel}>Conversion rate</span></div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Products by Brand</h2>
        {productsByBrand.size === 0 ? (
          <p className={styles.empty}>No distributed products available{territoryFilter ? ` for ${territoryFilter}` : ''}.</p>
        ) : (
          Array.from(productsByBrand.entries()).map(([brandName, rows]) => (
            <div key={brandName} className={styles.brandBlock}>
              <h3 className={styles.brandHeading}>{brandName}</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>SKU</th>
                      <th>Product</th>
                      <th>Territory</th>
                      <th>Type</th>
                      <th>Presentations</th>
                      <th>Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.distribution_id}>
                        <td>{row.sku_number}</td>
                        <td>{row.wine_name}</td>
                        <td>{row.territory}</td>
                        <td>{row.type ?? row.varietal ?? '—'}</td>
                        <td>{row.presentations}</td>
                        <td>{row.orders}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Placement Activity</h2>
        {placements.length === 0 ? (
          <p className={styles.empty}>No placement activity for the selected scope.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Outcome</th>
                  <th>Feedback</th>
                </tr>
              </thead>
              <tbody>
                {placements.map((row) => {
                  const account = Array.isArray(row.recap?.account) ? row.recap?.account[0] : row.recap?.account;
                  return (
                    <tr key={row.id}>
                      <td>{row.recap?.visit_date ?? row.created_at.slice(0, 10)}</td>
                      <td>{account?.name ?? '—'}</td>
                      <td>{row.outcome}</td>
                      <td>{row.buyer_feedback ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
