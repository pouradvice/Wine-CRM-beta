'use client';
// src/components/products/ProductsClient.tsx

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { upsertProduct, upsertBrand, archiveProduct, getProducts } from '@/lib/data';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type { Product, ProductInsert, WineType, Supplier } from '@/types';
import styles from './ProductsClient.module.css';

const WINE_TYPES = ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert', 'Spirit', 'Other'];

interface ProductsClientProps {
  initialProducts: Product[];
  totalCount: number;
  teamId: string;
}

interface ProductForm {
  sku_number:     string;
  wine_name:      string;
  brand_name:     string;
  supplier_id:    string;
  type:           string;
  varietal:       string;
  country:        string;
  region:         string;
  appellation:    string;
  vintage:        string;
  btg_cost:       string;
  three_cs_cost:  string;
  frontline_cost: string;
  distributor:    string;
  tech_sheet_url: string;
  notes:          string;
  is_active:      boolean;
}

interface AccountShownRow {
  account_id: string;
  account_name: string;
  visit_date: string;
  salesperson: string;
  outcome: string;
}

interface AccountNotShownRow {
  id: string;
  name: string;
  status: string;
}

interface ActiveAccountRow {
  account_id: string;
  account_name: string;
  value_tier: string | null;
  placement_date: string;
}

const emptyForm = (): ProductForm => ({
  sku_number:     '',
  wine_name:      '',
  brand_name:     '',
  supplier_id:    '',
  type:           '',
  varietal:       '',
  country:        '',
  region:         '',
  appellation:    '',
  vintage:        '',
  btg_cost:       '',
  three_cs_cost:  '',
  frontline_cost: '',
  distributor:    '',
  tech_sheet_url: '',
  notes:          '',
  is_active:      true,
});

function productToForm(p: Product): ProductForm {
  return {
    sku_number:     p.sku_number,
    wine_name:      p.wine_name,
    brand_name:     p.brand?.name ?? '',
    supplier_id:    p.supplier_id ?? p.brand?.supplier_id ?? '',
    type:           p.type ?? '',
    varietal:       p.varietal ?? '',
    country:        p.country ?? '',
    region:         p.region ?? '',
    appellation:    p.appellation ?? '',
    vintage:        p.vintage ?? '',
    btg_cost:       p.btg_cost != null ? String(p.btg_cost) : '',
    three_cs_cost:  p.three_cs_cost != null ? String(p.three_cs_cost) : '',
    frontline_cost: p.frontline_cost != null ? String(p.frontline_cost) : '',
    distributor:    p.distributor ?? '',
    tech_sheet_url: p.tech_sheet_url ?? '',
    notes:          p.notes ?? '',
    is_active:      p.is_active,
  };
}

function OutcomePill({ outcome }: { outcome: string }) {
  const cls =
    outcome === 'Yes Today'   ? styles.pillYesToday :
    outcome === 'Yes Later'   ? styles.pillYesLater :
    outcome === 'Maybe Later' ? styles.pillMaybe :
    outcome === 'No'          ? styles.pillNo :
    styles.pillDiscussed;
  return <span className={`${styles.outcomePill} ${cls}`}>{outcome}</span>;
}

type SlideoverMode = 'closed' | 'view' | 'edit' | 'add';
type ProductDetailTab = 'active' | 'shown' | 'not_shown';

const PAGE_SIZE = 25;

export function ProductsClient({ initialProducts, totalCount: initialTotal, teamId }: ProductsClientProps) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Suppliers list for the form dropdown
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([]);
  const brandDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch suppliers on mount — no is_active filter so name lookup always resolves
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const sb = createClient();
        const { data } = await sb.from('suppliers').select('id, name').order('name');
        setSuppliersList((data ?? []) as Supplier[]);
      } catch (err) {
        const e = err as { error?: string; message?: string };
        console.error('Failed to load suppliers:', e.error ?? e.message ?? err);
        setSuppliersList([]);
      }
    };
    fetchSuppliers();
  }, []);

  // Unified slideover state
  const [mode, setMode] = useState<SlideoverMode>('closed');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<ProductForm>>({});

  // Detail view state
  const [detailTab, setDetailTab] = useState<ProductDetailTab>('shown');
  const [accountsShown, setAccountsShown] = useState<AccountShownRow[]>([]);
  const [accountsNotShown, setAccountsNotShown] = useState<AccountNotShownRow[]>([]);
  const [activeAccounts, setActiveAccounts] = useState<ActiveAccountRow[]>([]);
  const [productDetailLoading, setProductDetailLoading] = useState(false);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchPage = useCallback(async (page: number) => {
    try {
      const sb = createClient();
      const result = await getProducts(sb, { page, pageSize: PAGE_SIZE, teamId });
      setProducts(result.data);
      setTotalCount(result.count);
      setCurrentPage(page);
    } catch {
      // Keep existing data on error
    }
  }, [teamId]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.wine_name.toLowerCase().includes(q) ||
        p.sku_number.toLowerCase().includes(q) ||
        (p.distributor ?? '').toLowerCase().includes(q);
      const matchType = !typeFilter || p.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [products, search, typeFilter]);

  const loadProductDetail = async (p: Product) => {
    setAccountsShown([]);
    setAccountsNotShown([]);
    setActiveAccounts([]);
    setProductDetailLoading(true);
    try {
      const sb = createClient();

      const { data: rpData } = await sb
        .from('recap_products')
        .select(`
          outcome,
          menu_placement,
          recap:recaps (
            id,
            visit_date,
            salesperson,
            account:accounts ( id, name, value_tier )
          )
        `)
        .eq('product_id', p.id)
        .limit(200);

      const { data: allAccounts } = await sb
        .from('accounts')
        .select('id, name, status')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .in('status', ['Active', 'Prospective'])
        .order('name');

      type RawRpData = {
        outcome: string;
        menu_placement: boolean;
        recap: {
          id: string;
          visit_date: string;
          salesperson: string;
          account: { id: string; name: string; value_tier: string | null } | null;
        } | null;
      };

      const shownRows: AccountShownRow[] = [];
      const shownAccountIds = new Set<string>();
      // Track most recent placement date per account (data may be unordered)
      const activeAccountMap = new Map<string, ActiveAccountRow>();

      for (const rp of (rpData ?? []) as unknown as RawRpData[]) {
        if (!rp.recap?.account) continue;
        shownRows.push({
          account_id: rp.recap.account.id,
          account_name: rp.recap.account.name,
          visit_date: rp.recap.visit_date,
          salesperson: rp.recap.salesperson,
          outcome: rp.outcome,
        });
        shownAccountIds.add(rp.recap.account.id);

        // Track active placements — keep the most recent placement_date per account
        // A placement is active if menu_placement is true OR outcome is 'Yes Today'
        if (rp.menu_placement || rp.outcome === 'Yes Today') {
          const existing = activeAccountMap.get(rp.recap.account.id);
          if (!existing || rp.recap.visit_date > existing.placement_date) {
            activeAccountMap.set(rp.recap.account.id, {
              account_id: rp.recap.account.id,
              account_name: rp.recap.account.name,
              value_tier: rp.recap.account.value_tier,
              placement_date: rp.recap.visit_date,
            });
          }
        }
      }

      // Also include accounts where the product was manually added as an active SKU
      type RawSkuData = {
        account_id: string;
        created_at: string;
        account: { id: string; name: string; value_tier: string | null } | null;
      };

      const { data: skuRows } = await sb
        .from('account_skus')
        .select('account_id, created_at, account:accounts(id, name, value_tier)')
        .eq('product_id', p.id);

      for (const sku of (skuRows ?? []) as unknown as RawSkuData[]) {
        if (!sku.account) continue;
        const placementDate = sku.created_at ? sku.created_at.slice(0, 10) : '';
        const existing = activeAccountMap.get(sku.account_id);
        if (!existing || placementDate > existing.placement_date) {
          activeAccountMap.set(sku.account_id, {
            account_id: sku.account.id,
            account_name: sku.account.name,
            value_tier: sku.account.value_tier,
            placement_date: placementDate,
          });
        }
      }

      shownRows.sort((a, b) => b.visit_date.localeCompare(a.visit_date));

      const notShown = (allAccounts ?? []).filter((a) => !shownAccountIds.has(a.id));

      const active = Array.from(activeAccountMap.values());
      active.sort((a, b) => b.placement_date.localeCompare(a.placement_date));

      setAccountsShown(shownRows);
      setAccountsNotShown(notShown as AccountNotShownRow[]);
      setActiveAccounts(active);
    } catch {
      setAccountsShown([]);
      setAccountsNotShown([]);
      setActiveAccounts([]);
    } finally {
      setProductDetailLoading(false);
    }
  };

  const openView = (p: Product) => {
    setActiveProduct(p);
    setMode('view');
    setDetailTab('shown');
    loadProductDetail(p);
  };

  const openAdd = () => {
    setActiveProduct(null);
    setForm(emptyForm());
    setErrors({});
    setSaveError(null);
    setMode('add');
  };

  const openEdit = (p: Product) => {
    setActiveProduct(p);
    setForm(productToForm(p));
    setErrors({});
    setSaveError(null);
    setMode('edit');
  };

  const closeSlide = () => setMode('closed');

  const validate = (): boolean => {
    const errs: Partial<ProductForm> = {};
    if (!form.sku_number.trim()) errs.sku_number = 'SKU is required';
    if (!form.wine_name.trim()) errs.wine_name = 'Wine name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    if (!confirm('Save changes to this product?')) return;
    setSaving(true);
    setSaveError(null);

    const sb = createClient();
    try {
      let brandId: string | null = null;
      let brandSupplierId: string | null = null;

      if (form.brand_name.trim()) {
        const { data: existing } = await sb
          .from('brands')
          .select('id, supplier_id')
          .eq('name', form.brand_name.trim())
          .eq('team_id', teamId)
          .maybeSingle();

        if (existing) {
          brandId = existing.id as string;
          brandSupplierId = existing.supplier_id as string | null;
        } else {
          const newBrand = await upsertBrand(sb, {
            name:        form.brand_name.trim(),
            team_id:     teamId,
            is_active:   true,
            supplier_id: form.supplier_id || null,
            description: null,
            country:     null,
            region:      null,
            website:     null,
            notes:       null,
          });
          brandId = newBrand.id;
          brandSupplierId = form.supplier_id || null;
        }
      }

      // Use the explicitly selected supplier_id, falling back to brand's supplier
      const resolvedSupplierId = form.supplier_id || brandSupplierId || null;

      const payload: ProductInsert & { id?: string } = {
        sku_number:     form.sku_number.trim(),
        wine_name:      form.wine_name.trim(),
        brand_id:       brandId,
        team_id:        teamId,
        type:           (form.type as WineType) || null,
        varietal:       form.varietal || null,
        country:        form.country || null,
        region:         form.region || null,
        appellation:    form.appellation || null,
        vintage:        form.vintage || null,
        btg_cost:       form.btg_cost ? Number(form.btg_cost) : null,
        three_cs_cost:  form.three_cs_cost ? Number(form.three_cs_cost) : null,
        frontline_cost: form.frontline_cost ? Number(form.frontline_cost) : null,
        distributor:    form.distributor || null,
        tech_sheet_url: form.tech_sheet_url || null,
        notes:          form.notes || null,
        supplier_id:    resolvedSupplierId,
        description:    null,
        tasting_notes:  null,
        is_active:      form.is_active,
        ...(activeProduct ? { id: activeProduct.id } : {}),
      };

      const saved = await upsertProduct(sb, payload);

      if (activeProduct) {
        setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        setProducts((prev) => [saved, ...prev]);
      }

      setMode('closed');
      router.refresh();
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setSaveError(e.error ?? e.message ?? 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!activeProduct) return;
    if (!confirm(`Archive "${activeProduct.wine_name}"? It will no longer appear in recap searches.`)) return;
    const sb = createClient();
    try {
      await archiveProduct(sb, activeProduct.id);
      setProducts((prev) => prev.filter((x) => x.id !== activeProduct.id));
      setMode('closed');
    } catch {
      alert('Failed to archive product. Please try again.');
    }
  };

  const setField = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  // When brand_name changes, debounce and auto-populate supplier from matching brand
  const handleBrandChange = (brandName: string) => {
    setField('brand_name', brandName);
    if (brandDebounceRef.current) clearTimeout(brandDebounceRef.current);
    if (!brandName.trim()) return;
    brandDebounceRef.current = setTimeout(async () => {
      try {
        const sb = createClient();
        const { data } = await sb
          .from('brands')
          .select('supplier_id')
          .eq('name', brandName.trim())
          .eq('team_id', teamId)
          .maybeSingle();
        if (data?.supplier_id) {
          setForm((f) => ({ ...f, supplier_id: f.supplier_id || data.supplier_id }));
        }
      } catch { /* ignore */ }
    }, 500);
  };

  const originParts = activeProduct
    ? [activeProduct.country, activeProduct.region, activeProduct.appellation].filter(Boolean)
    : [];

  const slideoverOpen = mode !== 'closed';
  const slideoverTitle =
    mode === 'add' ? 'Add Product' :
    mode === 'edit' ? 'Edit Product' :
    activeProduct?.wine_name ?? 'Product';

  return (
    <>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Products</h1>
        <div className={styles.headerActions}>
          <Link href="/app/crm/onboarding/import" className={styles.importLink}>
            Import from CSV
          </Link>
          <Button variant="primary" onClick={openAdd}>
            Add Product
          </Button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by name, SKU, or distributor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.filterSelect}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          {WINE_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>
            {search || typeFilter ? 'No products match your filters' : 'No products yet'}
          </p>
          <p className={styles.emptyDesc}>
            {search || typeFilter
              ? 'Try adjusting your search or filter.'
              : 'Add your first wine, spirit, or product to start tracking sales recaps.'}
          </p>
          {!search && !typeFilter && (
            <div className={styles.emptyActions}>
              <Button variant="primary" onClick={openAdd}>Add Product</Button>
              <Link href="/app/crm/onboarding/import" className={styles.importLink}>
                Import from CSV →
              </Link>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Wine Name</th>
                  <th>Type</th>
                  <th>Supplier</th>
                  <th>Brand / Distributor</th>
                  <th>BTG Cost</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={styles.tableRow}
                    onClick={() => openView(p)}
                  >
                    <td className={styles.skuCell}>{p.sku_number}</td>
                    <td className={styles.wineNameCell}>{p.wine_name}</td>
                    <td>{p.type ?? '—'}</td>
                    <td>{p.brand?.supplier?.name ?? p.supplier?.name ?? suppliersList.find(s => s.id === (p.supplier_id ?? p.brand?.supplier_id))?.name ?? '—'}</td>
                    <td>{p.distributor ?? p.brand?.name ?? '—'}</td>
                    <td>{p.btg_cost != null ? `$${p.btg_cost.toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <span className={styles.pageInfo}>
                {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} of {totalCount}
              </span>
              <div className={styles.pageButtons}>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => fetchPage(currentPage - 1)}
                  disabled={currentPage === 0}
                >
                  ← Previous
                </button>
                <span className={styles.pageCurrent}>
                  Page {currentPage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  onClick={() => fetchPage(currentPage + 1)}
                  disabled={currentPage >= totalPages - 1}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Unified slideover ─────────────────────────────────────── */}
      <Slideover
        open={slideoverOpen}
        onClose={closeSlide}
        title={slideoverTitle}
        footer={
          mode === 'view' ? (
            <>
              <Button variant="secondary" onClick={closeSlide}>Close</Button>
              <Button variant="danger" onClick={handleArchive}>Archive</Button>
              <Button variant="primary" onClick={() => activeProduct && openEdit(activeProduct)}>Edit</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={mode === 'edit' ? () => activeProduct && openView(activeProduct) : closeSlide} disabled={saving}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
            </>
          )
        }
      >
        {mode === 'view' && activeProduct ? (
          <>
            {/* ── Product Info Card ─────────────────────────────────── */}
            <div className={styles.infoCard}>
              <div className={styles.infoCardBadges}>
                <span className={styles.skuBadge}>{activeProduct.sku_number}</span>
                {activeProduct.type && (
                  <span className={styles.typeBadge}>{activeProduct.type}</span>
                )}
                {!activeProduct.is_active && (
                  <span className={styles.archivedBadge}>Archived</span>
                )}
              </div>
              <div className={styles.infoCardGrid}>
                {(activeProduct.brand?.supplier?.name || activeProduct.supplier?.name || activeProduct.supplier_id || activeProduct.brand?.supplier_id) && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Supplier</span>
                    <span>{activeProduct.brand?.supplier?.name ?? activeProduct.supplier?.name ?? suppliersList.find(s => s.id === (activeProduct.supplier_id ?? activeProduct.brand?.supplier_id))?.name}</span>
                  </div>
                )}
                {activeProduct.brand?.name && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Brand</span>
                    <span>{activeProduct.brand.name}</span>
                  </div>
                )}
                {activeProduct.varietal && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Varietal</span>
                    <span>{activeProduct.varietal}</span>
                  </div>
                )}
                {activeProduct.vintage && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Vintage</span>
                    <span>{activeProduct.vintage}</span>
                  </div>
                )}
                {originParts.length > 0 && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Origin</span>
                    <span>{originParts.join(' · ')}</span>
                  </div>
                )}
                {activeProduct.distributor && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Distributor</span>
                    <span>{activeProduct.distributor}</span>
                  </div>
                )}
                {(activeProduct.btg_cost != null || activeProduct.three_cs_cost != null || activeProduct.frontline_cost != null) && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Costs</span>
                    <span className={styles.costsRow}>
                      {activeProduct.btg_cost != null && (
                        <span>BTG <strong>${activeProduct.btg_cost.toFixed(2)}</strong></span>
                      )}
                      {activeProduct.three_cs_cost != null && (
                        <span>3-Case <strong>${activeProduct.three_cs_cost.toFixed(2)}</strong></span>
                      )}
                      {activeProduct.frontline_cost != null && (
                        <span>FL <strong>${activeProduct.frontline_cost.toFixed(2)}</strong></span>
                      )}
                    </span>
                  </div>
                )}
                {activeProduct.tech_sheet_url && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Tech Sheet</span>
                    <a href={activeProduct.tech_sheet_url} target="_blank" rel="noopener noreferrer" className={styles.detailLink}>
                      View →
                    </a>
                  </div>
                )}
                {activeProduct.notes && (
                  <div className={`${styles.infoCardRow} ${styles.infoCardRowFull}`}>
                    <span className={styles.infoCardLabel}>Notes</span>
                    <span>{activeProduct.notes}</span>
                  </div>
                )}
                {!productDetailLoading && activeAccounts.length > 0 && (
                  <div className={styles.infoCardRow}>
                    <span className={styles.infoCardLabel}>Placed at</span>
                    <span className={styles.dossierStat}>
                      {activeAccounts.length} active account{activeAccounts.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Tab bar ──────────────────────────────────────────── */}
            <div className={styles.slideTabs}>
              <button
                type="button"
                className={`${styles.slideTab} ${detailTab === 'active' ? styles.slideTabActive : ''}`}
                onClick={() => setDetailTab('active')}
              >
                Active Accounts
                {!productDetailLoading && activeAccounts.length > 0 && (
                  <span className={styles.tabCount}>{activeAccounts.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`${styles.slideTab} ${detailTab === 'shown' ? styles.slideTabActive : ''}`}
                onClick={() => setDetailTab('shown')}
              >
                Accounts Shown
                {!productDetailLoading && accountsShown.length > 0 && (
                  <span className={styles.tabCount}>{accountsShown.length}</span>
                )}
              </button>
              <button
                type="button"
                className={`${styles.slideTab} ${detailTab === 'not_shown' ? styles.slideTabActive : ''}`}
                onClick={() => setDetailTab('not_shown')}
              >
                Not Yet Shown
                {!productDetailLoading && accountsNotShown.length > 0 && (
                  <span className={styles.tabCount}>{accountsNotShown.length}</span>
                )}
              </button>
            </div>

            {/* ── Tab content ──────────────────────────────────────── */}
            {productDetailLoading ? (
              <p className={styles.detailEmpty}>Loading…</p>
            ) : detailTab === 'active' ? (
              activeAccounts.length === 0 ? (
                <p className={styles.detailEmpty}>No active placements recorded for this product.</p>
              ) : (
                <ul className={styles.activeAccountList}>
                  {activeAccounts.map((a) => (
                    <li key={a.account_id} className={styles.activeAccountRow}>
                      <div className={styles.activeAccountInfo}>
                        <span className={styles.activeAccountName}>{a.account_name}</span>
                        <span className={styles.activeAccountMeta}>Placed {a.placement_date}</span>
                      </div>
                      {a.value_tier && (
                        <span className={`${styles.tierBadge} ${
                          a.value_tier === 'A' ? styles.tierA :
                          a.value_tier === 'B' ? styles.tierB :
                          styles.tierC
                        }`}>{a.value_tier}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : detailTab === 'shown' ? (
              accountsShown.length === 0 ? (
                <p className={styles.detailEmpty}>This product hasn't been shown to any accounts yet.</p>
              ) : (
                <ul className={styles.accountShownList}>
                  {accountsShown.map((a, i) => (
                    <li key={i} className={styles.accountShownRow}>
                      <div className={styles.accountShownInfo}>
                        <span className={styles.accountShownName}>{a.account_name}</span>
                        <span className={styles.accountShownMeta}>{a.visit_date} · {a.salesperson}</span>
                      </div>
                      <OutcomePill outcome={a.outcome} />
                    </li>
                  ))}
                </ul>
              )
            ) : (
              accountsNotShown.length === 0 ? (
                <p className={styles.detailEmpty}>This product has been shown to all active accounts.</p>
              ) : (
                <ul className={styles.accountNotShownList}>
                  {accountsNotShown.map((a) => (
                    <li key={a.id} className={styles.accountNotShownRow}>
                      <span className={styles.accountNotShownName}>{a.name}</span>
                      <span className={styles.accountNotShownStatus}>{a.status}</span>
                    </li>
                  ))}
                </ul>
              )
            )}
          </>
        ) : (mode === 'edit' || mode === 'add') ? (
          <div className={styles.formGrid}>
            <div className={styles.formField}>
              <label className={styles.formLabel}>
                SKU Number <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.formInput}
                value={form.sku_number}
                onChange={(e) => setField('sku_number', e.target.value)}
                placeholder="e.g. 10042"
              />
              {errors.sku_number && <span className={styles.formError}>{errors.sku_number}</span>}
            </div>

            <div className={`${styles.formField} ${styles.formGridFull}`}>
              <label className={styles.formLabel}>
                Wine Name <span className={styles.required}>*</span>
              </label>
              <input
                className={styles.formInput}
                value={form.wine_name}
                onChange={(e) => setField('wine_name', e.target.value)}
                placeholder="e.g. Château Margaux 2019"
              />
              {errors.wine_name && <span className={styles.formError}>{errors.wine_name}</span>}
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Brand</label>
              <input
                className={styles.formInput}
                value={form.brand_name}
                onChange={(e) => handleBrandChange(e.target.value)}
                placeholder="Brand / supplier"
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Supplier</label>
              <select
                className={styles.formSelect}
                value={form.supplier_id}
                onChange={(e) => setField('supplier_id', e.target.value)}
              >
                <option value="">No supplier</option>
                {suppliersList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Type</label>
              <select
                className={styles.formSelect}
                value={form.type}
                onChange={(e) => setField('type', e.target.value)}
              >
                <option value="">Select type…</option>
                {WINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Varietal</label>
              <input className={styles.formInput} value={form.varietal} onChange={(e) => setField('varietal', e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Vintage</label>
              <input className={styles.formInput} value={form.vintage} onChange={(e) => setField('vintage', e.target.value)} placeholder="e.g. 2021" />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Country</label>
              <input className={styles.formInput} value={form.country} onChange={(e) => setField('country', e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Region</label>
              <input className={styles.formInput} value={form.region} onChange={(e) => setField('region', e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Appellation</label>
              <input className={styles.formInput} value={form.appellation} onChange={(e) => setField('appellation', e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Distributor</label>
              <input className={styles.formInput} value={form.distributor} onChange={(e) => setField('distributor', e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>BTG Cost ($)</label>
              <input type="number" step="0.01" className={styles.formInput} value={form.btg_cost} onChange={(e) => setField('btg_cost', e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>3-Case Cost ($)</label>
              <input type="number" step="0.01" className={styles.formInput} value={form.three_cs_cost} onChange={(e) => setField('three_cs_cost', e.target.value)} />
            </div>

            <div className={styles.formField}>
              <label className={styles.formLabel}>Frontline Cost ($)</label>
              <input type="number" step="0.01" className={styles.formInput} value={form.frontline_cost} onChange={(e) => setField('frontline_cost', e.target.value)} />
            </div>

            <div className={`${styles.formField} ${styles.formGridFull}`}>
              <label className={styles.formLabel}>Tech Sheet URL</label>
              <input type="url" className={styles.formInput} value={form.tech_sheet_url} onChange={(e) => setField('tech_sheet_url', e.target.value)} placeholder="https://…" />
            </div>

            <div className={`${styles.formField} ${styles.formGridFull}`}>
              <label className={styles.formLabel}>Notes</label>
              <textarea className={styles.formTextarea} value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} />
            </div>

            <div className={styles.toggleRow}>
              <input
                type="checkbox"
                id="product-active"
                checked={form.is_active}
                onChange={(e) => setField('is_active', e.target.checked)}
              />
              <label htmlFor="product-active" className={styles.toggleLabel}>Active</label>
            </div>

            {saveError && <p className={`${styles.saveError} ${styles.formGridFull}`}>{saveError}</p>}
          </div>
        ) : null}
      </Slideover>
    </>
  );
}
