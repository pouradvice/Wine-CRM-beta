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
    .upsert(brand)
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
  const { data, error } = await sb
    .from('products')
    .upsert(product, { onConflict: 'sku_number' })
    .select()
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

// Re-export error type for API routes
export type { ApiErrorResponse };
