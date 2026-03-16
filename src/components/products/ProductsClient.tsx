'use client';
// src/components/products/ProductsClient.tsx

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { upsertProduct, upsertBrand, archiveProduct, getProducts } from '@/lib/data';
import { Slideover } from '@/components/ui/Slideover';
import { Button } from '@/components/ui/Button';
import type { Product, ProductInsert, WineType } from '@/types';
import styles from './ProductsClient.module.css';

const WINE_TYPES = ['Red', 'White', 'Rosé', 'Sparkling', 'Dessert', 'Spirit', 'Other'];

interface ProductsClientProps {
  initialProducts: Product[];
  totalCount: number;
  teamId: string;
}

interface ProductForm {
  sku_number: string;
  wine_name: string;
  brand_name: string;
  type: string;
  varietal: string;
  country: string;
  region: string;
  appellation: string;
  vintage: string;
  btg_cost: string;
  three_cs_cost: string;
  frontline_cost: string;
  distributor: string;
  tech_sheet_url: string;
  notes: string;
  is_active: boolean;
}

const emptyForm = (): ProductForm => ({
  sku_number: '',
  wine_name: '',
  brand_name: '',
  type: '',
  varietal: '',
  country: '',
  region: '',
  appellation: '',
  vintage: '',
  btg_cost: '',
  three_cs_cost: '',
  frontline_cost: '',
  distributor: '',
  tech_sheet_url: '',
  notes: '',
  is_active: true,
});

function productToForm(p: Product): ProductForm {
  return {
    sku_number: p.sku_number,
    wine_name: p.wine_name,
    brand_name: p.brand?.name ?? '',
    type: p.type ?? '',
    varietal: p.varietal ?? '',
    country: p.country ?? '',
    region: p.region ?? '',
    appellation: p.appellation ?? '',
    vintage: p.vintage ?? '',
    btg_cost: p.btg_cost != null ? String(p.btg_cost) : '',
    three_cs_cost: p.three_cs_cost != null ? String(p.three_cs_cost) : '',
    frontline_cost: p.frontline_cost != null ? String(p.frontline_cost) : '',
    distributor: p.distributor ?? '',
    tech_sheet_url: p.tech_sheet_url ?? '',
    notes: p.notes ?? '',
    is_active: p.is_active,
  };
}

const PAGE_SIZE = 25;

export function ProductsClient({ initialProducts, totalCount: initialTotal, teamId }: ProductsClientProps) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [currentPage, setCurrentPage] = useState(0);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [slideoverOpen, setSlideoverOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<ProductForm>>({});

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const fetchPage = useCallback(async (page: number) => {
    try {
      const sb = createClient();
      const result = await getProducts(sb, { page, pageSize: PAGE_SIZE });
      setProducts(result.data);
      setTotalCount(result.count);
      setCurrentPage(page);
    } catch {
      // Keep existing data on error
    }
  }, []);

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

  const openAdd = () => {
    setEditingProduct(null);
    setForm(emptyForm());
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm(productToForm(p));
    setErrors({});
    setSaveError(null);
    setSlideoverOpen(true);
  };

  const closeSlide = () => setSlideoverOpen(false);

  const validate = (): boolean => {
    const errs: Partial<ProductForm> = {};
    if (!form.sku_number.trim()) errs.sku_number = 'SKU is required';
    if (!form.wine_name.trim()) errs.wine_name = 'Wine name is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setSaveError(null);

    const sb = createClient();
    try {
      // Resolve brand: find existing by name+team or create a new one
      let brandId: string | null = null;
      if (form.brand_name.trim()) {
        const { data: existing } = await sb
          .from('brands')
          .select('id')
          .eq('name', form.brand_name.trim())
          .eq('team_id', teamId)
          .maybeSingle();

        if (existing) {
          brandId = existing.id as string;
        } else {
          const newBrand = await upsertBrand(sb, {
            name: form.brand_name.trim(),
            team_id: teamId,
            is_active: true,
            supplier_id: null,
            description: null,
            country: null,
            region: null,
            website: null,
            notes: null,
          });
          brandId = newBrand.id;
        }
      }

      const payload: ProductInsert & { id?: string } = {
        sku_number: form.sku_number.trim(),
        wine_name: form.wine_name.trim(),
        brand_id: brandId,
        team_id: teamId,
        type: (form.type as WineType) || null,
        varietal: form.varietal || null,
        country: form.country || null,
        region: form.region || null,
        appellation: form.appellation || null,
        vintage: form.vintage || null,
        btg_cost: form.btg_cost ? Number(form.btg_cost) : null,
        three_cs_cost: form.three_cs_cost ? Number(form.three_cs_cost) : null,
        frontline_cost: form.frontline_cost ? Number(form.frontline_cost) : null,
        distributor: form.distributor || null,
        tech_sheet_url: form.tech_sheet_url || null,
        notes: form.notes || null,
        supplier_id: null,
        description: null,
        tasting_notes: null,
        is_active: form.is_active,
        ...(editingProduct ? { id: editingProduct.id } : {}),
      };

      const saved = await upsertProduct(sb, payload);

      if (editingProduct) {
        setProducts((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      } else {
        setProducts((prev) => [saved, ...prev]);
      }

      setSlideoverOpen(false);
      router.refresh();
    } catch (err) {
      const e = err as { error?: string; message?: string };
      setSaveError(e.error ?? e.message ?? 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (e: React.MouseEvent, p: Product) => {
    e.stopPropagation();
    if (!confirm(`Archive "${p.wine_name}"? It will no longer appear in lists.`)) return;
    const sb = createClient();
    try {
      await archiveProduct(sb, p.id);
      setProducts((prev) => prev.filter((x) => x.id !== p.id));
    } catch {
      alert('Failed to archive product. Please try again.');
    }
  };

  const setField = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

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
          <table className={styles.table}>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Wine Name</th>
                <th>Type</th>
                <th>Brand / Distributor</th>
                <th>BTG Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  className={styles.tableRow}
                  onClick={() => openEdit(p)}
                >
                  <td className={styles.skuCell}>{p.sku_number}</td>
                  <td className={styles.wineNameCell}>{p.wine_name}</td>
                  <td>{p.type ?? '—'}</td>
                  <td>{p.distributor ?? p.brand?.name ?? '—'}</td>
                  <td>{p.btg_cost != null ? `$${p.btg_cost.toFixed(2)}` : '—'}</td>
                  <td className={styles.actionsCell}>
                    <button
                      type="button"
                      className={styles.archiveBtn}
                      onClick={(e) => handleArchive(e, p)}
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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

      <Slideover
        open={slideoverOpen}
        onClose={closeSlide}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        footer={
          <>
            <Button variant="secondary" onClick={closeSlide} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={handleSave} loading={saving}>Save</Button>
          </>
        }
      >
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
              onChange={(e) => setField('brand_name', e.target.value)}
              placeholder="Brand / supplier"
            />
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
      </Slideover>
    </>
  );
}
