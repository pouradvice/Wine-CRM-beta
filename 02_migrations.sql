-- ============================================================
-- Pour Advice CRM — Migration 02
-- Scalability corrections before Phase 2
-- Run in Supabase SQL editor in a single transaction.
-- ============================================================

-- ============================================================
-- ITEM 1 — Atomic recap save RPC
-- PL/pgSQL function wrapping all three inserts in one transaction.
-- Called from saveRecap() in data.ts via sb.rpc('save_recap', {...})
-- ============================================================

CREATE OR REPLACE FUNCTION save_recap(
  p_recap    JSONB,
  p_products JSONB   -- array of product objects
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recap_id       UUID;
  v_rp_id          UUID;
  v_product        JSONB;
  v_follow_up_required BOOLEAN;
  v_due_date       DATE;
BEGIN
  -- ── Insert recap ──────────────────────────────────────────
  INSERT INTO recaps (
    visit_date,
    salesperson,
    user_id,
    client_id,
    buyer_id,
    nature,
    expense_receipt_url,
    notes
  )
  VALUES (
    (p_recap->>'visit_date')::DATE,
    p_recap->>'salesperson',
    (p_recap->>'user_id')::UUID,
    (p_recap->>'client_id')::UUID,
    NULLIF(p_recap->>'buyer_id', '')::UUID,
    p_recap->>'nature',
    NULLIF(p_recap->>'expense_receipt_url', ''),
    NULLIF(p_recap->>'notes', '')
  )
  RETURNING id INTO v_recap_id;

  -- ── Insert recap_products + generate follow_ups ───────────
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_products)
  LOOP
    v_follow_up_required :=
      (v_product->>'outcome') IN ('Yes Later', 'Maybe Later');

    v_due_date := COALESCE(
      NULLIF(v_product->>'follow_up_date', '')::DATE,
      NULLIF(v_product->>'bill_date', '')::DATE
    );

    INSERT INTO recap_products (
      recap_id,
      product_id,
      outcome,
      order_probability,
      buyer_feedback,
      follow_up_required,
      follow_up_date,
      bill_date
    )
    VALUES (
      v_recap_id,
      (v_product->>'product_id')::UUID,
      v_product->>'outcome',
      NULLIF(v_product->>'order_probability', '')::INTEGER,
      NULLIF(v_product->>'buyer_feedback', ''),
      v_follow_up_required,
      NULLIF(v_product->>'follow_up_date', '')::DATE,
      NULLIF(v_product->>'bill_date', '')::DATE
    )
    RETURNING id INTO v_rp_id;

    -- Auto-generate follow_up when outcome requires it
    IF v_follow_up_required THEN
      INSERT INTO follow_ups (
        recap_product_id,
        recap_id,
        client_id,
        product_id,
        due_date,
        status
      )
      VALUES (
        v_rp_id,
        v_recap_id,
        (p_recap->>'client_id')::UUID,
        (v_product->>'product_id')::UUID,
        v_due_date,
        'Open'
      );
    END IF;
  END LOOP;

  RETURN v_recap_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise — Postgres rolls back the entire transaction automatically
    RAISE;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION save_recap(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_recap(JSONB, JSONB) TO authenticated;


-- ============================================================
-- ITEM 2 — Add user_id to recaps
-- ============================================================

ALTER TABLE recaps
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recaps_user_id ON recaps (user_id);


-- ============================================================
-- ITEM 3 — Materialize analytics views
-- Step 1: drop the regular views
-- Step 2: create materialized views
-- Step 3: create unique indexes (required for CONCURRENTLY refresh)
-- Step 4: add missing base-table composite indexes
-- ============================================================

-- Drop regular views first
DROP VIEW IF EXISTS v_product_performance;
DROP VIEW IF EXISTS v_follow_up_queue;
DROP VIEW IF EXISTS v_products_by_buyer;

-- ── Materialized: v_product_performance ──────────────────────
CREATE MATERIALIZED VIEW v_product_performance AS
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
LEFT JOIN brands b          ON b.id = p.brand_id
LEFT JOIN recap_products rp ON rp.product_id = p.id
LEFT JOIN recaps r           ON r.id = rp.recap_id
WHERE p.is_active = TRUE
GROUP BY p.id, p.sku_number, p.wine_name, p.type, p.varietal, b.name, p.distributor
WITH DATA;

-- Unique index — required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_product_performance_product_id
  ON v_product_performance (product_id);

-- ── Materialized: v_follow_up_queue ──────────────────────────
CREATE MATERIALIZED VIEW v_follow_up_queue AS
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
JOIN clients c         ON c.id = fu.client_id
JOIN products p        ON p.id = fu.product_id
JOIN recaps r          ON r.id = fu.recap_id
JOIN recap_products rp ON rp.id = fu.recap_product_id
LEFT JOIN buyers bu    ON bu.id = r.buyer_id
WHERE fu.status IN ('Open', 'Snoozed')
WITH DATA;

-- Unique index — required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_follow_up_queue_id
  ON v_follow_up_queue (id);

-- Supporting sort index
CREATE INDEX idx_mv_follow_up_queue_due_date
  ON v_follow_up_queue (due_date ASC NULLS LAST);

-- ── Materialized: v_products_by_buyer ────────────────────────
CREATE MATERIALIZED VIEW v_products_by_buyer AS
SELECT
  -- Stable surrogate: buyer may be null (walk-in), use COALESCE to a nil UUID
  COALESCE(bu.id, '00000000-0000-0000-0000-000000000000'::UUID) AS buyer_id,
  bu.contact_name                                               AS buyer_name,
  c.company_name                                                AS client_name,
  p.sku_number,
  p.wine_name,
  p.type,
  COUNT(rp.id)                                                  AS times_shown,
  MAX(r.visit_date)                                             AS last_shown,
  STRING_AGG(
    rp.outcome || COALESCE(' (' || TO_CHAR(r.visit_date, 'YYYY-MM-DD') || ')', ''),
    ', ' ORDER BY r.visit_date DESC
  )                                                             AS outcome_history,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')         AS orders
FROM recap_products rp
JOIN recaps r       ON r.id = rp.recap_id
JOIN products p     ON p.id = rp.product_id
JOIN clients c      ON c.id = r.client_id
LEFT JOIN buyers bu ON bu.id = r.buyer_id
GROUP BY
  COALESCE(bu.id, '00000000-0000-0000-0000-000000000000'::UUID),
  bu.contact_name,
  c.company_name,
  p.sku_number,
  p.wine_name,
  p.type
WITH DATA;

-- Unique index on (buyer_id, sku_number) — required for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX idx_mv_products_by_buyer_key
  ON v_products_by_buyer (buyer_id, sku_number);

-- ── New base-table composite indexes ─────────────────────────
-- Covers outcome-filtered aggregates in the performance view
CREATE INDEX IF NOT EXISTS idx_recap_products_product_outcome
  ON recap_products (product_id, outcome);

-- Covers the open queue filter used in the follow-up view
CREATE INDEX IF NOT EXISTS idx_follow_ups_status_due_date
  ON follow_ups (status, due_date)
  WHERE status IN ('Open', 'Snoozed');


-- ============================================================
-- ITEM 7 — team_id scaffold
-- ============================================================
-- NOTE: Before running this block, replace the placeholder UUID below
-- with the output of: SELECT gen_random_uuid();
-- Run that query in your Supabase SQL editor first and paste the result.
-- ============================================================

DO $$
DECLARE
  v_phase1_team_id UUID := 'REPLACE_WITH_YOUR_GENERATED_UUID'::UUID;
BEGIN
  -- Validate that the placeholder was replaced
  IF v_phase1_team_id = 'REPLACE_WITH_YOUR_GENERATED_UUID'::UUID THEN
    RAISE EXCEPTION 'Replace the placeholder UUID in the team_id scaffold block before running.';
  END IF;
END $$;

-- team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    UUID NOT NULL,
  role       TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, team_id)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_members_own_rows" ON team_members
  FOR ALL TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX idx_team_members_user_id ON team_members (user_id);
CREATE INDEX idx_team_members_team_id ON team_members (team_id);

-- Add team_id column to the four tenant-scoped tables
-- Using a fixed default so existing rows are backfilled automatically.
-- Replace 'REPLACE_WITH_YOUR_GENERATED_UUID' with your actual UUID below too.
ALTER TABLE clients  ADD COLUMN IF NOT EXISTS team_id UUID NOT NULL DEFAULT 'REPLACE_WITH_YOUR_GENERATED_UUID'::UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS team_id UUID NOT NULL DEFAULT 'REPLACE_WITH_YOUR_GENERATED_UUID'::UUID;
ALTER TABLE recaps   ADD COLUMN IF NOT EXISTS team_id UUID NOT NULL DEFAULT 'REPLACE_WITH_YOUR_GENERATED_UUID'::UUID;
ALTER TABLE buyers   ADD COLUMN IF NOT EXISTS team_id UUID NOT NULL DEFAULT 'REPLACE_WITH_YOUR_GENERATED_UUID'::UUID;

CREATE INDEX IF NOT EXISTS idx_clients_team_id  ON clients  (team_id);
CREATE INDEX IF NOT EXISTS idx_products_team_id ON products (team_id);
CREATE INDEX IF NOT EXISTS idx_recaps_team_id   ON recaps   (team_id);
CREATE INDEX IF NOT EXISTS idx_buyers_team_id   ON buyers   (team_id);

-- Drop the permissive Phase 1 policies on these four tables
DROP POLICY IF EXISTS "authenticated_all" ON clients;
DROP POLICY IF EXISTS "authenticated_all" ON products;
DROP POLICY IF EXISTS "authenticated_all" ON recaps;
DROP POLICY IF EXISTS "authenticated_all" ON buyers;

-- Replace with team-scoped policies
-- The subselect resolves to a single UUID for Phase 1 (one team).
-- In Phase 2, multi-team users will have multiple rows in team_members.
CREATE POLICY "team_scoped" ON clients
  FOR ALL TO authenticated
  USING  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "team_scoped" ON products
  FOR ALL TO authenticated
  USING  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "team_scoped" ON recaps
  FOR ALL TO authenticated
  USING  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

CREATE POLICY "team_scoped" ON buyers
  FOR ALL TO authenticated
  USING  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));

-- ── Seed the Phase 1 team member ─────────────────────────────
-- Replace 'REPLACE_WITH_YOUR_AUTH_USER_UUID' with your actual user UUID
-- from Supabase Dashboard → Authentication → Users.
-- Replace 'REPLACE_WITH_YOUR_GENERATED_UUID' with your team UUID.
INSERT INTO team_members (user_id, team_id, role)
VALUES (
  'REPLACE_WITH_YOUR_AUTH_USER_UUID'::UUID,
  'REPLACE_WITH_YOUR_GENERATED_UUID'::UUID,
  'owner'
)
ON CONFLICT (user_id, team_id) DO NOTHING;
