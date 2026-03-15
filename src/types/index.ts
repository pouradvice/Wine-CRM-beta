// src/types/index.ts
// Shared TypeScript types — mirrors the database schema exactly.
// All nullable DB columns are typed as `string | null` (not undefined).

export type RecapOutcome =
  | 'Yes Today'
  | 'Yes Later'
  | 'Maybe Later'
  | 'No'
  | 'Discussed';

export type ClientStatus = 'Active' | 'Prospective' | 'Former';
export type FollowUpStatus = 'Open' | 'Snoozed' | 'Completed';
export type RecapNature = 'Sales Call' | 'Depletion Meeting';

// ── Pagination ────────────────────────────────────────────────
export interface PaginationOptions {
  page?: number;     // 0-indexed, default 0
  pageSize?: number; // default 50
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;     // total rows matching the query (for page count UI)
}

// ── Error helpers ─────────────────────────────────────────────
export interface ApiErrorResponse {
  error: string;
  code: string;
}

// Maps Postgres/PostgREST error codes to user-facing messages.
export function mapDbError(err: unknown): ApiErrorResponse {
  const e = err as { code?: string; message?: string };
  switch (e.code) {
    case '23505':
      return { error: 'A record with this identifier already exists.', code: '23505' };
    case '23503':
      return { error: 'A referenced record was not found.', code: '23503' };
    case 'PGRST116':
      return { error: 'Record not found.', code: 'PGRST116' };
    default:
      return {
        error: e.message ?? 'An unexpected error occurred.',
        code: e.code ?? 'UNKNOWN',
      };
  }
}

// ── Brand ────────────────────────────────────────────────────
export interface Brand {
  id: string;
  name: string;
  team_id: string;
  supplier: string | null;
  country: string | null;
  region: string | null;
  website: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type BrandInsert = Omit<Brand, 'id' | 'created_at' | 'updated_at'>;
export type BrandUpdate = Partial<BrandInsert>;

// ── Product ──────────────────────────────────────────────────
export interface Product {
  id: string;
  sku_number: string;
  wine_name: string;
  brand_id: string | null;
  team_id: string;
  type: string | null;
  varietal: string | null;
  country: string | null;
  region: string | null;
  appellation: string | null;
  vintage: string | null;
  btg_cost: number | null;
  three_cs_cost: number | null;
  frontline_cost: number | null;
  distributor: string | null;
  tech_sheet_url: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  brand?: Brand | null;
}

export type ProductInsert = Omit<Product, 'id' | 'created_at' | 'updated_at' | 'brand'>;
export type ProductUpdate = Partial<ProductInsert>;

// ── Client ───────────────────────────────────────────────────
export interface Client {
  id: string;
  company_name: string;
  type: string | null;
  value_tier: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  commission_pct: number | null;
  billback_pct: number | null;
  contract_length: string | null;
  date_active_from: string | null;
  date_active_to: string | null;
  account_lead: string | null;
  team_id: string;
  status: ClientStatus;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type ClientInsert = Omit<Client, 'id' | 'created_at' | 'updated_at'>;
export type ClientUpdate = Partial<ClientInsert>;

// ── Buyer ────────────────────────────────────────────────────
export interface Buyer {
  id: string;
  client_id: string;
  team_id: string;
  contact_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  premise_type: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  client?: Client | null;
}

export type BuyerInsert = Omit<Buyer, 'id' | 'created_at' | 'updated_at' | 'client'>;
export type BuyerUpdate = Partial<BuyerInsert>;

// ── Recap ────────────────────────────────────────────────────
export interface Recap {
  id: string;
  visit_date: string;
  salesperson: string;
  user_id: string | null;
  team_id: string;
  client_id: string;
  buyer_id: string | null;
  nature: RecapNature;
  expense_receipt_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  client?: Client | null;
  buyer?: Buyer | null;
  recap_products?: RecapProduct[];
}

export type RecapInsert = Omit<
  Recap,
  'id' | 'created_at' | 'updated_at' | 'client' | 'buyer' | 'recap_products'
>;
export type RecapUpdate = Partial<RecapInsert>;

// ── RecapProduct ─────────────────────────────────────────────
export interface RecapProduct {
  id: string;
  recap_id: string;
  product_id: string;
  outcome: RecapOutcome;
  order_probability: number | null;
  buyer_feedback: string | null;
  follow_up_required: boolean;
  follow_up_date: string | null;
  bill_date: string | null;
  created_at: string;
  product?: Product | null;
}

export type RecapProductInsert = Omit<RecapProduct, 'id' | 'created_at' | 'product'>;
export type RecapProductUpdate = Partial<RecapProductInsert>;

// ── FollowUp ─────────────────────────────────────────────────
export interface FollowUp {
  id: string;
  recap_product_id: string;
  recap_id: string;
  client_id: string;
  product_id: string;
  due_date: string | null;
  status: FollowUpStatus;
  snoozed_until: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── View types ────────────────────────────────────────────────
export interface ProductPerformance {
  product_id: string;
  sku_number: string;
  wine_name: string;
  type: string | null;
  varietal: string | null;
  brand_name: string | null;
  distributor: string | null;
  times_shown: number;
  orders_placed: number;
  committed: number;
  avg_order_probability: number | null;
  conversion_rate_pct: number | null;
  last_shown_date: string | null;
}

export interface FollowUpQueueRow {
  id: string;
  due_date: string | null;
  status: FollowUpStatus;
  snoozed_until: string | null;
  client_name: string;
  buyer_name: string | null;
  wine_name: string;
  sku_number: string;
  recap_date: string;
  salesperson: string;
  outcome: RecapOutcome;
  buyer_feedback: string | null;
  bill_date: string | null;
  is_overdue: boolean;
}

// ── Reports view types ────────────────────────────────────────
export interface VisitsBySupplierRow {
  brand_name: string | null;
  visit_date: string;
  client_name: string;
  sku_number: string;
  wine_name: string;
  outcome: RecapOutcome;
  buyer_feedback: string | null;
  order_probability: number | null;
}

export interface ProductsByBuyerRow {
  client_name: string;
  buyer_name: string | null;
  sku_number: string;
  wine_name: string;
  times_shown: number;
  last_shown_date: string | null;
  outcome_history: string | null;
  orders: number;
}

// ── Form state for new recap entry ───────────────────────────
export interface RecapFormProduct {
  product_id: string;
  outcome: RecapOutcome;
  order_probability: number;
  buyer_feedback: string;
  follow_up_date: string;
  bill_date: string;
}

export interface RecapFormState {
  visit_date: string;
  salesperson: string;
  client_id: string;
  buyer_id: string;
  nature: RecapNature;
  notes: string;
  products: RecapFormProduct[];
}

// ── Phase 2 types ─────────────────────────────────────────────

export interface DashboardStats {
  visits_this_week: number;
  visits_this_month: number;
  products_shown_this_month: number;
  overall_conversion_rate: number;
  open_follow_ups: number;
  overdue_follow_ups: number;
}

export interface TopAccount {
  client_name: string;
  visit_count: number;
  last_visit: string;
}

export interface SalespersonStats {
  salesperson: string;
  total_visits: number;
  unique_accounts: number;
  products_shown: number;
  orders: number;
  avg_probability: number;
  first_visit: string;
  last_visit: string;
}

export interface SalespersonWeeklyTrend {
  week: string;   // ISO week start date YYYY-MM-DD
  visits: number;
}

export interface InactiveAccount {
  id: string;
  company_name: string;
  account_lead: string | null;
  value_tier: string | null;
  last_visit: string | null;
  days_since_visit: number | null;
}

export interface PipelineHealth {
  outcome: RecapOutcome;
  count: number;
}

export interface ExpenseRecap {
  visit_date: string;
  salesperson: string;
  client_name: string;
  brand_name: string | null;
  supplier: string | null;
  expense_receipt_url: string | null;
  notes: string | null;
}
