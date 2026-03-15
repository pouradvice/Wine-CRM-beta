-- ============================================================
-- Pour Advice CRM — Phase 1 Database Schema
-- Target: Supabase (PostgreSQL 15+)
-- ============================================================

-- Enable UUID extension (already enabled on Supabase by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- BRANDS
-- Wine/beverage brands (owned by suppliers)
-- ============================================================
CREATE TABLE brands (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  supplier    TEXT,                      -- free-text supplier name for Phase 1
  country     TEXT,
  region      TEXT,
  website     TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_brands_name ON brands (name);
CREATE INDEX idx_brands_is_active ON brands (is_active);

-- ============================================================
-- PRODUCTS
-- Individual SKUs in the portfolio
-- ============================================================
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_number      TEXT NOT NULL UNIQUE,
  wine_name       TEXT NOT NULL,
  brand_id        UUID REFERENCES brands (id) ON DELETE SET NULL,
  -- Classification
  type            TEXT,                  -- 'Red', 'White', 'Rosé', 'Sparkling', 'Dessert', 'Spirit', etc.
  varietal        TEXT,
  country         TEXT,
  region          TEXT,
  appellation     TEXT,
  vintage         TEXT,
  -- Pricing
  btg_cost        NUMERIC(10, 2),        -- by-the-glass cost
  three_cs_cost   NUMERIC(10, 2),        -- 3-case cost
  frontline_cost  NUMERIC(10, 2),
  -- Distribution
  distributor     TEXT,
  -- Assets
  tech_sheet_url  TEXT,                  -- Supabase Storage URL
  -- Metadata
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON products (sku_number);
CREATE INDEX idx_products_brand_id ON products (brand_id);
CREATE INDEX idx_products_is_active ON products (is_active);
CREATE INDEX idx_products_type ON products (type);

-- ============================================================
-- CLIENTS
-- Accounts (restaurants, wine shops, hotels, etc.)
-- ============================================================
CREATE TABLE clients (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name     TEXT NOT NULL,
  type             TEXT,                 -- 'Restaurant', 'Retail', 'Hotel', 'Bar', etc.
  value_tier       TEXT,                 -- 'A', 'B', 'C' or 'High', 'Mid', 'Low'
  -- Contact
  contact_name     TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  -- Commercial terms
  commission_pct   NUMERIC(5, 2),
  billback_pct     NUMERIC(5, 2),
  contract_length  TEXT,
  date_active_from DATE,
  date_active_to   DATE,
  account_lead     TEXT,                 -- salesperson name (auth user link deferred to Phase 2)
  -- Status
  status           TEXT NOT NULL DEFAULT 'Active'
                     CHECK (status IN ('Active', 'Prospective', 'Former')),
  notes            TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clients_status ON clients (status);
CREATE INDEX idx_clients_company_name ON clients (company_name);
CREATE INDEX idx_clients_is_active ON clients (is_active);

-- ============================================================
-- BUYERS
-- Individual contacts within a client account
-- ============================================================
CREATE TABLE buyers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id    UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  role         TEXT,                     -- 'Sommelier', 'GM', 'Buyer', 'Owner', etc.
  phone        TEXT,
  email        TEXT,
  premise_type TEXT,                     -- 'On-Premise', 'Off-Premise'
  notes        TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buyers_client_id ON buyers (client_id);
CREATE INDEX idx_buyers_is_active ON buyers (is_active);

-- ============================================================
-- RECAPS
-- Individual tasting visit records
-- ============================================================
CREATE TABLE recaps (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visit_date     DATE NOT NULL,
  salesperson    TEXT NOT NULL,          -- auth user display name
  client_id      UUID NOT NULL REFERENCES clients (id) ON DELETE RESTRICT,
  buyer_id       UUID REFERENCES buyers (id) ON DELETE SET NULL,
  nature         TEXT NOT NULL DEFAULT 'Sales Call'
                   CHECK (nature IN ('Sales Call', 'Depletion Meeting')),
  -- For Depletion Meetings
  expense_receipt_url TEXT,             -- Supabase Storage URL
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recaps_client_id ON recaps (client_id);
CREATE INDEX idx_recaps_buyer_id ON recaps (buyer_id);
CREATE INDEX idx_recaps_visit_date ON recaps (visit_date DESC);
CREATE INDEX idx_recaps_salesperson ON recaps (salesperson);

-- ============================================================
-- RECAP_PRODUCTS
-- Junction: which products were shown at a recap, with feedback
-- ============================================================
CREATE TABLE recap_products (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recap_id           UUID NOT NULL REFERENCES recaps (id) ON DELETE CASCADE,
  product_id         UUID NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  -- Feedback
  outcome            TEXT NOT NULL DEFAULT 'Discussed'
                       CHECK (outcome IN (
                         'Yes Today',    -- ordered on the spot
                         'Yes Later',    -- committed for future order
                         'Maybe Later',  -- interested, needs follow-up
                         'No',           -- passed
                         'Discussed'     -- mentioned but not formally presented
                       )),
  order_probability  INTEGER CHECK (order_probability BETWEEN 0 AND 100),
  buyer_feedback     TEXT,
  follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_date     DATE,              -- for 'Yes Later' / 'Maybe Later'
  bill_date          DATE,              -- for 'Yes Later' committed orders
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Each product appears once per recap
  UNIQUE (recap_id, product_id)
);

CREATE INDEX idx_recap_products_recap_id ON recap_products (recap_id);
CREATE INDEX idx_recap_products_product_id ON recap_products (product_id);
CREATE INDEX idx_recap_products_outcome ON recap_products (outcome);
CREATE INDEX idx_recap_products_follow_up ON recap_products (follow_up_required)
  WHERE follow_up_required = TRUE;

-- ============================================================
-- FOLLOW_UPS
-- Derived queue — auto-generated from recap_products
-- Can also be created manually
-- ============================================================
CREATE TABLE follow_ups (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recap_product_id  UUID NOT NULL REFERENCES recap_products (id) ON DELETE CASCADE,
  recap_id          UUID NOT NULL REFERENCES recaps (id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES clients (id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  due_date          DATE,
  status            TEXT NOT NULL DEFAULT 'Open'
                      CHECK (status IN ('Open', 'Snoozed', 'Completed')),
  snoozed_until     DATE,
  completed_at      TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_follow_ups_status ON follow_ups (status);
CREATE INDEX idx_follow_ups_due_date ON follow_ups (due_date);
CREATE INDEX idx_follow_ups_client_id ON follow_ups (client_id);
CREATE INDEX idx_follow_ups_product_id ON follow_ups (product_id);

-- ============================================================
-- ANALYTICS VIEWS
-- ============================================================

-- Product performance summary
CREATE OR REPLACE VIEW v_product_performance AS
SELECT
  p.id                                                   AS product_id,
  p.sku_number,
  p.wine_name,
  p.type,
  p.varietal,
  b.name                                                 AS brand_name,
  p.distributor,
  COUNT(rp.id)                                           AS times_shown,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')  AS orders_placed,
  COUNT(rp.id) FILTER (WHERE rp.outcome IN ('Yes Today','Yes Later')) AS committed,
  ROUND(
    AVG(rp.order_probability) FILTER (WHERE rp.order_probability IS NOT NULL),
    1
  )                                                      AS avg_order_probability,
  ROUND(
    100.0 * COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')
    / NULLIF(COUNT(rp.id), 0),
    1
  )                                                      AS conversion_rate_pct,
  MAX(r.visit_date)                                      AS last_shown_date
FROM products p
LEFT JOIN brands b ON b.id = p.brand_id
LEFT JOIN recap_products rp ON rp.product_id = p.id
LEFT JOIN recaps r ON r.id = rp.recap_id
WHERE p.is_active = TRUE
GROUP BY p.id, p.sku_number, p.wine_name, p.type, p.varietal, b.name, p.distributor;

-- Open follow-up queue with context
CREATE OR REPLACE VIEW v_follow_up_queue AS
SELECT
  fu.id,
  fu.due_date,
  fu.status,
  fu.snoozed_until,
  c.company_name                               AS client_name,
  bu.contact_name                              AS buyer_name,
  p.wine_name,
  p.sku_number,
  r.visit_date                                 AS recap_date,
  r.salesperson,
  rp.outcome,
  rp.buyer_feedback,
  rp.bill_date,
  CASE WHEN fu.due_date < CURRENT_DATE AND fu.status = 'Open'
       THEN TRUE ELSE FALSE END                AS is_overdue
FROM follow_ups fu
JOIN clients c      ON c.id = fu.client_id
JOIN products p     ON p.id = fu.product_id
JOIN recaps r       ON r.id = fu.recap_id
JOIN recap_products rp ON rp.id = fu.recap_product_id
LEFT JOIN buyers bu ON bu.id = r.buyer_id
WHERE fu.status IN ('Open', 'Snoozed')
ORDER BY fu.due_date ASC NULLS LAST;

-- Products by buyer report
CREATE OR REPLACE VIEW v_products_by_buyer AS
SELECT
  bu.id                   AS buyer_id,
  bu.contact_name         AS buyer_name,
  c.company_name          AS client_name,
  p.sku_number,
  p.wine_name,
  p.type,
  COUNT(rp.id)            AS times_shown,
  MAX(r.visit_date)       AS last_shown,
  STRING_AGG(
    rp.outcome || COALESCE(' (' || TO_CHAR(r.visit_date, 'YYYY-MM-DD') || ')', ''),
    ', ' ORDER BY r.visit_date DESC
  )                       AS outcome_history,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today') AS orders
FROM recap_products rp
JOIN recaps r       ON r.id = rp.recap_id
JOIN products p     ON p.id = rp.product_id
JOIN clients c      ON c.id = r.client_id
LEFT JOIN buyers bu ON bu.id = r.buyer_id
GROUP BY bu.id, bu.contact_name, c.company_name, p.sku_number, p.wine_name, p.type
ORDER BY c.company_name, bu.contact_name, times_shown DESC;

-- ============================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_buyers_updated_at
  BEFORE UPDATE ON buyers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_recaps_updated_at
  BEFORE UPDATE ON recaps
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_follow_ups_updated_at
  BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- Enable on all tables — policies added once auth users are configured
-- ============================================================
ALTER TABLE brands          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recaps          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recap_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_ups      ENABLE ROW LEVEL SECURITY;

-- Phase 1: single-tenant, all authenticated users can read/write everything
-- Replace with team-scoped policies in Phase 2+
CREATE POLICY "authenticated_all" ON brands
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "authenticated_all" ON products
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "authenticated_all" ON clients
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "authenticated_all" ON buyers
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "authenticated_all" ON recaps
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "authenticated_all" ON recap_products
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "authenticated_all" ON follow_ups
  FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
