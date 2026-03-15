-- ============================================================
-- 04_schema_rework.sql
-- Wine CRM — Clean Architecture Rewrite
-- Supersedes: 01_schema.sql, 02_migrations.sql, 03_multi_tenant.sql
--
-- Architecture: Option B Hybrid
--   Platform layer : suppliers  (shared reference, no team_id)
--   Team layer     : catalog (brands / products) + CRM (accounts / contacts / recaps)
--   Bridge         : supplier_id FK on brands, products, recap_products, follow_ups
--                    enables supplier portal cross-team queries without sharing catalog copy
--
-- Run this on a fresh Supabase project. Old files kept for reference only.
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- 0. EXTENSIONS & UTILITY
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Automatically stamps updated_at on any table it is attached to.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ══════════════════════════════════════════════════════════════
-- 1. PLATFORM LAYER
-- ══════════════════════════════════════════════════════════════

-- suppliers
-- Canonical winery / importer / distributor records.
-- No team_id — shared across all broker teams on the platform.
-- Managed by platform admins via service-role client.

CREATE TABLE suppliers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  country     TEXT,
  region      TEXT,
  website     TEXT,
  notes       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- supplier_users
-- Maps Supabase auth users to suppliers (supplier portal logins).
-- A supplier may have multiple users; a user may represent multiple suppliers.

CREATE TABLE supplier_users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  supplier_id  UUID        NOT NULL REFERENCES suppliers(id)   ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, supplier_id)
);


-- ══════════════════════════════════════════════════════════════
-- 2. TEAM LAYER — ADMINISTRATION
-- ══════════════════════════════════════════════════════════════

-- team_members
-- Maps Supabase auth users to broker teams.
-- A user may belong to multiple teams (e.g. owner of two regional offices).

CREATE TABLE team_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id     UUID        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, team_id)
);

-- supplier_contracts
-- Formalises the commercial relationship between a broker team and a supplier.
-- Establishes territory, exclusivity window, and commission terms.
-- App-level gate: teams should only add brands whose supplier they have a contract with.

CREATE TABLE supplier_contracts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID        NOT NULL,
  supplier_id     UUID        NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  region          TEXT,
  start_date      DATE,
  end_date        DATE,
  status          TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('pending', 'active', 'expired', 'terminated')),
  commission_pct  NUMERIC(5,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, supplier_id)
);


-- ══════════════════════════════════════════════════════════════
-- 3. TEAM LAYER — CATALOG
-- ══════════════════════════════════════════════════════════════

-- brands
-- Team-owned catalog of brand records.
-- supplier_id is the bridge to the platform layer — it is what lets the
-- supplier portal see cross-team placement data for their portfolio.
-- Teams fully control all copy fields for dossiers and lead-gen emails.

CREATE TABLE brands (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      UUID        NOT NULL,
  supplier_id  UUID        REFERENCES suppliers(id) ON DELETE SET NULL,
  name         TEXT        NOT NULL,
  country      TEXT,
  region       TEXT,
  description  TEXT,
  website      TEXT,
  notes        TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, team_id)
);

-- products
-- Team-owned SKU catalog.
-- supplier_id is denormalized from brands.supplier_id for two reasons:
--   1. Performant RLS: no multi-join subquery needed in the supplier read policy
--   2. Supplier portal can query recap_products in one join
-- Kept consistent automatically by triggers (see Section 7).
-- tasting_notes and description are team-controlled for dossier / email generation.

CREATE TABLE products (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID        NOT NULL,
  brand_id        UUID        REFERENCES brands(id)    ON DELETE SET NULL,
  supplier_id     UUID        REFERENCES suppliers(id) ON DELETE SET NULL,  -- denormalized
  sku_number      TEXT        NOT NULL,
  wine_name       TEXT        NOT NULL,
  type            TEXT        CHECK (type IN ('Red','White','Rosé','Sparkling','Dessert','Fortified','Spirit','Other')),
  varietal        TEXT,
  country         TEXT,
  region          TEXT,
  appellation     TEXT,
  vintage         TEXT,
  btg_cost        NUMERIC(10,2),
  three_cs_cost   NUMERIC(10,2),
  frontline_cost  NUMERIC(10,2),
  distributor     TEXT,
  tech_sheet_url  TEXT,
  tasting_notes   TEXT,
  description     TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sku_number, team_id)
);


-- ══════════════════════════════════════════════════════════════
-- 4. TEAM LAYER — CRM
-- ══════════════════════════════════════════════════════════════

-- accounts
-- Renamed from: clients
-- Venues, restaurants, hotels, retail accounts — where wine is placed.
-- contact_name removed; individual contacts live in the contacts table.
-- Address split into components for supplier portal city/state grouping.

CREATE TABLE accounts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID        NOT NULL,
  name              TEXT        NOT NULL,
  type              TEXT        CHECK (type IN ('Restaurant','Retail','Hotel','Bar','Club','Corporate','Other')),
  value_tier        TEXT        CHECK (value_tier IN ('A','B','C')),
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  city              TEXT,
  state             TEXT,
  country           TEXT,
  commission_pct    NUMERIC(5,2),
  billback_pct      NUMERIC(5,2),
  contract_length   TEXT,
  date_active_from  DATE,
  date_active_to    DATE,
  account_lead      TEXT,
  status            TEXT        NOT NULL DEFAULT 'Active'
                                  CHECK (status IN ('Active','Prospective','Former')),
  notes             TEXT,
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- contacts
-- Renamed from: buyers
-- Individual people at accounts (sommeliers, buyers, GMs, owners).
-- Absorbs contact_name from the old clients table.
-- first_name / last_name split enables personalised salutations in
-- generated emails and dossiers (e.g. "Dear Sophie,").

CREATE TABLE contacts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID        NOT NULL,
  account_id    UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  first_name    TEXT        NOT NULL,
  last_name     TEXT,
  role          TEXT,
  phone         TEXT,
  email         TEXT,
  premise_type  TEXT        CHECK (premise_type IN ('On-Premise','Off-Premise')),
  notes         TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- recaps
-- Individual sales visit / depletion meeting records.
-- account_id replaces client_id; contact_id replaces buyer_id.

CREATE TABLE recaps (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id              UUID        NOT NULL,
  account_id           UUID        NOT NULL REFERENCES accounts(id)  ON DELETE RESTRICT,
  contact_id           UUID                 REFERENCES contacts(id)  ON DELETE SET NULL,
  user_id              UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,
  visit_date           DATE        NOT NULL,
  salesperson          TEXT        NOT NULL,
  nature               TEXT        NOT NULL DEFAULT 'Sales Call'
                                     CHECK (nature IN ('Sales Call','Depletion Meeting')),
  expense_receipt_url  TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- recap_products
-- Products shown / tasted / placed at a recap visit.
-- supplier_id denormalized from products.supplier_id via trigger for
-- efficient supplier portal queries without joining through brands.

CREATE TABLE recap_products (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  recap_id            UUID        NOT NULL REFERENCES recaps(id)    ON DELETE CASCADE,
  product_id          UUID        NOT NULL REFERENCES products(id)  ON DELETE RESTRICT,
  supplier_id         UUID                 REFERENCES suppliers(id) ON DELETE SET NULL,  -- denormalized
  outcome             TEXT        NOT NULL DEFAULT 'Discussed'
                                    CHECK (outcome IN ('Yes Today','Yes Later','Maybe Later','No','Discussed')),
  order_probability   INTEGER     CHECK (order_probability BETWEEN 0 AND 100),
  buyer_feedback      TEXT,
  follow_up_required  BOOLEAN     NOT NULL DEFAULT FALSE,
  follow_up_date      DATE,
  bill_date           DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (recap_id, product_id)
);

-- follow_ups
-- Actionable queue.
-- Auto-generated by save_recap() when outcome is 'Yes Later' or 'Maybe Later'.
-- Can also be created standalone (recap_product_id / recap_id nullable).
-- supplier_id denormalized for supplier portal pipeline views.
-- assigned_to lets team leads delegate follow-ups to specific reps.

CREATE TABLE follow_ups (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID        NOT NULL,
  recap_product_id  UUID                 REFERENCES recap_products(id) ON DELETE CASCADE,
  recap_id          UUID                 REFERENCES recaps(id)         ON DELETE CASCADE,
  account_id        UUID        NOT NULL REFERENCES accounts(id)       ON DELETE CASCADE,
  contact_id        UUID                 REFERENCES contacts(id)       ON DELETE SET NULL,
  product_id        UUID                 REFERENCES products(id)       ON DELETE CASCADE,
  supplier_id       UUID                 REFERENCES suppliers(id)      ON DELETE SET NULL,
  assigned_to       UUID                 REFERENCES auth.users(id)     ON DELETE SET NULL,
  due_date          DATE,
  type              TEXT        NOT NULL DEFAULT 'Visit'
                                  CHECK (type IN ('Call','Visit','Email','Sample')),
  status            TEXT        NOT NULL DEFAULT 'Open'
                                  CHECK (status IN ('Open','Snoozed','Completed')),
  snoozed_until     DATE,
  completed_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ══════════════════════════════════════════════════════════════
-- 5. INDEXES
-- ══════════════════════════════════════════════════════════════

-- suppliers
CREATE INDEX idx_suppliers_name       ON suppliers(name);
CREATE INDEX idx_suppliers_is_active  ON suppliers(is_active);

-- supplier_users
CREATE INDEX idx_supplier_users_user_id      ON supplier_users(user_id);
CREATE INDEX idx_supplier_users_supplier_id  ON supplier_users(supplier_id);

-- team_members
CREATE INDEX idx_team_members_user_id   ON team_members(user_id);
CREATE INDEX idx_team_members_team_id   ON team_members(team_id);

-- supplier_contracts
CREATE INDEX idx_supplier_contracts_team_id      ON supplier_contracts(team_id);
CREATE INDEX idx_supplier_contracts_supplier_id  ON supplier_contracts(supplier_id);
CREATE INDEX idx_supplier_contracts_status       ON supplier_contracts(status);

-- brands
CREATE INDEX idx_brands_team_id      ON brands(team_id);
CREATE INDEX idx_brands_supplier_id  ON brands(supplier_id);
CREATE INDEX idx_brands_name         ON brands(name);
CREATE INDEX idx_brands_is_active    ON brands(is_active);

-- products
CREATE INDEX idx_products_team_id      ON products(team_id);
CREATE INDEX idx_products_brand_id     ON products(brand_id);
CREATE INDEX idx_products_supplier_id  ON products(supplier_id);
CREATE INDEX idx_products_sku_team     ON products(sku_number, team_id);
CREATE INDEX idx_products_type         ON products(type);
CREATE INDEX idx_products_is_active    ON products(is_active);

-- accounts
CREATE INDEX idx_accounts_team_id    ON accounts(team_id);
CREATE INDEX idx_accounts_name       ON accounts(name);
CREATE INDEX idx_accounts_status     ON accounts(status);
CREATE INDEX idx_accounts_is_active  ON accounts(is_active);
CREATE INDEX idx_accounts_city       ON accounts(city);

-- contacts
CREATE INDEX idx_contacts_team_id     ON contacts(team_id);
CREATE INDEX idx_contacts_account_id  ON contacts(account_id);
CREATE INDEX idx_contacts_is_active   ON contacts(is_active);

-- recaps
CREATE INDEX idx_recaps_team_id     ON recaps(team_id);
CREATE INDEX idx_recaps_account_id  ON recaps(account_id);
CREATE INDEX idx_recaps_contact_id  ON recaps(contact_id);
CREATE INDEX idx_recaps_user_id     ON recaps(user_id);
CREATE INDEX idx_recaps_visit_date  ON recaps(visit_date);

-- recap_products
CREATE INDEX idx_recap_products_recap_id     ON recap_products(recap_id);
CREATE INDEX idx_recap_products_product_id   ON recap_products(product_id);
CREATE INDEX idx_recap_products_supplier_id  ON recap_products(supplier_id);
CREATE INDEX idx_recap_products_outcome      ON recap_products(outcome);
CREATE INDEX idx_recap_products_follow_up    ON recap_products(follow_up_required)
  WHERE follow_up_required = TRUE;

-- follow_ups
CREATE INDEX idx_follow_ups_team_id      ON follow_ups(team_id);
CREATE INDEX idx_follow_ups_account_id   ON follow_ups(account_id);
CREATE INDEX idx_follow_ups_product_id   ON follow_ups(product_id);
CREATE INDEX idx_follow_ups_supplier_id  ON follow_ups(supplier_id);
CREATE INDEX idx_follow_ups_assigned_to  ON follow_ups(assigned_to);
CREATE INDEX idx_follow_ups_status       ON follow_ups(status);
CREATE INDEX idx_follow_ups_due_date     ON follow_ups(due_date);
CREATE INDEX idx_follow_ups_status_due   ON follow_ups(status, due_date);


-- ══════════════════════════════════════════════════════════════
-- 6. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

ALTER TABLE suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contracts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands              ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recaps              ENABLE ROW LEVEL SECURITY;
ALTER TABLE recap_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups          ENABLE ROW LEVEL SECURITY;

-- ── suppliers ───────────────────────────────────────────────
-- All authenticated users can read (broker teams browse the supplier list).
-- Writes go through service-role client (platform admin operation).

CREATE POLICY "suppliers_read"
  ON suppliers FOR SELECT
  TO authenticated
  USING (TRUE);

-- ── supplier_users ──────────────────────────────────────────
-- Users can only see and manage their own portal memberships.

CREATE POLICY "supplier_users_own_rows"
  ON supplier_users FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- ── team_members ────────────────────────────────────────────
-- Users see only their own membership rows.

CREATE POLICY "team_members_own_rows"
  ON team_members FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- ── supplier_contracts ──────────────────────────────────────
-- Team-scoped: members see only their team's contracts.

CREATE POLICY "supplier_contracts_team_scoped"
  ON supplier_contracts FOR ALL
  TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

-- ── brands ──────────────────────────────────────────────────
-- Team-scoped: members see only their team's catalog.

CREATE POLICY "brands_team_scoped"
  ON brands FOR ALL
  TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

-- ── products ────────────────────────────────────────────────
-- Broker users: team-scoped full access.
-- Supplier portal users: read-only access to products linked to their supplier.
--   (Separate policies — Postgres evaluates them with OR logic.)

CREATE POLICY "products_team_scoped"
  ON products FOR ALL
  TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "products_supplier_read"
  ON products FOR SELECT
  TO authenticated
  USING (supplier_id IN (
    SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
  ));

-- ── accounts ────────────────────────────────────────────────
-- Broker users: team-scoped full access.
-- Supplier portal users: read accounts where their products have been shown.
--   Contact details are intentionally not exposed (privacy boundary).

CREATE POLICY "accounts_team_scoped"
  ON accounts FOR ALL
  TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "accounts_supplier_read"
  ON accounts FOR SELECT
  TO authenticated
  USING (id IN (
    SELECT r.account_id
    FROM recaps r
    JOIN recap_products rp ON rp.recap_id = r.id
    WHERE rp.supplier_id IN (
      SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
    )
  ));

-- ── contacts ────────────────────────────────────────────────
-- Team-scoped only. Not readable by supplier portal (privacy boundary).

CREATE POLICY "contacts_team_scoped"
  ON contacts FOR ALL
  TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

-- ── recaps ──────────────────────────────────────────────────
-- Team-scoped only. Supplier portal accesses recap context via recap_products.

CREATE POLICY "recaps_team_scoped"
  ON recaps FOR ALL
  TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

-- ── recap_products ──────────────────────────────────────────
-- Broker users: team-scoped via parent recap.
-- Supplier portal users: read rows linked to their supplier.

CREATE POLICY "recap_products_team_scoped"
  ON recap_products FOR ALL
  TO authenticated
  USING (recap_id IN (
    SELECT id FROM recaps
    WHERE team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "recap_products_supplier_read"
  ON recap_products FOR SELECT
  TO authenticated
  USING (supplier_id IN (
    SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
  ));

-- ── follow_ups ──────────────────────────────────────────────
-- Team-scoped only.

CREATE POLICY "follow_ups_team_scoped"
  ON follow_ups FOR ALL
  TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));


-- ══════════════════════════════════════════════════════════════
-- 7. TRIGGERS
-- ══════════════════════════════════════════════════════════════

-- ── updated_at maintenance ──────────────────────────────────

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_supplier_contracts_updated_at
  BEFORE UPDATE ON supplier_contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recaps_updated_at
  BEFORE UPDATE ON recaps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Denormalization: products.supplier_id ───────────────────
-- Synced from brands.supplier_id on INSERT or brand_id change.

CREATE OR REPLACE FUNCTION sync_product_supplier_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    SELECT supplier_id INTO NEW.supplier_id
    FROM brands WHERE id = NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_product_supplier_id
  BEFORE INSERT OR UPDATE OF brand_id ON products
  FOR EACH ROW EXECUTE FUNCTION sync_product_supplier_id();

-- When a brand's supplier_id changes, cascade to all its products.

CREATE OR REPLACE FUNCTION cascade_brand_supplier_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    UPDATE products
    SET supplier_id = NEW.supplier_id
    WHERE brand_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_brand_supplier_id
  AFTER UPDATE OF supplier_id ON brands
  FOR EACH ROW EXECUTE FUNCTION cascade_brand_supplier_id();

-- ── Denormalization: recap_products.supplier_id ─────────────
-- Synced from products.supplier_id on INSERT or product_id change.

CREATE OR REPLACE FUNCTION sync_recap_product_supplier_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT supplier_id INTO NEW.supplier_id
  FROM products WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_recap_product_supplier_id
  BEFORE INSERT OR UPDATE OF product_id ON recap_products
  FOR EACH ROW EXECUTE FUNCTION sync_recap_product_supplier_id();


-- ══════════════════════════════════════════════════════════════
-- 8. VIEWS
-- ══════════════════════════════════════════════════════════════
-- All views are regular (not materialized) so base-table RLS applies
-- automatically — teams only see their own data, supplier portal users
-- only see data for their supplier.

-- v_product_performance
-- SKU-level placement and conversion metrics.

CREATE OR REPLACE VIEW v_product_performance AS
SELECT
  p.id                                                                    AS product_id,
  p.team_id,
  p.sku_number,
  p.wine_name,
  p.type,
  p.varietal,
  p.supplier_id,
  b.name                                                                  AS brand_name,
  p.distributor,
  COUNT(rp.id)                                                            AS times_shown,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')                   AS orders_placed,
  COUNT(rp.id) FILTER (WHERE rp.outcome IN ('Yes Today','Yes Later'))     AS committed,
  ROUND(AVG(rp.order_probability)::NUMERIC, 1)                           AS avg_order_probability,
  CASE
    WHEN COUNT(rp.id) > 0
    THEN ROUND(100.0 * COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today') / COUNT(rp.id), 1)
  END                                                                     AS conversion_rate_pct,
  MAX(r.visit_date)                                                       AS last_shown_date
FROM products p
LEFT JOIN brands          b  ON b.id  = p.brand_id
LEFT JOIN recap_products  rp ON rp.product_id = p.id
LEFT JOIN recaps          r  ON r.id  = rp.recap_id
WHERE p.is_active = TRUE
GROUP BY p.id, p.team_id, p.sku_number, p.wine_name, p.type,
         p.varietal, p.supplier_id, b.name, p.distributor;

-- v_follow_up_queue
-- Actionable follow-up list with full visit context.

CREATE OR REPLACE VIEW v_follow_up_queue AS
SELECT
  fu.id,
  fu.team_id,
  fu.due_date,
  fu.status,
  fu.snoozed_until,
  fu.type,
  fu.notes,
  a.name                                                                  AS account_name,
  TRIM(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, ''))   AS contact_name,
  p.wine_name,
  p.sku_number,
  r.visit_date                                                            AS recap_date,
  r.salesperson,
  rp.outcome,
  rp.buyer_feedback,
  rp.bill_date,
  (fu.due_date < CURRENT_DATE AND fu.status = 'Open')                    AS is_overdue
FROM follow_ups       fu
JOIN  accounts        a   ON a.id  = fu.account_id
LEFT JOIN contacts    c   ON c.id  = fu.contact_id
LEFT JOIN products    p   ON p.id  = fu.product_id
LEFT JOIN recaps      r   ON r.id  = fu.recap_id
LEFT JOIN recap_products rp ON rp.id = fu.recap_product_id
WHERE fu.status IN ('Open','Snoozed')
ORDER BY fu.due_date ASC NULLS LAST;

-- v_supplier_placements
-- Supplier portal: cross-team placement data for a supplier's portfolio.
-- Contact details intentionally excluded (broker privacy boundary).
-- Supplier portal users query this; recap_products RLS filters to their supplier.

CREATE OR REPLACE VIEW v_supplier_placements AS
SELECT
  rp.supplier_id,
  rp.id                     AS recap_product_id,
  rp.outcome,
  rp.order_probability,
  rp.buyer_feedback,
  rp.bill_date,
  r.visit_date,
  r.nature,
  a.name                    AS account_name,
  a.type                    AS account_type,
  a.city                    AS account_city,
  a.state                   AS account_state,
  p.wine_name,
  p.sku_number,
  p.vintage,
  p.type                    AS wine_type,
  b.name                    AS brand_name,
  s.name                    AS supplier_name
FROM recap_products  rp
JOIN recaps          r   ON r.id  = rp.recap_id
JOIN accounts        a   ON a.id  = r.account_id
JOIN products        p   ON p.id  = rp.product_id
JOIN brands          b   ON b.id  = p.brand_id
JOIN suppliers       s   ON s.id  = rp.supplier_id;

-- v_products_by_contact
-- Renamed from v_products_by_buyer.
-- Which products have been shown to which contacts, and with what outcomes.

CREATE OR REPLACE VIEW v_products_by_contact AS
SELECT
  COALESCE(c.id, '00000000-0000-0000-0000-000000000000'::UUID)           AS contact_id,
  TRIM(COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), 'Walk-in')) AS contact_name,
  a.name                                                                  AS account_name,
  p.sku_number,
  p.wine_name,
  p.type,
  COUNT(rp.id)                                                            AS times_shown,
  MAX(r.visit_date)                                                       AS last_shown,
  STRING_AGG(rp.outcome, ', ' ORDER BY r.visit_date)                     AS outcome_history,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')                   AS orders
FROM recap_products  rp
JOIN recaps          r   ON r.id  = rp.recap_id
JOIN products        p   ON p.id  = rp.product_id
JOIN accounts        a   ON a.id  = r.account_id
LEFT JOIN contacts   c   ON c.id  = r.contact_id
GROUP BY c.id, contact_name, a.name, p.sku_number, p.wine_name, p.type
ORDER BY a.name, contact_name, times_shown DESC;


-- ══════════════════════════════════════════════════════════════
-- 9. STORED PROCEDURES
-- ══════════════════════════════════════════════════════════════

-- save_recap
-- Atomically creates a recap, its products, and auto-generated follow_ups.
-- SECURITY DEFINER: bypasses per-row RLS inside the function body while still
-- authenticating via auth.uid(). The team is resolved server-side — never
-- trusted from the client payload.

CREATE OR REPLACE FUNCTION save_recap(
  p_recap     JSONB,
  p_products  JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id     UUID;
  v_account_id  UUID;
  v_contact_id  UUID;
  v_recap_id    UUID;
  v_product     JSONB;
  v_rp_id       UUID;
  v_outcome     TEXT;
  v_follow_date DATE;
  v_product_id  UUID;
  v_supplier_id UUID;
BEGIN
  -- Resolve calling user's team
  SELECT team_id INTO v_team_id
  FROM team_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: caller is not a member of any team';
  END IF;

  -- Validate account belongs to this team
  v_account_id := (p_recap->>'account_id')::UUID;

  IF NOT EXISTS (
    SELECT 1 FROM accounts
    WHERE id = v_account_id AND team_id = v_team_id
  ) THEN
    RAISE EXCEPTION 'Forbidden: account % does not belong to team %',
      v_account_id, v_team_id;
  END IF;

  v_contact_id := NULLIF(p_recap->>'contact_id', '')::UUID;

  -- Insert recap
  INSERT INTO recaps (
    team_id,
    account_id,
    contact_id,
    user_id,
    visit_date,
    salesperson,
    nature,
    expense_receipt_url,
    notes
  ) VALUES (
    v_team_id,
    v_account_id,
    v_contact_id,
    NULLIF(p_recap->>'user_id', '')::UUID,
    (p_recap->>'visit_date')::DATE,
    p_recap->>'salesperson',
    COALESCE(NULLIF(p_recap->>'nature', ''), 'Sales Call'),
    NULLIF(p_recap->>'expense_receipt_url', ''),
    NULLIF(p_recap->>'notes', '')
  )
  RETURNING id INTO v_recap_id;

  -- Process each product
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    v_outcome     := v_product->>'outcome';
    v_follow_date := NULLIF(v_product->>'follow_up_date', '')::DATE;
    v_product_id  := (v_product->>'product_id')::UUID;

    -- supplier_id populated automatically by trg_sync_recap_product_supplier_id
    INSERT INTO recap_products (
      recap_id,
      product_id,
      outcome,
      order_probability,
      buyer_feedback,
      follow_up_required,
      follow_up_date,
      bill_date
    ) VALUES (
      v_recap_id,
      v_product_id,
      v_outcome,
      NULLIF(v_product->>'order_probability', '')::INTEGER,
      NULLIF(v_product->>'buyer_feedback', ''),
      v_outcome IN ('Yes Later','Maybe Later'),
      v_follow_date,
      NULLIF(v_product->>'bill_date', '')::DATE
    )
    RETURNING id INTO v_rp_id;

    -- Auto-generate follow_up for actionable outcomes
    IF v_outcome IN ('Yes Later','Maybe Later') THEN
      SELECT supplier_id INTO v_supplier_id
      FROM products WHERE id = v_product_id;

      INSERT INTO follow_ups (
        team_id,
        recap_product_id,
        recap_id,
        account_id,
        contact_id,
        product_id,
        supplier_id,
        due_date,
        type,
        status
      ) VALUES (
        v_team_id,
        v_rp_id,
        v_recap_id,
        v_account_id,
        v_contact_id,
        v_product_id,
        v_supplier_id,
        v_follow_date,
        'Visit',
        'Open'
      );
    END IF;
  END LOOP;

  RETURN v_recap_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;


-- ══════════════════════════════════════════════════════════════
-- 10. USER ONBOARDING HELPERS
-- ══════════════════════════════════════════════════════════════
-- These functions run via the service-role client (bypasses RLS).
-- Use the scripts/add-beta-user.sql wrapper for day-to-day onboarding.

-- add_broker_user
-- Onboards a broker team member. Pass p_team_id to add to an existing team,
-- or omit it to create a new team (first owner joining the platform).

CREATE OR REPLACE FUNCTION add_broker_user(
  p_email    TEXT,
  p_role     TEXT DEFAULT 'member',
  p_team_id  UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id  UUID;
  v_team_id  UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User % not found in auth.users — they must sign up first', p_email;
  END IF;

  v_team_id := COALESCE(p_team_id, gen_random_uuid());

  INSERT INTO team_members (user_id, team_id, role)
  VALUES (v_user_id, v_team_id, p_role)
  ON CONFLICT (user_id, team_id) DO UPDATE SET role = EXCLUDED.role;

  -- Store team_id in user metadata so the app can read it client-side
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data ||
    jsonb_build_object('team_id', v_team_id)
  WHERE id = v_user_id;
END;
$$;

-- add_supplier_user
-- Onboards a supplier portal user. The supplier record must already exist.

CREATE OR REPLACE FUNCTION add_supplier_user(
  p_email        TEXT,
  p_supplier_id  UUID,
  p_role         TEXT DEFAULT 'viewer'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User % not found in auth.users — they must sign up first', p_email;
  END IF;

  INSERT INTO supplier_users (user_id, supplier_id, role)
  VALUES (v_user_id, p_supplier_id, p_role)
  ON CONFLICT (user_id, supplier_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
