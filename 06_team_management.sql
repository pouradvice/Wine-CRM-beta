-- ============================================================
-- 06_team_management.sql
-- Wine CRM — Team management helpers
--
-- Run in the Supabase SQL editor to apply.
-- Depends on: 04_schema_rework.sql (or 05_migrate_to_new_schema.sql)
-- ============================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. FIX add_broker_user
--
-- Changes vs previous version:
--   • Returns UUID (the team_id) instead of VOID — lets callers
--     capture the new team UUID and pass it to subsequent calls
--     when adding colleagues to the same team.
--   • No longer overwrites raw_user_meta_data.team_id if the user
--     already has one set — prevents silently breaking an existing
--     team association when adding someone to a second team.
--
-- Must DROP before CREATE OR REPLACE because the return type changes
-- from VOID → UUID.
-- ══════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS add_broker_user(TEXT, TEXT, UUID);

CREATE FUNCTION add_broker_user(
  p_email    TEXT,
  p_role     TEXT DEFAULT 'member',
  p_team_id  UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id          UUID;
  v_team_id          UUID;
  v_existing_team_id TEXT;
BEGIN
  -- Resolve user
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User % not found in auth.users — they must sign up first', p_email;
  END IF;

  -- Use supplied team or generate a fresh one
  v_team_id := COALESCE(p_team_id, gen_random_uuid());

  -- Add (or update role in) team_members
  INSERT INTO team_members (user_id, team_id, role)
  VALUES (v_user_id, v_team_id, p_role)
  ON CONFLICT (user_id, team_id) DO UPDATE SET role = EXCLUDED.role;

  -- Only write team_id to user metadata if the user doesn't already
  -- have one.  This prevents overwriting the active team reference
  -- when adding a user to a second (or third) team.
  SELECT raw_user_meta_data->>'team_id'
  INTO   v_existing_team_id
  FROM   auth.users
  WHERE  id = v_user_id;

  IF v_existing_team_id IS NULL THEN
    UPDATE auth.users
    SET    raw_user_meta_data = raw_user_meta_data ||
             jsonb_build_object('team_id', v_team_id)
    WHERE  id = v_user_id;
  END IF;

  RETURN v_team_id;
END;
$$;

REVOKE ALL    ON FUNCTION add_broker_user(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_broker_user(TEXT, TEXT, UUID) TO service_role;


-- ══════════════════════════════════════════════════════════════
-- 2. set_active_team
--
-- Explicitly switch a user's active team (updates user_metadata).
-- Call this when a user who belongs to multiple teams needs to
-- change which team the app operates on.
--
-- Usage:
--   SELECT set_active_team('josh@pouradvice.com', '<team-uuid>');
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_active_team(
  p_email    TEXT,
  p_team_id  UUID
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
    RAISE EXCEPTION 'User % not found', p_email;
  END IF;

  -- Verify the user is actually a member of the target team
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = v_user_id AND team_id = p_team_id
  ) THEN
    RAISE EXCEPTION 'User % is not a member of team %', p_email, p_team_id;
  END IF;

  UPDATE auth.users
  SET    raw_user_meta_data = raw_user_meta_data ||
           jsonb_build_object('team_id', p_team_id)
  WHERE  id = v_user_id;
END;
$$;

REVOKE ALL    ON FUNCTION set_active_team(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_active_team(TEXT, UUID) TO service_role;


-- ══════════════════════════════════════════════════════════════
-- 3. FIX save_recap — team resolution
--
-- Previous versions used LIMIT 1 to pick the caller's team from
-- team_members, then validated that the chosen account belonged
-- to that team.  With a user in multiple teams LIMIT 1 returns an
-- arbitrary row, so the check fails whenever the wrong team is
-- picked first.
--
-- Fix: resolve the team FROM the account record, then verify the
-- caller is a member of that team.  The account is the source of
-- truth for which team a recap belongs to.
-- ══════════════════════════════════════════════════════════════

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
  -- Resolve account first — it is the source of truth for team_id
  v_account_id := (p_recap->>'account_id')::UUID;

  SELECT team_id INTO v_team_id
  FROM   accounts
  WHERE  id = v_account_id;

  IF v_team_id IS NULL THEN
    RAISE EXCEPTION 'Account % not found', v_account_id;
  END IF;

  -- Validate the calling user is a member of that team
  IF NOT EXISTS (
    SELECT 1 FROM team_members
    WHERE  user_id = auth.uid()
    AND    team_id = v_team_id
  ) THEN
    RAISE EXCEPTION 'Forbidden: account % does not belong to any of your teams',
      v_account_id;
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
      FROM   products WHERE id = v_product_id;

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
