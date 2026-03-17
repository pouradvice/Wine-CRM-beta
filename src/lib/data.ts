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
  ApiErrorResponse,
  RecapOutcome,
  DashboardStats,
  TopAccount,
  SalespersonStats,
  SalespersonWeeklyTrend,
  InactiveAccount,
  PipelineHealth,
  ExpenseRecap,
} from '@/types';
import { mapDbError } from '@/types';

// ── Pagination helper ─────────────────────────────────────────

function pageRange(page = 0, pageSize = 50): [number, number] {
  const offset = page * pageSize;
  return [offset, offset + pageSize - 1];
}

// ── Suppliers ─────────────────────────────────────────────────

export async function getSuppliers(sb: SupabaseClient): Promise<Supplier[]> {
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
  options?: { supplierId?: string },
): Promise<Brand[]> {
  let query = sb
    .from('brands')
    .select('*, supplier:suppliers(*)')
    .eq('is_active', true)
    .order('name');

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
    limit?:           number;
    teamId?:          string;
  } & PaginationOptions,
): Promise<PaginatedResult<Product>> {
  const [from, to] = pageRange(options?.page, options?.pageSize);

  let query = sb
    .from('products')
    .select('*, brand:brands(*, supplier:suppliers(*))', { count: 'exact' })
    .order('wine_name')
    .range(from, to);

  if (!options?.includeInactive) query = query.eq('is_active', true);
  if (options?.teamId)           query = query.eq('team_id', options.teamId);
  if (options?.brandId)          query = query.eq('brand_id', options.brandId);
  if (options?.supplierId)       query = query.eq('supplier_id', options.supplierId);
  if (options?.search) {
    query = query.or(
      `wine_name.ilike.%${options.search}%,sku_number.ilike.%${options.search}%`,
    );
  }

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
    .select('*, brand:brands(*, supplier:suppliers(*))')
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
    .select('*, brand:brands(*, supplier:suppliers(*))')
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
    from?:        string;
    to?:          string;
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
): Promise<Recap | null> {
  const { data, error } = await sb
    .from('recaps')
    .select(`
      *,
      account:accounts(*),
      contact:contacts(*),
      recap_products(*, product:products(*))
    `)
    .eq('id', id)
    .single();
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
    contact_id:          form.contact_id || '',
    nature:              form.nature,
    expense_receipt_url: form.expense_receipt_url || '',
    notes:               form.notes || '',
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
      order_probability,
      buyer_feedback,
      supplier_id,
      recap:recaps(
        visit_date,
        account:accounts(name)
      ),
      product:products(
        sku_number,
        wine_name,
        brand:brands(name, supplier_id, supplier:suppliers(name))
      )
    `)
    .order('created_at', { ascending: false });
  if (teamId) query = query.eq('team_id', teamId);
  const { data, error } = await query;

  if (error) throw new Error(mapDbError(error));

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      outcome:            RecapOutcome;
      order_probability:  number | null;
      buyer_feedback:     string | null;
      supplier_id:        string | null;
      recap:    Array<{ visit_date: string; account: Array<{ name: string }> }>;
      product:  Array<{ sku_number: string; wine_name: string; brand: Array<{ name: string; supplier: Array<{ name: string }> }> }>;
    };
    const recap    = r.recap?.[0]   ?? null;
    const product  = r.product?.[0] ?? null;
    const brand    = product?.brand?.[0] ?? null;
    return {
      supplier_id:       r.supplier_id ?? null,
      supplier_name:     brand?.supplier?.[0]?.name ?? null,
      brand_name:        brand?.name ?? null,
      total_visits:      1,
      orders_placed:     r.outcome === 'Yes Today' ? 1 : 0,
    };
  });
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

  let openQuery = sb.from('v_follow_up_queue').select('id', { count: 'exact', head: true }).eq('status', 'Open');
  if (teamId) openQuery = openQuery.eq('team_id', teamId);

  const [monthRes, convRes, openRes] = await Promise.all([monthQuery, convQuery, openQuery]);

  const rates = (convRes.data ?? [])
    .map((r) => r.conversion_rate_pct as number | null)
    .filter((v): v is number => v !== null);
  const conversion_rate_pct =
    rates.length > 0
      ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
      : null;

  // total active accounts
  let accountsQuery = sb.from('accounts').select('id', { count: 'exact', head: true }).eq('is_active', true);
  if (teamId) accountsQuery = accountsQuery.eq('team_id', teamId);
  const { count: totalAccounts } = await accountsQuery;

  return {
    total_accounts:      totalAccounts ?? 0,
    active_follow_ups:   openRes.count ?? 0,
    visits_this_month:   monthRes.count ?? 0,
    conversion_rate_pct: conversion_rate_pct,
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
      account:accounts(name),
      recap_products(
        supplier_id,
        product:products(
          brand:brands(name, supplier_id)
        )
      )
    `)
    .not('expense_receipt_url', 'is', null)
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

    if (!row.expense_receipt_url) continue;

    rows.push({
      recap_id:            row.id,
      visit_date:          row.visit_date,
      salesperson:         row.salesperson,
      account_name:        accountName,
      expense_receipt_url: row.expense_receipt_url,
    });
  }
  return rows;
}

// Re-export error type for API routes
export type { ApiErrorResponse };
