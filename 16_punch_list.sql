-- 16_punch_list.sql
-- Punch List migration: 6 feature additions
--   1. New visit types: Event, Off-Premise Tasting
--   2. New outcome: Menu Placement + photo URL + boolean toggle
--   3. Discussed outcome → auto-create follow-up
--   4. Primary Contact as free text on accounts
--   5. Supplier column support on products (trigger update)
--   6. (Label changes are UI-only, no SQL needed)
--
-- NOTE: Before running, create the 'menu-photos' Storage bucket in the
--       Supabase dashboard (Storage → New Bucket → menu-photos, Public).

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- 1. recaps: add 'Event' and 'Off-Premise Tasting' visit types
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE recaps DROP CONSTRAINT IF EXISTS recaps_nature_check;
ALTER TABLE recaps ADD CONSTRAINT recaps_nature_check
  CHECK (nature IN ('Sales Call', 'Depletion Meeting', 'Event', 'Off-Premise Tasting'));

-- Add occasion column (used when nature = 'Event')
ALTER TABLE recaps ADD COLUMN IF NOT EXISTS occasion TEXT;

-- ──────────────────────────────────────────────────────────────────
-- 2. recap_products: add 'Menu Placement' outcome + columns
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE recap_products DROP CONSTRAINT IF EXISTS recap_products_outcome_check;
ALTER TABLE recap_products ADD CONSTRAINT recap_products_outcome_check
  CHECK (outcome IN ('Yes Today', 'Yes Later', 'Maybe Later', 'No', 'Discussed', 'Menu Placement'));

ALTER TABLE recap_products ADD COLUMN IF NOT EXISTS menu_photo_url  TEXT;
ALTER TABLE recap_products ADD COLUMN IF NOT EXISTS menu_placement  BOOLEAN NOT NULL DEFAULT FALSE;

-- ──────────────────────────────────────────────────────────────────
-- 4. accounts: add primary_contact_name free-text column
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS primary_contact_name TEXT;

-- ──────────────────────────────────────────────────────────────────
-- 5. products: update trigger to allow manual supplier_id override
--    Only auto-fills supplier_id from brand when it is NULL.
-- ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_product_supplier_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-fill supplier_id from brand only when not explicitly provided
  IF NEW.brand_id IS NOT NULL AND NEW.supplier_id IS NULL THEN
    SELECT supplier_id INTO NEW.supplier_id
    FROM brands WHERE id = NEW.brand_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────────────
-- 8. Update v_product_performance to include menu_placements count
-- ──────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS v_product_performance CASCADE;

CREATE VIEW v_product_performance AS
SELECT
  p.id                                                                          AS product_id,
  p.team_id,
  p.sku_number,
  p.wine_name,
  p.type,
  p.varietal,
  p.supplier_id,
  b.name                                                                        AS brand_name,
  p.distributor,
  COUNT(rp.id)                                                                  AS times_shown,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')                         AS orders_placed,
  COUNT(rp.id) FILTER (WHERE rp.outcome IN ('Yes Today','Yes Later'))           AS committed,
  ROUND(AVG(rp.order_probability)::NUMERIC, 1)                                 AS avg_order_probability,
  CASE
    WHEN COUNT(rp.id) > 0
    THEN ROUND(100.0 * COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today') / COUNT(rp.id), 1)
  END                                                                           AS conversion_rate_pct,
  MAX(r.visit_date)                                                             AS last_shown_date,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Menu Placement' OR rp.menu_placement = TRUE)
                                                                                AS menu_placements
FROM products p
LEFT JOIN brands         b   ON b.id  = p.brand_id
LEFT JOIN recap_products rp  ON rp.product_id = p.id
LEFT JOIN recaps         r   ON r.id  = rp.recap_id
GROUP BY p.id, b.name;

GRANT SELECT ON v_product_performance TO authenticated;

-- ──────────────────────────────────────────────────────────────────
-- 9. Update save_recap function
--    - Stores occasion on recaps
--    - Stores menu_placement and menu_photo_url on recap_products
--    - Auto-creates follow-up for Discussed (in addition to Yes Later, Maybe Later)
-- ──────────────────────────────────────────────────────────────────

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

  -- Insert recap (includes occasion for Event type)
  INSERT INTO recaps (
    team_id,
    account_id,
    contact_id,
    user_id,
    visit_date,
    salesperson,
    nature,
    expense_receipt_url,
    notes,
    occasion
  ) VALUES (
    v_team_id,
    v_account_id,
    v_contact_id,
    NULLIF(p_recap->>'user_id', '')::UUID,
    (p_recap->>'visit_date')::DATE,
    p_recap->>'salesperson',
    COALESCE(NULLIF(p_recap->>'nature', ''), 'Sales Call'),
    NULLIF(p_recap->>'expense_receipt_url', ''),
    NULLIF(p_recap->>'notes', ''),
    NULLIF(p_recap->>'occasion', '')
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
      bill_date,
      menu_placement,
      menu_photo_url
    ) VALUES (
      v_recap_id,
      v_product_id,
      v_outcome,
      NULLIF(v_product->>'order_probability', '')::INTEGER,
      NULLIF(v_product->>'buyer_feedback', ''),
      v_outcome IN ('Yes Later', 'Maybe Later', 'Discussed'),
      v_follow_date,
      NULLIF(v_product->>'bill_date', '')::DATE,
      COALESCE((v_product->>'menu_placement')::BOOLEAN, FALSE),
      NULLIF(v_product->>'menu_photo_url', '')
    )
    RETURNING id INTO v_rp_id;

    -- Auto-generate follow_up for actionable outcomes
    -- Now includes 'Discussed' in addition to 'Yes Later' and 'Maybe Later'
    IF v_outcome IN ('Yes Later', 'Maybe Later', 'Discussed') THEN
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

COMMIT;
