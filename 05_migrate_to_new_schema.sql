-- ============================================================
-- 05_migrate_to_new_schema.sql
-- Wine CRM — Incremental migration to Option B Hybrid architecture
--
-- Migrates an existing database (01/02/03 schema) to the new
-- clean architecture defined in 04_schema_rework.sql.
--
-- Safe to run against a live database with existing data.
-- Idempotent: every step checks state before executing.
--
-- Key changes:
--   clients       → accounts   (company_name → name)
--   buyers        → contacts   (contact_name → first_name, client_id → account_id)
--   recaps        : client_id → account_id, buyer_id → contact_id
--   follow_ups    : client_id → account_id; add team_id, contact_id, supplier_id, etc.
--   brands        : add supplier_id (UUID FK), description; drop text supplier column
--   products      : add supplier_id, tasting_notes, description
--   recap_products: add supplier_id
--   NEW TABLES    : suppliers, supplier_users, supplier_contracts
-- ============================================================

BEGIN;


-- ══════════════════════════════════════════════════════════════
-- SECTION 1: PLATFORM TABLES (new — safe IF NOT EXISTS)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS suppliers (
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

CREATE TABLE IF NOT EXISTS supplier_users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  supplier_id  UUID        NOT NULL REFERENCES suppliers(id)   ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS supplier_contracts (
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
-- SECTION 2: BRANDS — add supplier FK, description; drop old text supplier
-- ══════════════════════════════════════════════════════════════

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS supplier_id  UUID REFERENCES suppliers(id) ON DELETE SET NULL;

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS description  TEXT;

-- Drop the old free-text supplier column (data was never relied on for queries)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'supplier'
  ) THEN
    ALTER TABLE brands DROP COLUMN supplier;
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- SECTION 3: PRODUCTS — add supplier_id, tasting_notes, description
-- ══════════════════════════════════════════════════════════════

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS supplier_id   UUID REFERENCES suppliers(id) ON DELETE SET NULL;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tasting_notes TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description   TEXT;


-- ══════════════════════════════════════════════════════════════
-- SECTION 4: RENAME clients → accounts
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients')
  AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'accounts')
  THEN
    ALTER TABLE clients RENAME TO accounts;
  END IF;
END $$;

-- Rename company_name → name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'company_name'
  ) THEN
    ALTER TABLE accounts RENAME COLUMN company_name TO name;
  END IF;
END $$;

-- Add location columns
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS city    TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS state   TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS country TEXT;

-- Note: contact_name column on accounts is left in place (harmless, contains stale data).
-- Individual contacts now live in the contacts table.


-- ══════════════════════════════════════════════════════════════
-- SECTION 5: RENAME buyers → contacts
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'buyers')
  AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contacts')
  THEN
    ALTER TABLE buyers RENAME TO contacts;
  END IF;
END $$;

-- Rename contact_name → first_name (existing data is the full name; last_name stays NULL)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'contact_name'
  ) THEN
    ALTER TABLE contacts RENAME COLUMN contact_name TO first_name;
  END IF;
END $$;

-- Add last_name
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name TEXT;

-- Rename client_id → account_id on contacts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE contacts RENAME COLUMN client_id TO account_id;
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- SECTION 6: RECAPS — rename client_id → account_id, buyer_id → contact_id
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recaps' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE recaps RENAME COLUMN client_id TO account_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'recaps' AND column_name = 'buyer_id'
  ) THEN
    ALTER TABLE recaps RENAME COLUMN buyer_id TO contact_id;
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════
-- SECTION 7: RECAP_PRODUCTS — add supplier_id
-- ══════════════════════════════════════════════════════════════

ALTER TABLE recap_products
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;


-- ══════════════════════════════════════════════════════════════
-- SECTION 8: FOLLOW_UPS — rename client_id → account_id; add new columns
-- ══════════════════════════════════════════════════════════════

-- Rename client_id → account_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follow_ups' AND column_name = 'client_id'
  ) THEN
    ALTER TABLE follow_ups RENAME COLUMN client_id TO account_id;
  END IF;
END $$;

-- Add team_id (nullable first so we can backfill)
ALTER TABLE follow_ups ADD COLUMN IF NOT EXISTS team_id UUID;

-- Backfill team_id from the parent recap (all existing follow_ups have a recap_id)
UPDATE follow_ups fu
SET    team_id = r.team_id
FROM   recaps r
WHERE  fu.recap_id = r.id
AND    fu.team_id IS NULL;

-- Fallback: derive from account if recap backfill missed any rows
UPDATE follow_ups fu
SET    team_id = a.team_id
FROM   accounts a
WHERE  fu.account_id = a.id
AND    fu.team_id IS NULL;

-- Now add contact_id, supplier_id, assigned_to, type
ALTER TABLE follow_ups
  ADD COLUMN IF NOT EXISTS contact_id   UUID REFERENCES contacts(id)    ON DELETE SET NULL;

ALTER TABLE follow_ups
  ADD COLUMN IF NOT EXISTS supplier_id  UUID REFERENCES suppliers(id)   ON DELETE SET NULL;

ALTER TABLE follow_ups
  ADD COLUMN IF NOT EXISTS assigned_to  UUID REFERENCES auth.users(id)  ON DELETE SET NULL;

-- type column (add if absent; existing rows get default 'Visit')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'follow_ups' AND column_name = 'type'
  ) THEN
    ALTER TABLE follow_ups
      ADD COLUMN type TEXT NOT NULL DEFAULT 'Visit'
        CHECK (type IN ('Call','Visit','Email','Sample'));
  END IF;
END $$;

-- Backfill contact_id from parent recap
UPDATE follow_ups fu
SET    contact_id = r.contact_id
FROM   recaps r
WHERE  fu.recap_id = r.id
AND    fu.contact_id IS NULL
AND    r.contact_id IS NOT NULL;


-- ══════════════════════════════════════════════════════════════
-- SECTION 9: INDEXES
-- ══════════════════════════════════════════════════════════════

-- suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_name       ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active  ON suppliers(is_active);

-- supplier_users
CREATE INDEX IF NOT EXISTS idx_supplier_users_user_id      ON supplier_users(user_id);
CREATE INDEX IF NOT EXISTS idx_supplier_users_supplier_id  ON supplier_users(supplier_id);

-- supplier_contracts
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_team_id      ON supplier_contracts(team_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_supplier_id  ON supplier_contracts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_contracts_status       ON supplier_contracts(status);

-- brands (new columns)
CREATE INDEX IF NOT EXISTS idx_brands_supplier_id  ON brands(supplier_id);

-- products (new columns)
CREATE INDEX IF NOT EXISTS idx_products_supplier_id  ON products(supplier_id);

-- accounts (renamed from clients — existing indexes survive rename, new ones added)
CREATE INDEX IF NOT EXISTS idx_accounts_team_id    ON accounts(team_id);
CREATE INDEX IF NOT EXISTS idx_accounts_name       ON accounts(name);
CREATE INDEX IF NOT EXISTS idx_accounts_status     ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_is_active  ON accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_accounts_city       ON accounts(city);

-- contacts (renamed from buyers)
CREATE INDEX IF NOT EXISTS idx_contacts_team_id     ON contacts(team_id);
CREATE INDEX IF NOT EXISTS idx_contacts_account_id  ON contacts(account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_is_active   ON contacts(is_active);

-- recaps (new column names)
CREATE INDEX IF NOT EXISTS idx_recaps_account_id  ON recaps(account_id);
CREATE INDEX IF NOT EXISTS idx_recaps_contact_id  ON recaps(contact_id);

-- recap_products (new column)
CREATE INDEX IF NOT EXISTS idx_recap_products_supplier_id  ON recap_products(supplier_id);

-- follow_ups (new columns)
CREATE INDEX IF NOT EXISTS idx_follow_ups_team_id      ON follow_ups(team_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_contact_id   ON follow_ups(contact_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_supplier_id  ON follow_ups(supplier_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned_to  ON follow_ups(assigned_to);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status_due   ON follow_ups(status, due_date);


-- ══════════════════════════════════════════════════════════════
-- SECTION 10: ROW LEVEL SECURITY
-- Enable RLS on new tables; replace policies on renamed tables.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_users      ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_contracts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups          ENABLE ROW LEVEL SECURITY;

-- suppliers: all authenticated users can read
DROP POLICY IF EXISTS "suppliers_read" ON suppliers;
CREATE POLICY "suppliers_read" ON suppliers
  FOR SELECT TO authenticated USING (TRUE);

-- supplier_users: own rows only
DROP POLICY IF EXISTS "supplier_users_own_rows" ON supplier_users;
CREATE POLICY "supplier_users_own_rows" ON supplier_users
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- team_members: own rows only (replace old policy if any)
DROP POLICY IF EXISTS "team_members_own_rows" ON team_members;
DROP POLICY IF EXISTS "team_scoped"           ON team_members;
CREATE POLICY "team_members_own_rows" ON team_members
  FOR ALL TO authenticated USING (user_id = auth.uid());

-- supplier_contracts: team-scoped
DROP POLICY IF EXISTS "supplier_contracts_team_scoped" ON supplier_contracts;
CREATE POLICY "supplier_contracts_team_scoped" ON supplier_contracts
  FOR ALL TO authenticated
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- brands: replace old policies with new name
DROP POLICY IF EXISTS "brands_team_scoped" ON brands;
DROP POLICY IF EXISTS "team_scoped"        ON brands;
DROP POLICY IF EXISTS "authenticated_all"  ON brands;
CREATE POLICY "brands_team_scoped" ON brands
  FOR ALL TO authenticated
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- products: broker full access + supplier read-only
DROP POLICY IF EXISTS "products_team_scoped"   ON products;
DROP POLICY IF EXISTS "products_supplier_read" ON products;
DROP POLICY IF EXISTS "team_scoped"            ON products;
DROP POLICY IF EXISTS "authenticated_all"      ON products;
CREATE POLICY "products_team_scoped" ON products
  FOR ALL TO authenticated
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "products_supplier_read" ON products
  FOR SELECT TO authenticated
  USING (supplier_id IN (SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()));

-- accounts (was clients)
DROP POLICY IF EXISTS "accounts_team_scoped"   ON accounts;
DROP POLICY IF EXISTS "accounts_supplier_read" ON accounts;
DROP POLICY IF EXISTS "clients_team_scoped"    ON accounts;
DROP POLICY IF EXISTS "team_scoped"            ON accounts;
DROP POLICY IF EXISTS "authenticated_all"      ON accounts;
CREATE POLICY "accounts_team_scoped" ON accounts
  FOR ALL TO authenticated
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));
CREATE POLICY "accounts_supplier_read" ON accounts
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT r.account_id FROM recaps r
    JOIN recap_products rp ON rp.recap_id = r.id
    WHERE rp.supplier_id IN (
      SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
    )
  ));

-- contacts (was buyers)
DROP POLICY IF EXISTS "contacts_team_scoped" ON contacts;
DROP POLICY IF EXISTS "buyers_team_scoped"   ON contacts;
DROP POLICY IF EXISTS "team_scoped"          ON contacts;
DROP POLICY IF EXISTS "authenticated_all"    ON contacts;
CREATE POLICY "contacts_team_scoped" ON contacts
  FOR ALL TO authenticated
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- recaps: replace old policy
DROP POLICY IF EXISTS "recaps_team_scoped" ON recaps;
DROP POLICY IF EXISTS "team_scoped"        ON recaps;
DROP POLICY IF EXISTS "authenticated_all"  ON recaps;
CREATE POLICY "recaps_team_scoped" ON recaps
  FOR ALL TO authenticated
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- recap_products: replace old policies
DROP POLICY IF EXISTS "recap_products_team_scoped"   ON recap_products;
DROP POLICY IF EXISTS "recap_products_supplier_read" ON recap_products;
DROP POLICY IF EXISTS "team_scoped"                  ON recap_products;
DROP POLICY IF EXISTS "authenticated_all"            ON recap_products;
CREATE POLICY "recap_products_team_scoped" ON recap_products
  FOR ALL TO authenticated
  USING (recap_id IN (
    SELECT id FROM recaps
    WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
  ));
CREATE POLICY "recap_products_supplier_read" ON recap_products
  FOR SELECT TO authenticated
  USING (supplier_id IN (SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()));

-- follow_ups: replace old policy (was scoped to client_id IN clients)
DROP POLICY IF EXISTS "follow_ups_team_scoped" ON follow_ups;
DROP POLICY IF EXISTS "team_scoped"            ON follow_ups;
DROP POLICY IF EXISTS "authenticated_all"      ON follow_ups;
CREATE POLICY "follow_ups_team_scoped" ON follow_ups
  FOR ALL TO authenticated
  USING (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));


-- ══════════════════════════════════════════════════════════════
-- SECTION 11: TRIGGERS
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- New table triggers
DROP TRIGGER IF EXISTS trg_suppliers_updated_at ON suppliers;
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_contracts_updated_at ON supplier_contracts;
CREATE TRIGGER trg_supplier_contracts_updated_at
  BEFORE UPDATE ON supplier_contracts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Renamed table triggers (recreate to ensure correct naming)
DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
DROP TRIGGER IF EXISTS trg_clients_updated_at  ON accounts;
CREATE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
DROP TRIGGER IF EXISTS trg_buyers_updated_at   ON contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_follow_ups_updated_at ON follow_ups;
CREATE TRIGGER trg_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Denormalization: products.supplier_id ← brands.supplier_id
CREATE OR REPLACE FUNCTION sync_product_supplier_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.brand_id IS NOT NULL THEN
    SELECT supplier_id INTO NEW.supplier_id FROM brands WHERE id = NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_product_supplier_id ON products;
CREATE TRIGGER trg_sync_product_supplier_id
  BEFORE INSERT OR UPDATE OF brand_id ON products
  FOR EACH ROW EXECUTE FUNCTION sync_product_supplier_id();

-- Cascade brand supplier change to all its products
CREATE OR REPLACE FUNCTION cascade_brand_supplier_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    UPDATE products SET supplier_id = NEW.supplier_id WHERE brand_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cascade_brand_supplier_id ON brands;
CREATE TRIGGER trg_cascade_brand_supplier_id
  AFTER UPDATE OF supplier_id ON brands
  FOR EACH ROW EXECUTE FUNCTION cascade_brand_supplier_id();

-- Denormalization: recap_products.supplier_id ← products.supplier_id
CREATE OR REPLACE FUNCTION sync_recap_product_supplier_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT supplier_id INTO NEW.supplier_id FROM products WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_recap_product_supplier_id ON recap_products;
CREATE TRIGGER trg_sync_recap_product_supplier_id
  BEFORE INSERT OR UPDATE OF product_id ON recap_products
  FOR EACH ROW EXECUTE FUNCTION sync_recap_product_supplier_id();


-- ══════════════════════════════════════════════════════════════
-- SECTION 12: VIEWS (drop old, create new)
-- ══════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS v_products_by_buyer   CASCADE;
DROP VIEW IF EXISTS v_follow_up_queue     CASCADE;
DROP VIEW IF EXISTS v_product_performance CASCADE;
DROP VIEW IF EXISTS v_supplier_placements CASCADE;
DROP VIEW IF EXISTS v_products_by_contact CASCADE;

-- v_product_performance
CREATE VIEW v_product_performance AS
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
CREATE VIEW v_follow_up_queue AS
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
CREATE VIEW v_supplier_placements AS
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
CREATE VIEW v_products_by_contact AS
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
-- SECTION 13: STORED PROCEDURES
-- ══════════════════════════════════════════════════════════════

-- save_recap: updated for new column names (account_id, contact_id)
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

REVOKE ALL    ON FUNCTION save_recap(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_recap(JSONB, JSONB) TO authenticated;

-- add_broker_user (unchanged logic, recreate for completeness)
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

  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data ||
    jsonb_build_object('team_id', v_team_id)
  WHERE id = v_user_id;
END;
$$;

-- add_supplier_user
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


COMMIT;
