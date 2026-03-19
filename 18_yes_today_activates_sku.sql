-- 18_yes_today_activates_sku.sql
-- When a recap product is saved with outcome = 'Yes Today', automatically
-- upsert a row into account_skus so the product is marked as an active SKU
-- for that account without requiring manual entry.

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

    -- Auto-activate SKU for "Yes Today" outcomes
    IF v_outcome = 'Yes Today' THEN
      INSERT INTO account_skus (team_id, account_id, product_id)
      VALUES (v_team_id, v_account_id, v_product_id)
      ON CONFLICT (account_id, product_id) DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_recap_id;

EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

REVOKE ALL    ON FUNCTION save_recap(JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION save_recap(JSONB, JSONB) TO authenticated;
