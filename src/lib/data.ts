// ============================================================
// src/lib/data.ts
// Wine CRM — Centralized data access layer
// Aligned with 04_schema_rework.sql
//
// All functions accept a Supabase client — works from server
// components and API routes without duplication.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Supplier, SupplierInsert,
  SupplierContract, SupplierContractInsert,
  Brand, BrandInsert,
  Product, ProductInsert,
  Account, AccountInsert,
  Contact, ContactInsert,
  Recap,
  FollowUp,
  ProductPerformance,
  FollowUpQueueRow,
  VisitsBySupplierRow,
  ProductsByContactRow,
  RecapFormState,
  PaginationOptions,
  PaginatedResult,
  RecapOutcome,
  DashboardStats,
  TopAccount,
  SalespersonStats,
  SalespersonWeeklyTrend,
  InactiveAccount,
  PipelineHealth,
  ExpenseRecap,
  AccountReportRow,
  WeeklySummary,
  SupplierBillingTerms,
  SupplierBillingTermsInsert,
  DepletionMatchResult,
  AttributionMatch,
  AttributionMatchStatus,
} from '@/types';
import { mapDbError } from '@/types';
import type { PriceTier } from '@/types';

// ── Price tier helper ─────────────────────────────────────────

/** Derives a PriceTier from a wholesale/frontline price. Returns null if price is null. */
export function getPriceTier(price: number | null): PriceTier | null {
  if (price == null) return null;
  if (price < 13)   return '$';
  if (price < 26)   return '$$';
  if (price < 71)   return '$$$';
  return '$$$$';
}

// ── Pagination helper ─────────────────────────────────────────

function pageRange(page = 0, pageSize = 50): [number, number] {
  const offset = page * pageSize;
  return [offset, offset + pageSize - 1];
}

// ── Suppliers ─────────────────────────────────────────────────

export async function getSuppliers(sb: SupabaseClient, teamId?: string): Promise<Supplier[]> {
  if (teamId) {
    const { data: contracts, error: cErr } = await sb
      .from('supplier_contracts')
      .select('supplier_id')
      .eq('team_id', teamId);
    if (cErr) throw new Error(mapDbError(cErr));
    const ids = (contracts ?? []).map((c: { supplier_id: string }) => c.supplier_id);
    if (ids.length === 0) return [];
    const { data, error } = await sb
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .in('id', ids)
      .order('name');
    if (error) throw new Error(mapDbError(error));
    return data ?? [];
  }
  const { data, error } = await sb
    .from('suppliers')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(mapDbError(error));
  return data ?? [];
}

export async function upsertSupplier(
  sb: SupabaseClient,
  supplier: SupplierInsert & { id?: string },
): Promise<Supplier> {
  const { data, error } = await sb
    .from('suppliers')
    .upsert(supplier)
    .select()
    .single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

// ── Supplier contracts ────────────────────────────────────────

export async function getSupplierContracts(
  sb: SupabaseClient,
  options?: { status?: string },
): Promise<SupplierContract[]> {
  let query = sb
    .from('supplier_contracts')
    .select('*, supplier:suppliers(*)')
    .order('created_at', { ascending: false });

  if (options?.status) query = query.eq('status', options.status);

  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));
  return data ?? [];
}

export async function upsertSupplierContract(
  sb: SupabaseClient,
  contract: SupplierContractInsert & { id?: string },
): Promise<SupplierContract> {
  const { data, error } = await sb
    .from('supplier_contracts')
    .upsert(contract, { onConflict: 'team_id,supplier_id' })
    .select('*, supplier:suppliers(*)')
    .single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

// ── Brands ────────────────────────────────────────────────────

export async function getBrands(
  sb: SupabaseClient,
  options?: { supplierId?: string; teamId?: string },
): Promise<Brand[]> {
  let query = sb
    .from('brands')
    .select('*, supplier:suppliers(*)')
    .eq('is_active', true)
    .order('name');

  if (options?.teamId)     query = query.eq('team_id', options.teamId);
  if (options?.supplierId) query = query.eq('supplier_id', options.supplierId);

  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));
  return data ?? [];
}

export async function upsertBrand(
  sb: SupabaseClient,
  brand: BrandInsert & { id?: string },
): Promise<Brand> {
  const { data, error } = await sb
    .from('brands')
    .upsert(brand, { onConflict: 'name,team_id' })
    .select('*, supplier:suppliers(*)')
    .single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

// ── Products ──────────────────────────────────────────────────

export async function getProducts(
  sb: SupabaseClient,
  options?: {
    includeInactive?: boolean;
    brandId?:         string;
    supplierId?:      string;
    search?:          string;
    type?:            string;
    limit?:           number;
    teamId?:          string;
  } & PaginationOptions,
): Promise<PaginatedResult<Product>> {
  const [from, to] = pageRange(options?.page, options?.pageSize);

  let query = sb
    .from('products')
    .select('*, brand:brands(*, supplier:suppliers(*)), supplier:suppliers(*)', { count: 'exact' })
    .order('wine_name')
    .range(from, to);

  if (!options?.includeInactive) query = query.eq('is_active', true);
  if (options?.teamId)           query = query.eq('team_id', options.teamId);
  if (options?.brandId)          query = query.eq('brand_id', options.brandId);
  if (options?.supplierId)       query = query.eq('supplier_id', options.supplierId);
  if (options?.search) {
    query = query.or(
      `wine_name.ilike.%${options.search}%,sku_number.ilike.%${options.search}%,distributor.ilike.%${options.search}%`,
    );
  }
  if (options?.type) query = query.eq('type', options.type);

  const { data, error, count } = await query;
  if (error) throw new Error(mapDbError(error));
  return { data: data ?? [], count: count ?? 0 };
}

export async function getProductById(
  sb: SupabaseClient,
  id: string,
  teamId?: string,
): Promise<Product | null> {
  let query = sb
    .from('products')
    .select('*, brand:brands(*, supplier:suppliers(*)), supplier:suppliers(*)')
    .eq('id', id);
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query.single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

export async function upsertProduct(
  sb: SupabaseClient,
  product: ProductInsert & { id?: string },
): Promise<Product> {
  const onConflict = product.id ? 'id' : 'sku_number,team_id';
  const { data, error } = await sb
    .from('products')
    .upsert(product, { onConflict })
    .select('*, brand:brands(*, supplier:suppliers(*)), supplier:suppliers(*)')
    .single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

export async function archiveProduct(
  sb: SupabaseClient,
  id: string,
  teamId?: string,
): Promise<void> {
  let query = sb
    .from('products')
    .update({ is_active: false })
    .eq('id', id);
  if (teamId) query = query.eq('team_id', teamId);
  const { error } = await query;
  if (error) throw new Error(mapDbError(error));
}

// ── Accounts ──────────────────────────────────────────────────

export async function getAccounts(
  sb: SupabaseClient,
  status?: 'Active' | 'Prospective' | 'Former',
  pagination?: PaginationOptions,
  teamId?: string,
  search?: string,
): Promise<PaginatedResult<Account>> {
  const [from, to] = pageRange(pagination?.page, pagination?.pageSize);

  let query = sb
    .from('accounts')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('name')
    .range(from, to);

  if (teamId) query = query.eq('team_id', teamId);
  if (status) query = query.eq('status', status);
  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error, count } = await query;
  if (error) throw new Error(mapDbError(error));
  return { data: data ?? [], count: count ?? 0 };
}

export async function getAccountById(
  sb: SupabaseClient,
  id: string,
  teamId?: string,
): Promise<Account | null> {
  let query = sb
    .from('accounts')
    .select('*')
    .eq('id', id);
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query.single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

export async function upsertAccount(
  sb: SupabaseClient,
  account: AccountInsert & { id?: string },
): Promise<Account> {
  const { data, error } = await sb
    .from('accounts')
    .upsert(account)
    .select()
    .single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

export async function archiveAccount(
  sb: SupabaseClient,
  id: string,
  teamId?: string,
): Promise<void> {
  let query = sb
    .from('accounts')
    .update({ status: 'Former' })
    .eq('id', id);
  if (teamId) query = query.eq('team_id', teamId);
  const { error } = await query;
  if (error) throw new Error(mapDbError(error));
}

export async function getAccountSkus(
  sb: SupabaseClient,
  accountId: string,
): Promise<Product[]> {
  const { data, error } = await sb
    .from('account_skus')
    .select('product:products(*, brand:brands(*, supplier:suppliers(*)))')
    .eq('account_id', accountId)
    .order('created_at');
  if (error) throw new Error(mapDbError(error));
  type Row = { product: Product };
  return (data as unknown as Row[]).map((r) => r.product).filter(Boolean);
}

export async function setAccountSkus(
  sb: SupabaseClient,
  accountId: string,
  productIds: string[],
  teamId: string,
): Promise<void> {
  const { error: delErr } = await sb
    .from('account_skus')
    .delete()
    .eq('account_id', accountId);
  if (delErr) throw new Error(mapDbError(delErr));
  if (productIds.length === 0) return;
  const rows = productIds.map((pid) => ({ account_id: accountId, product_id: pid, team_id: teamId }));
  const { error: insErr } = await sb.from('account_skus').insert(rows);
  if (insErr) throw new Error(mapDbError(insErr));
}

// ── Contacts ──────────────────────────────────────────────────

export async function getContacts(
  sb: SupabaseClient,
  accountId?: string,
  pagination?: PaginationOptions,
  teamId?: string,
): Promise<PaginatedResult<Contact>> {
  const [from, to] = pageRange(pagination?.page, pagination?.pageSize);

  let query = sb
    .from('contacts')
    .select('*, account:accounts(id, name)', { count: 'exact' })
    .eq('is_active', true)
    .order('first_name')
    .range(from, to);

  if (teamId)    query = query.eq('team_id', teamId);
  if (accountId) query = query.eq('account_id', accountId);

  const { data, error, count } = await query;
  if (error) throw new Error(mapDbError(error));
  return { data: data ?? [], count: count ?? 0 };
}

export async function upsertContact(
  sb: SupabaseClient,
  contact: ContactInsert & { id?: string },
): Promise<Contact> {
  const { data, error } = await sb
    .from('contacts')
    .upsert(contact)
    .select('*, account:accounts(id, name)')
    .single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

// ── Recaps ────────────────────────────────────────────────────

export async function getRecaps(
  sb: SupabaseClient,
  options?: {
    accountId?:  string;
    salesperson?: string;
    from?:       string;
    to?:         string;
    teamId?:     string;
  } & PaginationOptions,
): Promise<PaginatedResult<Recap>> {
  const [rangeFrom, rangeTo] = pageRange(options?.page, options?.pageSize);

  let query = sb
    .from('recaps')
    .select(
      `*,
       account:accounts(id, name),
       contact:contacts(id, first_name, last_name),
       recap_products(
         *,
         product:products(id, sku_number, wine_name, type)
       )`,
      { count: 'exact' },
    )
    .order('visit_date', { ascending: false })
    .range(rangeFrom, rangeTo);

  if (options?.teamId)      query = query.eq('team_id', options.teamId);
  if (options?.accountId)   query = query.eq('account_id', options.accountId);
  if (options?.salesperson) query = query.eq('salesperson', options.salesperson);
  if (options?.from)        query = query.gte('visit_date', options.from);
  if (options?.to)          query = query.lte('visit_date', options.to);

  const { data, error, count } = await query;
  if (error) throw new Error(mapDbError(error));
  return { data: data ?? [], count: count ?? 0 };
}

export async function getRecapById(
  sb: SupabaseClient,
  id: string,
  teamId?: string,
): Promise<Recap | null> {
  let query = sb
    .from('recaps')
    .select(`
      *,
      account:accounts(*),
      contact:contacts(*),
      recap_products(*, product:products(*))
    `)
    .eq('id', id);
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query.single();
  if (error) throw new Error(mapDbError(error));
  return data;
}

export async function saveRecap(
  sb: SupabaseClient,
  form: RecapFormState,
): Promise<string> {
  const { data: { user } } = await sb.auth.getUser();

  const p_recap = {
    visit_date:          form.visit_date,
    salesperson:         form.salesperson,
    user_id:             user?.id ?? null,
    account_id:          form.account_id,
    contact_id:          form.contact_id || null,
    nature:              form.nature,
    expense_receipt_url: form.expense_receipt_url || null,
    notes:               form.notes || null,
  };

  const p_products = form.products.map((p) => ({
    product_id:        p.product_id,
    outcome:           p.outcome,
    order_probability: p.order_probability ? String(p.order_probability) : '',
    buyer_feedback:    p.buyer_feedback || '',
    follow_up_date:    p.follow_up_date || '',
    bill_date:         p.bill_date || '',
  }));

  const { data, error } = await sb.rpc('save_recap', { p_recap, p_products });
  if (error) throw new Error(mapDbError(error));
  const recapId = data as string;

  // Store contact_name (free-text account lead) — separate update since it's
  // not part of the save_recap RPC signature.
  if (form.contact_name) {
    await sb.from('recaps').update({ contact_name: form.contact_name }).eq('id', recapId);
  }

  return recapId;
}

// ── Follow-ups ────────────────────────────────────────────────

export async function getFollowUpQueue(
  sb: SupabaseClient,
  pagination?: PaginationOptions,
  teamId?: string,
): Promise<PaginatedResult<FollowUpQueueRow>> {
  const [from, to] = pageRange(pagination?.page, pagination?.pageSize);

  let query = sb
    .from('v_follow_up_queue')
    .select('*', { count: 'exact' })
    .range(from, to);
  if (teamId) query = query.eq('team_id', teamId);

  const { data, error, count } = await query;
  if (error) throw new Error(mapDbError(error));
  return { data: data ?? [], count: count ?? 0 };
}

export async function updateFollowUpStatus(
  sb: SupabaseClient,
  id: string,
  update: { status: 'Completed' | 'Snoozed'; snoozed_until?: string },
): Promise<void> {
  const payload: Partial<FollowUp> = {
    status: update.status,
    ...(update.status === 'Completed'
      ? { completed_at: new Date().toISOString() }
      : {}),
    ...(update.snoozed_until ? { snoozed_until: update.snoozed_until } : {}),
  };
  const { error } = await sb.from('follow_ups').update(payload).eq('id', id);
  if (error) throw new Error(mapDbError(error));
}

// ── Analytics ─────────────────────────────────────────────────

export async function getProductPerformance(
  sb: SupabaseClient,
  pagination?: PaginationOptions,
  teamId?: string,
): Promise<PaginatedResult<ProductPerformance>> {
  const [from, to] = pageRange(pagination?.page, pagination?.pageSize);

  let query = sb
    .from('v_product_performance')
    .select('*', { count: 'exact' })
    .order('times_shown', { ascending: false })
    .range(from, to);
  if (teamId) query = query.eq('team_id', teamId);

  const { data, error, count } = await query;
  if (error) throw new Error(mapDbError(error));
  return { data: data ?? [], count: count ?? 0 };
}

export async function getVisitsBySupplier(
  sb: SupabaseClient,
  teamId?: string,
): Promise<VisitsBySupplierRow[]> {
  let query = sb
    .from('recap_products')
    .select(`
      outcome,
      supplier_id,
      supplier:suppliers(name),
      product:products(
        brand:brands(name, supplier_id, supplier:suppliers(name))
      )
    `)
    .order('created_at', { ascending: false });
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query;

  if (error) throw new Error(mapDbError(error));

  type RawRow = {
    outcome:     RecapOutcome;
    supplier_id: string | null;
    supplier:    { name: string } | null;
    product:     Array<{ brand: Array<{ name: string; supplier_id: string | null; supplier: Array<{ name: string }> }> }> | null;
  };

  const map = new Map<string, {
    supplier_name: string | null;
    brand_names:   Set<string>;
    total_visits:  number;
    orders_placed: number;
  }>();

  for (const row of (data ?? []) as unknown as RawRow[]) {
    const brand        = row.product?.[0]?.brand?.[0] ?? null;
    const supplierName = row.supplier?.name ?? brand?.supplier?.[0]?.name ?? null;
    const supplierId   = row.supplier_id ?? brand?.supplier_id ?? null;

    if (!supplierId) continue;

    if (!map.has(supplierId)) {
      map.set(supplierId, {
        supplier_name: supplierName,
        brand_names:   new Set(),
        total_visits:  0,
        orders_placed: 0,
      });
    }
    const entry = map.get(supplierId)!;
    entry.total_visits += 1;
    if (row.outcome === 'Yes Today') entry.orders_placed += 1;
    if (brand?.name) entry.brand_names.add(brand.name);
    if (!entry.supplier_name && supplierName) entry.supplier_name = supplierName;
  }

  return Array.from(map.entries()).map(([supplier_id, v]) => ({
    supplier_id,
    supplier_name: v.supplier_name,
    brand_name:    v.brand_names.size > 0 ? Array.from(v.brand_names).join(', ') : null,
    total_visits:  v.total_visits,
    orders_placed: v.orders_placed,
  }));
}

export async function getProductsByContact(
  sb: SupabaseClient,
  teamId?: string,
): Promise<ProductsByContactRow[]> {
  let query = sb.from('v_products_by_contact').select('*');
  if (teamId) query = query.eq('team_id', teamId);

  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));
  return (data ?? []) as ProductsByContactRow[];
}

// ── Dashboard & Reporting ─────────────────────────────────────

/** ISO week start (Monday) for any date string. */
function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export async function getDashboardStats(sb: SupabaseClient, teamId?: string): Promise<DashboardStats> {
  const now = new Date();
  const startOfMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

  let monthQuery = sb.from('recaps').select('id', { count: 'exact', head: true }).gte('visit_date', startOfMonth);
  if (teamId) monthQuery = monthQuery.eq('team_id', teamId);

  let convQuery = sb.from('v_product_performance').select('conversion_rate_pct');
  if (teamId) convQuery = convQuery.eq('team_id', teamId);

  // Event recaps this month
  let eventsQuery = sb.from('recaps').select('id', { count: 'exact', head: true })
    .eq('nature', 'Event').gte('visit_date', startOfMonth);
  if (teamId) eventsQuery = eventsQuery.eq('team_id', teamId);

  // Off-Premise Tasting recaps this month
  let offSiteQuery = sb.from('recaps').select('id', { count: 'exact', head: true })
    .eq('nature', 'Off-Premise Tasting').gte('visit_date', startOfMonth);
  if (teamId) offSiteQuery = offSiteQuery.eq('team_id', teamId);

  // New menu placements this month — recap_products has no team_id column;
  // RLS on the authenticated client already scopes results to the team.
  // created_at is used as proxy for visit date.
  const placementsQuery = sb.from('recap_products').select('id', { count: 'exact', head: true })
    .eq('menu_placement', true).gte('created_at', startOfMonth + 'T00:00:00Z');

  // Retail 3cs order commits this month
  const retail3csQuery = sb.from('recap_products').select('id', { count: 'exact', head: true })
    .eq('retail_3cs_order', true).gte('created_at', startOfMonth + 'T00:00:00Z');

  const [monthRes, convRes, eventsRes, offSiteRes, placementsRes, retail3csRes] = await Promise.all([
    monthQuery, convQuery, eventsQuery, offSiteQuery, placementsQuery, retail3csQuery,
  ]);

  const rates = (convRes.data ?? [])
    .map((r) => r.conversion_rate_pct as number | null)
    .filter((v): v is number => v !== null);
  const conversion_rate_pct =
    rates.length > 0
      ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
      : null;

  return {
    visits_this_month:             monthRes.count ?? 0,
    conversion_rate_pct:           conversion_rate_pct,
    events_this_month:             eventsRes.count ?? 0,
    off_site_this_month:           offSiteRes.count ?? 0,
    new_placements_this_month:     placementsRes.count ?? 0,
    retail_3cs_commits_this_month: retail3csRes.count ?? 0,
  };
}

export async function getTopSkus(
  sb: SupabaseClient,
  limit = 5,
  teamId?: string,
): Promise<ProductPerformance[]> {
  let query = sb
    .from('v_product_performance')
    .select('*')
    .gte('times_shown', 1)
    .order('times_shown', { ascending: false })
    .limit(limit);
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));
  return (data ?? []) as ProductPerformance[];
}

export async function getTopAccounts(
  sb: SupabaseClient,
  limit = 5,
  teamId?: string,
): Promise<TopAccount[]> {
  let query = sb
    .from('recaps')
    .select('account_id, visit_date, account:accounts(name)');
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));

  const map = new Map<string, { account_name: string; visits: string[] }>();
  for (const row of data ?? []) {
    const r = row as unknown as {
      account_id: string;
      visit_date: string;
      account: Array<{ name: string }> | { name: string } | null;
    };
    const name = Array.isArray(r.account)
      ? r.account[0]?.name ?? r.account_id
      : (r.account as { name: string } | null)?.name ?? r.account_id;
    if (!map.has(r.account_id)) map.set(r.account_id, { account_name: name, visits: [] });
    map.get(r.account_id)!.visits.push(r.visit_date);
  }

  return Array.from(map.entries())
    .map(([account_id, v]) => ({
      account_id,
      account_name:  v.account_name,
      total_visits:  v.visits.length,
      orders_placed: 0,  // enriched separately if needed
    }))
    .sort((a, b) => b.total_visits - a.total_visits)
    .slice(0, limit);
}

export async function getSalespersonStats(
  sb: SupabaseClient,
  options?: { salesperson?: string; teamId?: string },
): Promise<SalespersonStats[]> {
  let query = sb
    .from('recaps')
    .select(`
      id,
      salesperson,
      visit_date,
      account_id,
      recap_products(outcome, order_probability)
    `);
  if (options?.salesperson) query = query.eq('salesperson', options.salesperson);
  if (options?.teamId) query = query.eq('team_id', options.teamId);

  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));

  type RawRow = {
    id:             string;
    salesperson:    string;
    visit_date:     string;
    account_id:     string;
    recap_products: Array<{ outcome: string; order_probability: number | null }>;
  };

  const map = new Map<string, {
    visits:   string[];
    accounts: Set<string>;
    products: number;
    orders:   number;
    probs:    number[];
  }>();

  for (const row of (data ?? []) as unknown as RawRow[]) {
    if (!map.has(row.salesperson)) {
      map.set(row.salesperson, { visits: [], accounts: new Set(), products: 0, orders: 0, probs: [] });
    }
    const s = map.get(row.salesperson)!;
    s.visits.push(row.visit_date);
    s.accounts.add(row.account_id);
    const products = Array.isArray(row.recap_products) ? row.recap_products : [];
    s.products += products.length;
    for (const p of products) {
      if (p.outcome === 'Yes Today') s.orders++;
      if (p.order_probability !== null) s.probs.push(p.order_probability);
    }
  }

  return Array.from(map.entries())
    .map(([salesperson, s]) => ({
      salesperson,
      total_visits:  s.visits.length,
      orders_placed: s.orders,
      accounts_seen: s.accounts.size,
    }))
    .sort((a, b) => b.total_visits - a.total_visits);
}

export async function getSalespersonWeeklyTrend(
  sb: SupabaseClient,
  options?: { salesperson?: string; teamId?: string },
): Promise<SalespersonWeeklyTrend[]> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 84); // 12 weeks
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let query = sb
    .from('recaps')
    .select('visit_date, salesperson')
    .gte('visit_date', cutoffStr);
  if (options?.salesperson) query = query.eq('salesperson', options.salesperson);
  if (options?.teamId) query = query.eq('team_id', options.teamId);

  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));

  // Build 12-week scaffold (Monday-anchored)
  const weeks: string[] = [];
  const now = new Date();
  const currentMonday = new Date(now);
  const day = currentMonday.getUTCDay();
  currentMonday.setUTCDate(currentMonday.getUTCDate() - (day === 0 ? 6 : day - 1));
  for (let i = 11; i >= 0; i--) {
    const d = new Date(currentMonday);
    d.setUTCDate(currentMonday.getUTCDate() - i * 7);
    weeks.push(d.toISOString().slice(0, 10));
  }

  const counts = new Map<string, number>(weeks.map((w) => [w, 0]));
  for (const row of data ?? []) {
    const w = isoWeekStart(row.visit_date);
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
  }

  return weeks.map((week_start) => ({
    salesperson: options?.salesperson ?? 'all',
    week_start,
    visit_count: counts.get(week_start) ?? 0,
  }));
}

export async function getInactiveAccounts(
  sb: SupabaseClient,
  dayThreshold = 60,
  teamId?: string,
): Promise<InactiveAccount[]> {
  let accountsQuery = sb.from('accounts').select('id, name, account_lead, value_tier').eq('is_active', true);
  if (teamId) accountsQuery = accountsQuery.eq('team_id', teamId);

  let recapsQuery = sb.from('recaps').select('account_id, visit_date').order('visit_date', { ascending: false });
  if (teamId) recapsQuery = recapsQuery.eq('team_id', teamId);

  const [accountsRes, recapsRes] = await Promise.all([accountsQuery, recapsQuery]);
  if (accountsRes.error) throw new Error(mapDbError(accountsRes.error));
  if (recapsRes.error)   throw new Error(mapDbError(recapsRes.error));

  const lastVisit = new Map<string, string>();
  for (const r of recapsRes.data ?? []) {
    if (!lastVisit.has(r.account_id)) lastVisit.set(r.account_id, r.visit_date);
  }

  const today = new Date();
  const results: InactiveAccount[] = [];

  for (const a of accountsRes.data ?? []) {
    const lv   = lastVisit.get(a.id) ?? null;
    const days = lv
      ? Math.floor((today.getTime() - new Date(lv).getTime()) / 86400000)
      : null;
    if (days === null || days >= dayThreshold) {
      results.push({
        account_id:      a.id,
        account_name:    a.name,
        last_visit_date: lv,
        days_inactive:   days ?? -1,
      });
    }
  }

  return results.sort((a, b) => (b.days_inactive ?? 9999) - (a.days_inactive ?? 9999));
}

export async function getPipelineHealth(sb: SupabaseClient, teamId?: string): Promise<PipelineHealth[]> {
  let query = sb.from('v_follow_up_queue').select('outcome').eq('status', 'Open');
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));

  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const o = r.outcome as string;
    map.set(o, (map.get(o) ?? 0) + 1);
  }
  const total = Array.from(map.values()).reduce((s, c) => s + c, 0);

  return Array.from(map.entries()).map(([outcome, count]) => ({
    outcome:      outcome as RecapOutcome,
    count,
    pct_of_total: total > 0 ? Math.round((count / total) * 100) : 0,
  }));
}

export async function getExpenseRecaps(
  sb: SupabaseClient,
  options?: { from?: string; to?: string; supplierId?: string; teamId?: string },
): Promise<ExpenseRecap[]> {
  let query = sb
    .from('recaps')
    .select(`
      id,
      visit_date,
      salesperson,
      expense_receipt_url,
      expense_amount,
      account:accounts(name),
      recap_products(
        supplier_id,
        product:products(
          brand:brands(name, supplier_id)
        )
      )
    `)
    .or('expense_receipt_url.not.is.null,expense_amount.not.is.null')
    .order('visit_date', { ascending: false });

  if (options?.from) query = query.gte('visit_date', options.from);
  if (options?.to)   query = query.lte('visit_date', options.to);
  if (options?.teamId) query = query.eq('team_id', options.teamId);

  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));

  type RawRecap = {
    id:                  string;
    visit_date:          string;
    salesperson:         string;
    expense_receipt_url: string | null;
    expense_amount:      number | null;
    account: Array<{ name: string }> | { name: string } | null;
    recap_products: Array<{
      supplier_id: string | null;
      product: Array<{ brand: Array<{ name: string; supplier_id: string | null }> }>;
    }>;
  };

  const rows: ExpenseRecap[] = [];
  for (const row of (data ?? []) as unknown as RawRecap[]) {
    const accountName = Array.isArray(row.account)
      ? row.account[0]?.name ?? ''
      : (row.account as { name: string } | null)?.name ?? '';

    // Filter by supplier if requested
    if (options?.supplierId) {
      const hasSupplier = (row.recap_products ?? []).some(
        (rp) => rp.supplier_id === options.supplierId,
      );
      if (!hasSupplier) continue;
    }

    rows.push({
      recap_id:            row.id,
      visit_date:          row.visit_date,
      salesperson:         row.salesperson,
      account_name:        accountName,
      expense_receipt_url: row.expense_receipt_url ?? null,
      expense_amount:      row.expense_amount ?? null,
    });
  }
  return rows;
}

export async function getAccountsReport(
  sb: SupabaseClient,
  teamId?: string,
): Promise<AccountReportRow[]> {
  let accountsQuery = sb
    .from('accounts')
    .select('id, name, type, value_tier, status')
    .eq('is_active', true);
  if (teamId) accountsQuery = accountsQuery.eq('team_id', teamId);

  let recapsQuery = sb
    .from('recaps')
    .select('account_id, visit_date, recap_products(outcome)');
  if (teamId) recapsQuery = recapsQuery.eq('team_id', teamId);

  const [accountsRes, recapsRes] = await Promise.all([accountsQuery, recapsQuery]);
  if (accountsRes.error) throw new Error(mapDbError(accountsRes.error));
  if (recapsRes.error)   throw new Error(mapDbError(recapsRes.error));

  type RawRecap = {
    account_id: string;
    visit_date: string;
    recap_products: Array<{ outcome: string }>;
  };

  const visitMap = new Map<string, { visits: string[]; orders: number }>();
  for (const r of (recapsRes.data ?? []) as unknown as RawRecap[]) {
    if (!visitMap.has(r.account_id)) visitMap.set(r.account_id, { visits: [], orders: 0 });
    const entry = visitMap.get(r.account_id)!;
    entry.visits.push(r.visit_date);
    for (const rp of r.recap_products ?? []) {
      if (rp.outcome === 'Yes Today') entry.orders++;
    }
  }

  return (accountsRes.data ?? []).map((a) => {
    const entry = visitMap.get(a.id);
    const visits = entry?.visits ?? [];
    const lastVisit = visits.length > 0
      ? visits.reduce((latest, d) => (d > latest ? d : latest))
      : null;
    return {
      account_id:      a.id,
      account_name:    a.name,
      account_type:    a.type ?? null,
      value_tier:      a.value_tier ?? null,
      status:          a.status,
      visit_count:     visits.length,
      last_visit_date: lastVisit,
      orders_placed:   entry?.orders ?? 0,
    };
  }).sort((a, b) => b.visit_count - a.visit_count);
}

// Re-export error type for API routes
export type { ApiErrorResponse } from '@/types';

// ── Weekly Summaries ──────────────────────────────────────────

export async function getWeeklySummaries(
  sb: SupabaseClient,
  teamId: string,
): Promise<WeeklySummary[]> {
  const { data, error } = await sb
    .from('weekly_summaries')
    .select('*')
    .eq('team_id', teamId)
    .order('week_start', { ascending: false });
  if (error) throw new Error(mapDbError(error));
  return (data ?? []) as WeeklySummary[];
}

export async function getWeeklySummaryByWeek(
  sb: SupabaseClient,
  teamId: string,
  weekStart: string,
): Promise<WeeklySummary | null> {
  const { data, error } = await sb
    .from('weekly_summaries')
    .select('*')
    .eq('team_id', teamId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw new Error(mapDbError(error));
  return data as WeeklySummary | null;
}

export async function generateAndSaveWeeklySummary(
  sb: SupabaseClient,
  teamId: string,
  weekStart: string,
  userId: string,
): Promise<WeeklySummary> {
  // 1. Calculate weekEnd (weekStart + 6 days)
  const startDate = new Date(weekStart + 'T00:00:00Z');
  const endDate   = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const weekEnd = endDate.toISOString().split('T')[0];

  // 2. Query recaps for the week (include nature + occasion for event/off-site sections)
  const { data: recaps, error: recapsError } = await sb
    .from('recaps')
    .select('id, account_id, nature, occasion, recap_products(id, outcome, product_id, menu_placement, products(wine_name))')
    .eq('team_id', teamId)
    .gte('visit_date', weekStart)
    .lte('visit_date', weekEnd);
  if (recapsError) throw new Error(mapDbError(recapsError));

  const weekRecaps = recaps ?? [];

  // 3. Compute basic metrics
  const total_visits     = weekRecaps.length;
  const accountIds       = new Set(weekRecaps.map((r) => r.account_id as string));
  const accounts_visited = accountIds.size;

  type RecapProduct = { id: string; outcome: string; product_id: string; menu_placement: boolean; products: { wine_name: string }[] | null };
  const allProducts: RecapProduct[] = weekRecaps.flatMap(
    (r) => (r.recap_products as RecapProduct[]) ?? [],
  );
  const total_orders          = allProducts.filter((p) => p.outcome === 'Yes Today').length;
  const total_products_shown  = allProducts.length;
  const conversion_rate_pct   = total_products_shown > 0
    ? Math.round((total_orders / total_products_shown) * 1000) / 10
    : null;

  // 4. Active follow-ups
  const { count: followUpCount, error: fuError } = await sb
    .from('follow_ups')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('status', 'Open');
  if (fuError) throw new Error(mapDbError(fuError));
  const active_follow_ups = followUpCount ?? 0;

  // 5. Inactive accounts
  const inactiveList   = await getInactiveAccounts(sb, 60, teamId);
  const inactive_accounts = inactiveList.length;

  // 6. Top 5 products by orders in the week
  const productOrderCounts = new Map<string, number>();
  for (const p of allProducts) {
    if (p.outcome === 'Yes Today') {
      productOrderCounts.set(p.product_id, (productOrderCounts.get(p.product_id) ?? 0) + 1);
    }
  }
  const productShownCounts = new Map<string, number>();
  for (const p of allProducts) {
    productShownCounts.set(p.product_id, (productShownCounts.get(p.product_id) ?? 0) + 1);
  }

  const topProductIds = Array.from(productOrderCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  let top_products: WeeklySummary['top_products'] = [];
  if (topProductIds.length > 0) {
    const { data: prodRows, error: prodError } = await sb
      .from('products')
      .select('id, wine_name, sku_number')
      .in('id', topProductIds);
    if (prodError) throw new Error(mapDbError(prodError));
    top_products = (prodRows ?? []).map((prod) => {
      const orders = productOrderCounts.get(prod.id) ?? 0;
      const shown  = productShownCounts.get(prod.id) ?? 0;
      return {
        wine_name:          prod.wine_name as string,
        sku_number:         prod.sku_number as string,
        orders_placed:      orders,
        conversion_rate_pct: shown > 0 ? Math.round((orders / shown) * 1000) / 10 : null,
      };
    }).sort((a, b) => b.orders_placed - a.orders_placed);
  }

  // 7. Top 5 accounts by visit count in the week
  const accountVisitCounts = new Map<string, number>();
  const accountOrderCounts = new Map<string, number>();
  for (const r of weekRecaps) {
    const aid = r.account_id as string;
    accountVisitCounts.set(aid, (accountVisitCounts.get(aid) ?? 0) + 1);
    const orders = ((r.recap_products as RecapProduct[]) ?? [])
      .filter((p) => p.outcome === 'Yes Today').length;
    accountOrderCounts.set(aid, (accountOrderCounts.get(aid) ?? 0) + orders);
  }

  const topAccountIds = Array.from(accountVisitCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  let top_accounts: WeeklySummary['top_accounts'] = [];
  if (topAccountIds.length > 0) {
    const { data: accRows, error: accError } = await sb
      .from('accounts')
      .select('id, name')
      .in('id', topAccountIds);
    if (accError) throw new Error(mapDbError(accError));
    top_accounts = (accRows ?? []).map((acc) => ({
      account_name: acc.name as string,
      visit_count:  accountVisitCounts.get(acc.id) ?? 0,
      orders_placed: accountOrderCounts.get(acc.id) ?? 0,
    })).sort((a, b) => b.visit_count - a.visit_count);
  }

  // 8. Pipeline summary from getPipelineHealth
  const pipelineRows   = await getPipelineHealth(sb, teamId);
  const pipeline_summary: Record<string, number> = {};
  for (const row of pipelineRows) {
    pipeline_summary[row.outcome] = row.count;
  }

  // 9. Fetch account names for all accounts visited this week (for event/off-site lists)
  const allAccountIds = Array.from(accountIds);
  let accountNameMap = new Map<string, string>();
  if (allAccountIds.length > 0) {
    const { data: accNameRows } = await sb
      .from('accounts')
      .select('id, name')
      .in('id', allAccountIds);
    for (const a of accNameRows ?? []) {
      accountNameMap.set(a.id as string, a.name as string);
    }
  }

  // 10. Build event_recaps, off_site_recaps, new_menu_placements
  type EventRecap = { account_name: string; visit_date: string; occasion: string | null };
  type OffSiteRecap = { account_name: string; visit_date: string };
  type MenuPlacement = { account_name: string; wine_name: string; visit_date: string };

  const event_recaps: EventRecap[] = [];
  const off_site_recaps: OffSiteRecap[] = [];
  const new_menu_placements: MenuPlacement[] = [];

  for (const r of weekRecaps) {
    const accountName = accountNameMap.get(r.account_id as string) ?? '';
    const visitDate   = (r as Record<string, unknown>).visit_date as string ?? '';
    const nature      = (r as Record<string, unknown>).nature as string ?? '';
    const occasion    = (r as Record<string, unknown>).occasion as string | null ?? null;

    if (nature === 'Event') {
      event_recaps.push({ account_name: accountName, visit_date: visitDate, occasion });
    } else if (nature === 'Off-Premise Tasting') {
      off_site_recaps.push({ account_name: accountName, visit_date: visitDate });
    }

    for (const p of (r.recap_products as RecapProduct[]) ?? []) {
      if (p.menu_placement) {
        new_menu_placements.push({
          account_name: accountName,
          wine_name:    p.products?.[0]?.wine_name ?? '',
          visit_date:   visitDate,
        });
      }
    }
  }

  // 11. Upsert into weekly_summaries
  const record = {
    team_id:             teamId,
    week_start:          weekStart,
    week_end:            weekEnd,
    total_visits,
    total_orders,
    accounts_visited,
    conversion_rate_pct: conversion_rate_pct,
    active_follow_ups,
    inactive_accounts,
    top_products,
    top_accounts,
    pipeline_summary,
    event_recaps,
    off_site_recaps,
    new_menu_placements,
    generated_by:        userId,
  };

  const { data: upserted, error: upsertError } = await sb
    .from('weekly_summaries')
    .upsert(record, { onConflict: 'team_id,week_start' })
    .select('*')
    .single();
  if (upsertError) throw new Error(mapDbError(upsertError));
  return upserted as WeeklySummary;
}

// ── Billing ───────────────────────────────────────────────────

export async function getBillingTerms(
  sb: SupabaseClient,
  supplierId: string,
): Promise<SupplierBillingTerms | null> {
  const { data, error } = await sb
    .from('supplier_billing_terms')
    .select('*')
    .eq('supplier_id', supplierId)
    .is('effective_to', null)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(mapDbError(error));
  return data as SupplierBillingTerms | null;
}

export async function upsertBillingTerms(
  sb: SupabaseClient,
  terms: SupplierBillingTermsInsert,
): Promise<SupplierBillingTerms> {
  const { data, error } = await sb
    .from('supplier_billing_terms')
    .insert(terms)
    .select()
    .single();
  if (error) throw new Error(mapDbError(error));
  return data as SupplierBillingTerms;
}

export async function matchDepletionToPlacements(
  sb: SupabaseClient,
  supplierId: string,
  periodMonth: string,
): Promise<DepletionMatchResult> {
  const { data, error } = await sb.rpc('match_depletion_to_placements', {
    p_supplier_id:  supplierId,
    p_period_month: periodMonth,
  });
  if (error) throw new Error(mapDbError(error));
  return data as DepletionMatchResult;
}

export async function recordAttributionForPlacements(
  sb: SupabaseClient,
  teamId: string,
  supplierId: string,
  depletionReportId: string,
  periodMonth: string,
): Promise<void> {
  const { data: placements, error: placementsError } = await sb
    .from('supplier_verified_placements')
    .select('id, recap_product_id')
    .eq('supplier_id', supplierId)
    .eq('team_id', teamId)
    .eq('depletion_period', periodMonth)
    .eq('depletion_report_id', depletionReportId);

  if (placementsError) throw new Error(mapDbError(placementsError));
  if (!placements?.length) return;

  const placementIds = placements.map(p => p.id);
  const { data: existing, error: existingError } = await sb
    .from('attribution_matches')
    .select('placement_id')
    .eq('team_id', teamId)
    .in('placement_id', placementIds);

  if (existingError) throw new Error(mapDbError(existingError));

  const existingPlacementIds = new Set(
    (existing ?? [])
      .map(match => match.placement_id)
      .filter((id): id is string => Boolean(id)),
  );

  const rows = placements
    .filter(placement => !existingPlacementIds.has(placement.id))
    .map(placement => ({
      team_id:              teamId,
      supplier_id:          supplierId,
      recap_product_id:     placement.recap_product_id,
      depletion_report_id:  depletionReportId,
      placement_id:         placement.id,
      invoice_line_item_id: null,
      confidence_score:     0.95,
      match_type:           'auto',
      status:               'matched',
      notes:                `Auto-matched via depletion report for period ${periodMonth}`,
    }));

  if (!rows.length) return;

  const { error: insertError } = await sb
    .from('attribution_matches')
    .insert(rows);
  if (insertError) throw new Error(mapDbError(insertError));
}

export async function linkAttributionToInvoiceLineItems(
  sb: SupabaseClient,
  teamId: string,
  invoiceId: string,
): Promise<void> {
  const { data: lineItems, error: lineItemsError } = await sb
    .from('supplier_invoice_line_items')
    .select('id, line_type, source_ids')
    .eq('invoice_id', invoiceId);

  if (lineItemsError) throw new Error(mapDbError(lineItemsError));
  if (!lineItems?.length) return;

  for (const lineItem of lineItems) {
    if (lineItem.line_type !== 'Placement' || !Array.isArray(lineItem.source_ids) || !lineItem.source_ids.length) {
      continue;
    }

    const placementIds = Array.from(new Set(
      lineItem.source_ids.filter((id): id is string => typeof id === 'string' && id.length > 0),
    ));
    if (!placementIds.length) continue;

    const { data: existingMatches, error: existingMatchesError } = await sb
      .from('attribution_matches')
      .select('placement_id')
      .eq('team_id', teamId)
      .in('placement_id', placementIds);

    if (existingMatchesError) throw new Error(mapDbError(existingMatchesError));

    if (existingMatches?.length) {
      const { error: updateError } = await sb
        .from('attribution_matches')
        .update({
          invoice_line_item_id: lineItem.id,
          updated_at:           new Date().toISOString(),
        })
        .eq('team_id', teamId)
        .in(
          'placement_id',
          existingMatches
            .map(match => match.placement_id)
            .filter((id): id is string => Boolean(id)),
        );
      if (updateError) throw new Error(mapDbError(updateError));
    }

    const existingPlacementIds = new Set(
      (existingMatches ?? [])
        .map(match => match.placement_id)
        .filter((id): id is string => Boolean(id)),
    );
    const missingPlacementIds = placementIds.filter(id => !existingPlacementIds.has(id));
    if (!missingPlacementIds.length) continue;

    const { data: placements, error: placementsError } = await sb
      .from('supplier_verified_placements')
      .select('id, supplier_id, recap_product_id, depletion_report_id')
      .eq('team_id', teamId)
      .in('id', missingPlacementIds);

    if (placementsError) throw new Error(mapDbError(placementsError));
    if (!placements?.length) continue;

    const rows = placements.map(placement => ({
      team_id:              teamId,
      supplier_id:          placement.supplier_id,
      recap_product_id:     placement.recap_product_id,
      depletion_report_id:  placement.depletion_report_id,
      placement_id:         placement.id,
      invoice_line_item_id: lineItem.id,
      confidence_score:     0.95,
      match_type:           'auto',
      status:               'matched',
      notes:                `Auto-linked during invoice draft generation for invoice ${invoiceId}`,
    }));

    const { error: insertError } = await sb
      .from('attribution_matches')
      .insert(rows);
    if (insertError) throw new Error(mapDbError(insertError));
  }
}

export async function getAttributionMatches(
  sb: SupabaseClient,
  teamId: string,
  options?: { supplierId?: string; status?: AttributionMatchStatus; limit?: number; offset?: number },
): Promise<AttributionMatch[]> {
  let query = sb
    .from('attribution_matches')
    .select(`
      *,
      supplier:suppliers(name),
      recap_product:recap_products(
        id, product_id, outcome,
        products(wine_name, sku_number),
        recap:recaps(id, visit_date, account_id, accounts:accounts(name))
      ),
      depletion_report:depletion_reports(id, period_month, row_count),
      placement:supplier_verified_placements(
        id, account_id, product_id, depletion_period, billing_eligible,
        account:accounts(name),
        product:products(wine_name, sku_number)
      ),
      invoice_line_item:supplier_invoice_line_items(
        id, invoice_id, line_type, description, quantity, unit_rate, amount
      )
    `)
    .eq('team_id', teamId)
    .order('matched_at', { ascending: false });

  if (options?.supplierId) query = query.eq('supplier_id', options.supplierId);
  if (options?.status) query = query.eq('status', options.status);
  if (options?.offset !== undefined || options?.limit !== undefined) {
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 50;
    query = query.range(offset, offset + limit - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(mapDbError(error));
  return (data ?? []) as unknown as AttributionMatch[];
}

export async function updateAttributionMatch(
  sb: SupabaseClient,
  matchId: string,
  teamId: string,
  updates: {
    status?: AttributionMatchStatus;
    notes?: string;
    resolved_by?: string | null;
    resolved_at?: string | null;
  },
): Promise<AttributionMatch> {
  const { data, error } = await sb
    .from('attribution_matches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('team_id', teamId)
    .select()
    .single();
  if (error) throw new Error(mapDbError(error));
  return data as unknown as AttributionMatch;
}

export async function createAttributionMatch(
  sb: SupabaseClient,
  match: Omit<
    AttributionMatch,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'matched_at'
    | 'resolved_at'
    | 'resolved_by'
    | 'supplier'
    | 'recap_product'
    | 'depletion_report'
    | 'placement'
    | 'invoice_line_item'
  >,
): Promise<AttributionMatch> {
  const { data, error } = await sb
    .from('attribution_matches')
    .insert(match)
    .select()
    .single();
  if (error) throw new Error(mapDbError(error));
  return data as unknown as AttributionMatch;
}
