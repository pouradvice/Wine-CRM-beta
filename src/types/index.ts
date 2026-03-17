// ============================================================
// types/index.ts
// Wine CRM — TypeScript type definitions
// Aligned with 04_schema_rework.sql
// ============================================================


// ── Shared primitives ────────────────────────────────────────

export type RecapOutcome     = 'Yes Today' | 'Yes Later' | 'Maybe Later' | 'No' | 'Discussed';
export type AccountStatus    = 'Active' | 'Prospective' | 'Former';
export type FollowUpStatus   = 'Open' | 'Snoozed' | 'Completed';
export type FollowUpType     = 'Call' | 'Visit' | 'Email' | 'Sample';
export type RecapNature      = 'Sales Call' | 'Depletion Meeting';
export type UserRole         = 'owner' | 'admin' | 'member';
export type SupplierUserRole = 'admin' | 'viewer';
export type ContractStatus   = 'pending' | 'active' | 'expired' | 'terminated';
export type WineType         = 'Red' | 'White' | 'Rosé' | 'Sparkling' | 'Dessert' | 'Fortified' | 'Spirit' | 'Other';
export type AccountType      = 'Restaurant' | 'Retail' | 'Hotel' | 'Bar' | 'Club' | 'Corporate' | 'Other';
export type PremiseType      = 'On-Premise' | 'Off-Premise';
export type ValueTier        = 'A' | 'B' | 'C';

export interface PaginationOptions {
  page?:     number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data:  T[];
  count: number;
}

export interface ApiErrorResponse {
  error: string;
  code:  string;
}

/** Maps Postgres / PostgREST error codes to user-facing error strings. */
export function mapDbError(err: { code?: string; message?: string }): string {
  switch (err.code) {
    case '23505':    return 'A record with that value already exists.';
    case '23503':    return 'This record is referenced by other data and cannot be deleted.';
    case 'PGRST116': return 'Record not found.';
    default:         return err.message ?? 'An unexpected error occurred.';
  }
}


// ── Platform layer ───────────────────────────────────────────

export interface Supplier {
  id:         string;
  name:       string;
  country:    string | null;
  region:     string | null;
  website:    string | null;
  notes:      string | null;
  is_active:  boolean;
  created_at: string;
  updated_at: string;
}

export type SupplierInsert = Omit<Supplier, 'id' | 'created_at' | 'updated_at'>;
export type SupplierUpdate = Partial<SupplierInsert>;

export interface SupplierUser {
  id:          string;
  user_id:     string;
  supplier_id: string;
  role:        SupplierUserRole;
  created_at:  string;
  // Relations
  supplier?: Supplier | null;
}


// ── Team administration ──────────────────────────────────────

export interface TeamMember {
  id:         string;
  user_id:    string;
  team_id:    string;
  role:       UserRole;
  created_at: string;
}

export interface SupplierContract {
  id:             string;
  team_id:        string;
  supplier_id:    string;
  region:         string | null;
  start_date:     string | null;
  end_date:       string | null;
  status:         ContractStatus;
  commission_pct: number | null;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
  // Relations
  supplier?: Supplier | null;
}

export type SupplierContractInsert = Omit<SupplierContract, 'id' | 'created_at' | 'updated_at' | 'supplier'>;
export type SupplierContractUpdate = Partial<SupplierContractInsert>;


// ── Catalog ──────────────────────────────────────────────────

export interface Brand {
  id:          string;
  team_id:     string;
  supplier_id: string | null;
  name:        string;
  country:     string | null;
  region:      string | null;
  description: string | null;
  website:     string | null;
  notes:       string | null;
  is_active:   boolean;
  created_at:  string;
  updated_at:  string;
  // Relations
  supplier?: Supplier | null;
}

export type BrandInsert = Omit<Brand, 'id' | 'created_at' | 'updated_at' | 'supplier'>;
export type BrandUpdate = Partial<BrandInsert>;

export interface Product {
  id:             string;
  team_id:        string;
  brand_id:       string | null;
  supplier_id:    string | null;   // denormalized from brand.supplier_id via trigger
  sku_number:     string;
  wine_name:      string;
  type:           WineType | null;
  varietal:       string | null;
  country:        string | null;
  region:         string | null;
  appellation:    string | null;
  vintage:        string | null;
  btg_cost:       number | null;
  three_cs_cost:  number | null;
  frontline_cost: number | null;
  distributor:    string | null;
  tech_sheet_url: string | null;
  tasting_notes:  string | null;
  description:    string | null;
  is_active:      boolean;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
  // Relations
  brand?:    Brand    | null;
  supplier?: Supplier | null;
}

export type ProductInsert = Omit<Product, 'id' | 'created_at' | 'updated_at' | 'brand' | 'supplier'>;
export type ProductUpdate = Partial<ProductInsert>;


// ── CRM ──────────────────────────────────────────────────────

export interface Account {
  id:           string;
  team_id:      string;
  name:         string;
  type:         AccountType | null;
  value_tier:   ValueTier | null;
  phone:        string | null;
  email:        string | null;
  address:      string | null;
  city:         string | null;
  state:        string | null;
  country:      string | null;
  account_lead: string | null;
  status:       AccountStatus;
  notes:        string | null;
  is_active:    boolean;
  created_at:   string;
  updated_at:   string;
}

export type AccountInsert = Omit<Account, 'id' | 'created_at' | 'updated_at'>;
export type AccountUpdate = Partial<AccountInsert>;

export interface Contact {
  id:           string;
  team_id:      string;
  account_id:   string;
  first_name:   string;
  last_name:    string | null;
  role:         string | null;
  phone:        string | null;
  email:        string | null;
  premise_type: PremiseType | null;
  notes:        string | null;
  is_active:    boolean;
  created_at:   string;
  updated_at:   string;
  // Relations
  account?: Account | null;
}

export type ContactInsert = Omit<Contact, 'id' | 'created_at' | 'updated_at' | 'account'>;
export type ContactUpdate = Partial<ContactInsert>;

/** Convenience: full name as a single string. */
export function contactFullName(c: Pick<Contact, 'first_name' | 'last_name'>): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ');
}

export interface Recap {
  id:                  string;
  team_id:             string;
  account_id:          string;
  contact_id:          string | null;
  user_id:             string | null;
  visit_date:          string;
  salesperson:         string;
  nature:              RecapNature;
  expense_receipt_url: string | null;
  notes:               string | null;
  created_at:          string;
  updated_at:          string;
  // Relations
  account?:        Account        | null;
  contact?:        Contact        | null;
  recap_products?: RecapProduct[] | null;
}

export interface RecapProduct {
  id:                 string;
  recap_id:           string;
  product_id:         string;
  supplier_id:        string | null;   // denormalized via trigger
  outcome:            RecapOutcome;
  order_probability:  number | null;
  buyer_feedback:     string | null;
  follow_up_required: boolean;
  follow_up_date:     string | null;
  bill_date:          string | null;
  created_at:         string;
  // Relations
  product?: Product | null;
}

export interface FollowUp {
  id:               string;
  team_id:          string;
  recap_product_id: string | null;
  recap_id:         string | null;
  account_id:       string;
  contact_id:       string | null;
  product_id:       string | null;
  supplier_id:      string | null;
  assigned_to:      string | null;
  due_date:         string | null;
  type:             FollowUpType;
  status:           FollowUpStatus;
  snoozed_until:    string | null;
  completed_at:     string | null;
  notes:            string | null;
  created_at:       string;
  updated_at:       string;
}


// ── View row types ───────────────────────────────────────────

export interface ProductPerformance {
  product_id:            string;
  team_id:               string;
  sku_number:            string;
  wine_name:             string;
  type:                  WineType | null;
  varietal:              string | null;
  supplier_id:           string | null;
  brand_name:            string | null;
  distributor:           string | null;
  times_shown:           number;
  orders_placed:         number;
  committed:             number;
  avg_order_probability: number | null;
  conversion_rate_pct:   number | null;
  last_shown_date:       string | null;
}

export interface FollowUpQueueRow {
  id:             string;
  team_id:        string;
  due_date:       string | null;
  status:         FollowUpStatus;
  snoozed_until:  string | null;
  type:           FollowUpType;
  notes:          string | null;
  account_name:   string;
  contact_name:   string;
  wine_name:      string | null;
  sku_number:     string | null;
  recap_date:     string | null;
  salesperson:    string | null;
  outcome:        RecapOutcome | null;
  buyer_feedback: string | null;
  bill_date:      string | null;
  is_overdue:     boolean;
}

export interface SupplierPlacementRow {
  supplier_id:       string;
  recap_product_id:  string;
  outcome:           RecapOutcome;
  order_probability: number | null;
  buyer_feedback:    string | null;
  bill_date:         string | null;
  visit_date:        string;
  nature:            RecapNature;
  account_name:      string;
  account_type:      AccountType | null;
  account_city:      string | null;
  account_state:     string | null;
  wine_name:         string;
  sku_number:        string;
  vintage:           string | null;
  wine_type:         WineType | null;
  brand_name:        string;
  supplier_name:     string;
}

export interface ProductsByContactRow {
  team_id:         string;
  contact_id:      string;
  contact_name:    string;
  account_name:    string;
  sku_number:      string;
  wine_name:       string;
  type:            WineType | null;
  times_shown:     number;
  last_shown:      string | null;
  outcome_history: string | null;
  orders:          number;
}

export interface VisitsBySupplierRow {
  supplier_id:   string | null;
  supplier_name: string | null;
  brand_name:    string | null;
  total_visits:  number;
  orders_placed: number;
}


// ── Dashboard / analytics ────────────────────────────────────

export interface DashboardStats {
  total_accounts:      number;
  active_follow_ups:   number;
  visits_this_month:   number;
  conversion_rate_pct: number | null;
}

export interface TopAccount {
  account_id:    string;
  account_name:  string;
  total_visits:  number;
  orders_placed: number;
}

export interface SalespersonStats {
  salesperson:   string;
  total_visits:  number;
  orders_placed: number;
  accounts_seen: number;
}

export interface SalespersonWeeklyTrend {
  salesperson: string;
  week_start:  string;
  visit_count: number;
}

export interface InactiveAccount {
  account_id:      string;
  account_name:    string;
  last_visit_date: string | null;
  days_inactive:   number;
}

export interface PipelineHealth {
  outcome:      RecapOutcome;
  count:        number;
  pct_of_total: number;
}

export interface ExpenseRecap {
  recap_id:            string;
  visit_date:          string;
  salesperson:         string;
  account_name:        string;
  expense_receipt_url: string;
}


// ── Onboarding ───────────────────────────────────────────────

/**
 * Role used by the onboarding wizard to control which steps are shown.
 * Distinct from UserRole (team_members.role) which uses 'owner'|'admin'|'member'.
 */
export type OnboardingRole = 'team_lead' | 'individual' | 'team_member';

export interface OnboardingState {
  user_id:           string;
  completed_at:      string | null;
  accounts_imported: number;
  products_imported: number;
  created_at:        string;
  updated_at:        string;
}

export interface BulkImportResult {
  inserted: number;
  skipped:  number;
  errors:   string[];
}


// ── Form state ───────────────────────────────────────────────

export interface RecapFormProduct {
  product_id:        string;
  outcome:           RecapOutcome;
  order_probability: number | null;
  buyer_feedback:    string | null;
  follow_up_date:    string | null;
  bill_date:         string | null;
}

export interface RecapFormState {
  visit_date:          string;
  salesperson:         string;
  account_id:          string;
  contact_id:          string | null;
  nature:              RecapNature;
  expense_receipt_url: string | null;
  notes:               string | null;
  products:            RecapFormProduct[];
}
