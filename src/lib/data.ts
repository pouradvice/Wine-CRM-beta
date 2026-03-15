// src/lib/data.ts
// Centralized data access layer.
// All functions accept a Supabase client — works from server components
// and API routes without duplication.

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Brand, BrandInsert,
  Product, ProductInsert,
  Client, ClientInsert,
  Buyer, BuyerInsert,
  Recap,
  FollowUp,
  ProductPerformance,
  FollowUpQueueRow,
  VisitsBySupplierRow,
  ProductsByBuyerRow,
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

// ── Brands ────────────────────────────────────────────────────

export async function getBrands(sb: SupabaseClient): Promise<Brand[]> {
  const { data, error } = await sb
    .from('brands')
    .select('*')
    .eq('is_active', true)
    .order('name');
  if (error) throw mapDbError(error);
  return data ?? [];
}

export async function upsertBrand(
  sb: SupabaseClient,
  brand: BrandInsert & { id?: string },
): Promise<Brand> {
  const { data, error } = await sb
    .from('brands')
    .upsert(brand, { onConflict: 'name,team_id' })
    .select()
    .single();
  if (error) throw mapDbError(error);
  return data;
}

// ── Products ──────────────────────────────────────────────────

export async function getProducts(
  sb: SupabaseClient,
  options?: {
    includeInactive?: boolean;
    brandId?: string;
    search?: string;
    limit?: number;
  } & PaginationOptions,
): Promise<PaginatedResult<Product>> {
  const [from, to] = pageRange(options?.page, options?.pageSize);

  let query = sb
    .from('products')
    .select('*, brand:brands(*)', { count: 'exact' })
    .order('wine_name')
    .range(from, to);

  if (!options?.includeInactive) query = query.eq('is_active', true);
  if (options?.brandId) query = query.eq('brand_id', options.brandId);
  if (options?.search) {
    query = query.or(
      `wine_name.ilike.%${options.search}%,sku_number.ilike.%${options.search}%`,
    );
  }
  if (options?.limit) query = query.limit(options.limit);

  const { data, error, count } = await query;
  if (error) throw mapDbError(error);
  return { data: data ?? [], count: count ?? 0 };
}

export async function getProductById(
  sb: SupabaseClient,
  id: string,
): Promise<Product | null> {
  const { data, error } = await sb
    .from('products')
    .select('*, brand:brands(*)')
    .eq('id', id)
    .single();
  if (error) throw mapDbError(error);
  return data;
}

export async function upsertProduct(
  sb: SupabaseClient,
  product: ProductInsert & { id?: string },
): Promise<Product> {
  // Use id as conflict target for edits, sku_number+team_id for new products.
  const onConflict = product.id ? 'id' : 'sku_number,team_id';
  const { data, error } = await sb
    .from('products')
    .upsert(product, { onConflict })
    .select('*, brand:brands(*)')
    .single();
  if (error) throw mapDbError(error);
  return data;
}

export async function archiveProduct(
  sb: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await sb
    .from('products')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw mapDbError(error);
}

// ── Clients ───────────────────────────────────────────────────

export async function getClients(
  sb: SupabaseClient,
  status?: 'Active' | 'Prospective' | 'Former',
  pagination?: PaginationOptions,
): Promise<PaginatedResult<Client>> {
  const [from, to] = pageRange(pagination?.page, pagination?.pageSize);

  let query = sb
    .from('clients')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('company_name')
    .range(from, to);

  if (status) query = query.eq('status', status);

  const { data, error, count } = await query;
  if (error) throw mapDbError(error);
  return { data: data ?? [], count: count ?? 0 };
}

export async function getClientById(
  sb: SupabaseClient,
  id: string,
): Promise<Client | null> {
  const { data, error } = await sb
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw mapDbError(error);
  return data;
}

export async function upsertClient(
  sb: SupabaseClient,
  client: ClientInsert & { id?: string },
): Promise<Client> {
  const { data, error } = await sb
    .from('clients')
    .upsert(client)
    .select()
    .single();
  if (error) throw mapDbError(error);
  return data;
}

// ── Buyers ────────────────────────────────────────────────────

export async function getBuyers(
  sb: SupabaseClient,
  clientId?: string,
  pagination?: PaginationOptions,
): Promise<PaginatedResult<Buyer>> {
  const [from, to] = pageRange(pagination?.page, pagination?.pageSize);

  let query = sb
    .from('buyers')
    .select('*, client:clients(id, company_name)', { count: 'exact' })
    .eq('is_active', true)
    .order('contact_name')
    .range(from, to);

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error, count } = await query;
  if (error) throw mapDbError(error);
  return { data: data ?? [], count: count ?? 0 };
}

export async function upsertBuyer(
  sb: SupabaseClient,
  buyer: BuyerInsert & { id?: string },
): Promise<Buyer> {
  const { data, error } = await sb
    .from('buyers')
    .upsert(buyer)
    .select()
    .single();
  if (error) throw mapDbError(error);
  return data;
}

// ── Recaps ────────────────────────────────────────────────────

export async function getRecaps(
  sb: SupabaseClient,
  options?: {
    clientId?: string;
    salesperson?: string;
    from?: string;
    to?: string;
  } & PaginationOptions,
): Promise<PaginatedResult<Recap>> {
  const [rangeFrom, rangeTo] = pageRange(options?.page, options?.pageSize);

  let query = sb
    .from('recaps')
    .select(
      `*,
       client:clients(id, company_name),
       buyer:buyers(id, contact_name),
       recap_products(
         *,
         product:products(id, sku_number, wine_name, type)
       )`,
      { count: 'exact' },
    )
    .order('visit_date', { ascending: false })
    .range(rangeFrom, rangeTo);

  if (options?.clientId) query = query.eq('client_id', options.clientId);
  if (options?.salesperson) query = query.eq('salesperson', options.salesperson);
  if (options?.from) query = query.gte('visit_date', options.from);
  if (options?.to) query = query.lte('visit_date', options.to);

  const { data, error, count } = await query;
  if (error) throw mapDbError(error);
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
      client:clients(*),
      buyer:buyers(*),
      recap_products(*, product:products(*))
    `)
    .eq('id', id)
    .single();
  if (error) throw mapDbError(error);
  return data;
}

export async function saveRecap(
  sb: SupabaseClient,
  form: RecapFormState,
): Promise<string> {
  const { data: { user } } = await sb.auth.getUser();

  const p_recap = {
    visit_date: form.visit_date,
    salesperson: form.salesperson,
    user_id: user?.id ?? null,
    client_id: form.client_id,
    buyer_id: form.buyer_id || '',
    nature: form.nature,
    expense_receipt_url: '',
    notes: form.notes || '',
  };

  const p_products = form.products.map((p) => ({
    product_id: p.product_id,
    outcome: p.outcome,
    order_probability: p.order_probability ? String(p.order_probability) : '',
    buyer_feedback: p.buyer_feedback || '',
    follow_up_date: p.follow_up_date || '',
    bill_date: p.bill_date || '',
  }));

  const { data, error } = await sb.rpc('save_recap', {
    p_recap,
    p_products,
  });

  if (error) throw mapDbError(error);
  return data as string;
}

// ── Follow-ups ────────────────────────────────────────────────

export async function getFollowUpQueue(
  sb: SupabaseClient,
  pagination?: PaginationOptions,
): Promise<PaginatedResult<FollowUpQueueRow>> {
  const [from, to] = pageRange(pagination?.page, pagination?.pageSize);

  const { data, error, count } = await sb
    .from('v_follow_up_queue')
    .select('*', { count: 'exact' })
    .range(from, to);

  if (error) throw mapDbError(error);
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
  if (error) throw mapDbError(error);
}

// ── Analytics ─────────────────────────────────────────────────

export async function getProductPerformance(
  sb: SupabaseClient,
  pagination?: PaginationOptions,
): Promise<PaginatedResult<ProductPerformance>> {
  const [from, to] = pageRange(pagination?.page, pagination?.pageSize);

  const { data, error, count } = await sb
    .from('v_product_performance')
    .select('*', { count: 'exact' })
    .order('times_shown', { ascending: false })
    .range(from, to);

  if (error) throw mapDbError(error);
  return { data: data ?? [], count: count ?? 0 };
}

export async function getVisitsBySupplier(
  sb: SupabaseClient,
): Promise<VisitsBySupplierRow[]> {
  const { data, error } = await sb
    .from('recap_products')
    .select(`
      outcome,
      order_probability,
      buyer_feedback,
      recap:recaps(
        visit_date,
        client:clients(company_name)
      ),
      product:products(
        sku_number,
        wine_name,
        brand:brands(name)
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw mapDbError(error);

  // PostgREST returns one-to-one joins as arrays; we normalise to objects.
  return (data ?? []).map((row) => {
    const r = row as unknown as {
      outcome: RecapOutcome;
      order_probability: number | null;
      buyer_feedback: string | null;
      recap: Array<{ visit_date: string; client: Array<{ company_name: string }> }>;
      product: Array<{ sku_number: string; wine_name: string; brand: Array<{ name: string }> }>;
    };
    const recap = r.recap?.[0] ?? null;
    const product = r.product?.[0] ?? null;
    return {
      brand_name: product?.brand?.[0]?.name ?? null,
      visit_date: recap?.visit_date ?? '',
      client_name: recap?.client?.[0]?.company_name ?? '',
      sku_number: product?.sku_number ?? '',
      wine_name: product?.wine_name ?? '',
      outcome: r.outcome,
      buyer_feedback: r.buyer_feedback ?? null,
      order_probability: r.order_probability ?? null,
    };
  });
}

export async function getProductsByBuyer(
  sb: SupabaseClient,
): Promise<ProductsByBuyerRow[]> {
  const { data, error } = await sb
    .from('v_products_by_buyer')
    .select('*');

  if (error) throw mapDbError(error);
  return (data ?? []) as ProductsByBuyerRow[];
}

// ── Phase 2: Dashboard & Reporting ────────────────────────────

/** ISO week start (Monday) for any date string. */
function isoWeekStart(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export async function getDashboardStats(sb: SupabaseClient): Promise<DashboardStats> {
  const now = new Date();
  const startOfWeek = isoWeekStart(now.toISOString().slice(0, 10));
  const startOfMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

  const [
    weekRes,
    monthRes,
    productsRes,
    convRes,
    openRes,
    overdueRes,
  ] = await Promise.all([
    sb.from('recaps').select('id', { count: 'exact', head: true }).gte('visit_date', startOfWeek),
    sb.from('recaps').select('id', { count: 'exact', head: true }).gte('visit_date', startOfMonth),
    sb.from('recap_products').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
    sb.from('v_product_performance').select('conversion_rate_pct'),
    sb.from('v_follow_up_queue').select('id', { count: 'exact', head: true }).eq('status', 'Open'),
    sb.from('v_follow_up_queue').select('id', { count: 'exact', head: true }).eq('status', 'Open').eq('is_overdue', true),
  ]);

  const rates = (convRes.data ?? [])
    .map((r) => r.conversion_rate_pct as number | null)
    .filter((v): v is number => v !== null);
  const overall_conversion_rate =
    rates.length > 0 ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

  return {
    visits_this_week: weekRes.count ?? 0,
    visits_this_month: monthRes.count ?? 0,
    products_shown_this_month: productsRes.count ?? 0,
    overall_conversion_rate,
    open_follow_ups: openRes.count ?? 0,
    overdue_follow_ups: overdueRes.count ?? 0,
  };
}

export async function getTopSkus(
  sb: SupabaseClient,
  limit = 5,
): Promise<ProductPerformance[]> {
  const { data, error } = await sb
    .from('v_product_performance')
    .select('*')
    .gte('times_shown', 1)
    .order('times_shown', { ascending: false })
    .limit(limit);
  if (error) throw mapDbError(error);
  return (data ?? []) as ProductPerformance[];
}

export async function getTopAccounts(
  sb: SupabaseClient,
  limit = 5,
): Promise<TopAccount[]> {
  const { data, error } = await sb
    .from('recaps')
    .select('client_id, visit_date, client:clients(company_name)');
  if (error) throw mapDbError(error);

  // JS-side group by client
  const map = new Map<string, { client_name: string; visits: string[] }>();
  for (const row of data ?? []) {
    const r = row as unknown as {
      client_id: string;
      visit_date: string;
      client: Array<{ company_name: string }> | { company_name: string } | null;
    };
    const name = Array.isArray(r.client)
      ? r.client[0]?.company_name ?? r.client_id
      : (r.client as { company_name: string } | null)?.company_name ?? r.client_id;
    if (!map.has(r.client_id)) map.set(r.client_id, { client_name: name, visits: [] });
    map.get(r.client_id)!.visits.push(r.visit_date);
  }

  return Array.from(map.values())
    .map((v) => ({
      client_name: v.client_name,
      visit_count: v.visits.length,
      last_visit: v.visits.sort().at(-1) ?? '',
    }))
    .sort((a, b) => b.visit_count - a.visit_count)
    .slice(0, limit);
}

export async function getSalespersonStats(
  sb: SupabaseClient,
  options?: { salesperson?: string },
): Promise<SalespersonStats[]> {
  let query = sb
    .from('recaps')
    .select(`
      id,
      salesperson,
      visit_date,
      client_id,
      recap_products(outcome, order_probability)
    `);
  if (options?.salesperson) query = query.eq('salesperson', options.salesperson);

  const { data, error } = await query;
  if (error) throw mapDbError(error);

  type RawRow = {
    id: string;
    salesperson: string;
    visit_date: string;
    client_id: string;
    recap_products: Array<{ outcome: string; order_probability: number | null }>;
  };

  const map = new Map<string, {
    visits: string[];
    clients: Set<string>;
    products: number;
    orders: number;
    probs: number[];
  }>();

  for (const row of (data ?? []) as unknown as RawRow[]) {
    if (!map.has(row.salesperson)) {
      map.set(row.salesperson, { visits: [], clients: new Set(), products: 0, orders: 0, probs: [] });
    }
    const s = map.get(row.salesperson)!;
    s.visits.push(row.visit_date);
    s.clients.add(row.client_id);
    const products = Array.isArray(row.recap_products) ? row.recap_products : [];
    s.products += products.length;
    for (const p of products) {
      if (p.outcome === 'Yes Today') s.orders++;
      if (p.order_probability !== null) s.probs.push(p.order_probability);
    }
  }

  return Array.from(map.entries()).map(([salesperson, s]) => {
    const sorted = [...s.visits].sort();
    return {
      salesperson,
      total_visits: s.visits.length,
      unique_accounts: s.clients.size,
      products_shown: s.products,
      orders: s.orders,
      avg_probability: s.probs.length
        ? Math.round(s.probs.reduce((a, b) => a + b, 0) / s.probs.length)
        : 0,
      first_visit: sorted[0] ?? '',
      last_visit: sorted.at(-1) ?? '',
    };
  }).sort((a, b) => b.total_visits - a.total_visits);
}

export async function getSalespersonWeeklyTrend(
  sb: SupabaseClient,
  options?: { salesperson?: string },
): Promise<SalespersonWeeklyTrend[]> {
  // Last 12 weeks
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 84);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  let query = sb
    .from('recaps')
    .select('visit_date')
    .gte('visit_date', cutoffStr);
  if (options?.salesperson) query = query.eq('salesperson', options.salesperson);

  const { data, error } = await query;
  if (error) throw mapDbError(error);

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

  return weeks.map((week) => ({ week, visits: counts.get(week) ?? 0 }));
}

export async function getInactiveAccounts(
  sb: SupabaseClient,
  dayThreshold = 60,
): Promise<InactiveAccount[]> {
  const [clientsRes, recapsRes] = await Promise.all([
    sb.from('clients').select('id, company_name, account_lead, value_tier').eq('is_active', true),
    sb.from('recaps').select('client_id, visit_date').order('visit_date', { ascending: false }),
  ]);
  if (clientsRes.error) throw mapDbError(clientsRes.error);
  if (recapsRes.error) throw mapDbError(recapsRes.error);

  // Latest visit per client
  const lastVisit = new Map<string, string>();
  for (const r of recapsRes.data ?? []) {
    if (!lastVisit.has(r.client_id)) lastVisit.set(r.client_id, r.visit_date);
  }

  const today = new Date();
  const results: InactiveAccount[] = [];

  for (const c of clientsRes.data ?? []) {
    const lv = lastVisit.get(c.id) ?? null;
    const days = lv
      ? Math.floor((today.getTime() - new Date(lv).getTime()) / 86400000)
      : null;
    if (days === null || days >= dayThreshold) {
      results.push({
        id: c.id,
        company_name: c.company_name,
        account_lead: c.account_lead ?? null,
        value_tier: c.value_tier ?? null,
        last_visit: lv,
        days_since_visit: days,
      });
    }
  }

  return results.sort((a, b) => {
    const da = a.days_since_visit ?? 9999;
    const db = b.days_since_visit ?? 9999;
    return db - da;
  });
}

export async function getPipelineHealth(sb: SupabaseClient): Promise<PipelineHealth[]> {
  const { data, error } = await sb
    .from('v_follow_up_queue')
    .select('outcome')
    .eq('status', 'Open');
  if (error) throw mapDbError(error);

  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const o = r.outcome as string;
    map.set(o, (map.get(o) ?? 0) + 1);
  }

  return Array.from(map.entries()).map(([outcome, count]) => ({
    outcome: outcome as RecapOutcome,
    count,
  }));
}

export async function getExpenseRecaps(
  sb: SupabaseClient,
  options?: { from?: string; to?: string; supplier?: string },
): Promise<ExpenseRecap[]> {
  let query = sb
    .from('recaps')
    .select(`
      visit_date,
      salesperson,
      expense_receipt_url,
      notes,
      client:clients(company_name),
      recap_products(
        product:products(
          brand:brands(name, supplier)
        )
      )
    `)
    .not('expense_receipt_url', 'is', null)
    .order('visit_date', { ascending: false });

  if (options?.from) query = query.gte('visit_date', options.from);
  if (options?.to) query = query.lte('visit_date', options.to);

  const { data, error } = await query;
  if (error) throw mapDbError(error);

  type BrandInfo = { name: string | null; supplier: string | null };
  type RawProduct = { brand: BrandInfo[] | BrandInfo | null };
  type RawRecap = {
    visit_date: string;
    salesperson: string;
    expense_receipt_url: string | null;
    notes: string | null;
    client: Array<{ company_name: string }> | { company_name: string } | null;
    recap_products: RawProduct[];
  };

  const rows: ExpenseRecap[] = [];
  for (const row of (data ?? []) as unknown as RawRecap[]) {
    const clientName = Array.isArray(row.client)
      ? row.client[0]?.company_name ?? ''
      : (row.client as { company_name: string } | null)?.company_name ?? '';

    // Pick first brand from recap_products
    let brandName: string | null = null;
    let supplier: string | null = null;
    for (const rp of row.recap_products ?? []) {
      const b = Array.isArray(rp.brand) ? rp.brand[0] : rp.brand;
      if (b) { brandName = b.name; supplier = b.supplier; break; }
    }

    if (options?.supplier && supplier !== options.supplier) continue;

    rows.push({
      visit_date: row.visit_date,
      salesperson: row.salesperson,
      client_name: clientName,
      brand_name: brandName,
      supplier,
      expense_receipt_url: row.expense_receipt_url,
      notes: row.notes,
    });
  }
  return rows;
}

// Re-export error type for API routes
export type { ApiErrorResponse };
