-- ============================================================
-- Pour Advice CRM — Migration 03
-- Multi-tenant hardening for beta user expansion
--
-- Run the entire file in the Supabase SQL editor.
-- Safe to run more than once (all statements use IF EXISTS /
-- IF NOT EXISTS / OR REPLACE / ON CONFLICT DO NOTHING).
--
-- What this migration does:
--   1. Add team_id to brands (backfill + team-scoped RLS)
--   2. Tighten RLS on recap_products and follow_ups
--   3. Change sku_number unique constraint to per-team
--   4. Convert materialized views → regular views
--      (base-table RLS then enforces team isolation automatically)
--   5. Rebuild save_recap RPC with team auth guard + team_id on insert
-- ============================================================


-- ============================================================
-- SECTION 1 — brands: add team_id, unique constraint, RLS
-- ============================================================

ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS team_id UUID
    NOT NULL DEFAULT '92c8a6be-e267-4ffe-a305-90fc0a5f57b2'::UUID;

CREATE INDEX IF NOT EXISTS idx_brands_team_id ON brands (team_id);

-- Unique brand name within a team (enables find-or-create upsert)
ALTER TABLE brands
  DROP CONSTRAINT IF EXISTS brands_name_team_id_key;
ALTER TABLE brands
  ADD CONSTRAINT brands_name_team_id_key UNIQUE (name, team_id);

-- Replace permissive policy with team-scoped policy
DROP POLICY IF EXISTS "authenticated_all" ON brands;
DROP POLICY IF EXISTS "team_scoped"       ON brands;

CREATE POLICY "team_scoped" ON brands
  FOR ALL TO authenticated
  USING  (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()))
  WITH CHECK (team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid()));


-- ============================================================
-- SECTION 2 — recap_products: team-scoped RLS via parent recaps
-- ============================================================

DROP POLICY IF EXISTS "authenticated_all" ON recap_products;
DROP POLICY IF EXISTS "team_scoped"       ON recap_products;

CREATE POLICY "team_scoped" ON recap_products
  FOR ALL TO authenticated
  USING (
    recap_id IN (
      SELECT id FROM recaps
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    recap_id IN (
      SELECT id FROM recaps
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    )
  );


-- ============================================================
-- SECTION 3 — follow_ups: team-scoped RLS via parent clients
-- ============================================================

DROP POLICY IF EXISTS "authenticated_all" ON follow_ups;
DROP POLICY IF EXISTS "team_scoped"       ON follow_ups;

CREATE POLICY "team_scoped" ON follow_ups
  FOR ALL TO authenticated
  USING (
    client_id IN (
      SELECT id FROM clients
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM clients
      WHERE team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid())
    )
  );


-- ============================================================
-- SECTION 4 — products: per-team SKU uniqueness
-- ============================================================

-- Drop the global unique constraint and its index
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_sku_number_key;
DROP INDEX IF EXISTS idx_products_sku;

-- Composite unique constraint: SKU is unique within a team
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_sku_number_team_id_key;
ALTER TABLE products
  ADD CONSTRAINT products_sku_number_team_id_key UNIQUE (sku_number, team_id);


-- ============================================================
-- SECTION 5 — Convert materialized views → regular views
--
-- Materialized views store a pre-computed snapshot; base-table
-- RLS is NOT applied when querying them, so every user would
-- see all teams' analytics.
--
-- Regular views re-evaluate the query on each request; base-
-- table RLS IS applied, so each user sees only their team's rows.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS v_product_performance;
DROP MATERIALIZED VIEW IF EXISTS v_follow_up_queue;
DROP MATERIALIZED VIEW IF EXISTS v_products_by_buyer;

-- ── v_product_performance ────────────────────────────────────
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
LEFT JOIN brands b          ON b.id = p.brand_id
LEFT JOIN recap_products rp ON rp.product_id = p.id
LEFT JOIN recaps r          ON r.id = rp.recap_id
WHERE p.is_active = TRUE
GROUP BY p.id, p.sku_number, p.wine_name, p.type, p.varietal, b.name, p.distributor;

-- ── v_follow_up_queue ────────────────────────────────────────
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
JOIN clients c         ON c.id = fu.client_id
JOIN products p        ON p.id = fu.product_id
JOIN recaps r          ON r.id = fu.recap_id
JOIN recap_products rp ON rp.id = fu.recap_product_id
LEFT JOIN buyers bu    ON bu.id = r.buyer_id
WHERE fu.status IN ('Open', 'Snoozed')
ORDER BY fu.due_date ASC NULLS LAST;

-- ── v_products_by_buyer ──────────────────────────────────────
CREATE OR REPLACE VIEW v_products_by_buyer AS
SELECT
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
ORDER BY c.company_name, bu.contact_name, times_shown DESC;


-- ============================================================
-- SECTION 6 — save_recap RPC: add team auth + team_id on insert
--
-- The original function used SECURITY DEFINER, bypassing RLS.
-- This version:
--   • Looks up the caller's team from team_members
--   • Verifies the supplied client_id belongs to that team
--   • Stamps team_id onto the new recap row
-- ============================================================

CREATE OR REPLACE FUNCTION save_recap(
  p_recap    JSONB,
  p_products JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recap_id           UUID;
  v_rp_id              UUID;
  v_product            JSONB;
  v_follow_up_required BOOLEAN;
  v_due_date           DATE;
  v_team_id            UUID;
  v_client_team_id     UUID;
BEGIN
  -- ── Resolve calling user's team ───────────────────────────
  SELECT team_id INTO v_team_id
  FROM team_members
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: user has no team membership';
  END IF;

  -- ── Verify client belongs to that team ───────────────────
  SELECT team_id INTO v_client_team_id
  FROM clients
  WHERE id = (p_recap->>'client_id')::UUID;

  IF v_client_team_id IS DISTINCT FROM v_team_id THEN
    RAISE EXCEPTION 'unauthorized: client does not belong to your team';
  END IF;

  -- ── Insert recap ─────────────────────────────────────────
  INSERT INTO recaps (
    visit_date,
    salesperson,
    user_id,
    client_id,
    buyer_id,
    nature,
    expense_receipt_url,
    notes,
    team_id
  )
  VALUES (
    (p_recap->>'visit_date')::DATE,
    p_recap->>'salesperson',
    (p_recap->>'user_id')::UUID,
    (p_recap->>'client_id')::UUID,
    NULLIF(p_recap->>'buyer_id', '')::UUID,
    p_recap->>'nature',
    NULLIF(p_recap->>'expense_receipt_url', ''),
    NULLIF(p_recap->>'notes', ''),
    v_team_id
  )
  RETURNING id INTO v_recap_id;

  -- ── Insert recap_products + generate follow_ups ──────────
  FOR v_product IN SELECT * FROM jsonb_array_elements(p_products)
  LOOP
    v_follow_up_required :=
      (v_product->>'outcome') IN ('Yes Later', 'Maybe Later');

    v_due_date := COALESCE(
      NULLIF(v_product->>'follow_up_date', '')::DATE,
      NULLIF(v_product->>'bill_date',      '')::DATE
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
      NULLIF(v_product->>'buyer_feedback',    ''),
      v_follow_up_required,
      NULLIF(v_product->>'follow_up_date',    '')::DATE,
      NULLIF(v_product->>'bill_date',         '')::DATE
    )
    RETURNING id INTO v_rp_id;

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
    RAISE;
END;
$$;

REVOKE ALL    ON FUNCTION save_recap(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_recap(JSONB, JSONB) TO authenticated;
