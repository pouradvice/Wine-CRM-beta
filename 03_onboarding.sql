-- ============================================================
-- 03_onboarding.sql
-- Pour Advice CRM — First-login onboarding wizard
--
-- Run this after 04_schema_rework.sql is applied.
-- Depends on: set_updated_at() defined in 01_schema.sql
-- ============================================================


-- ── 0. Auto-provision new users as team owner ────────────────
--
-- When a user signs up through Supabase Auth (email/password or OAuth),
-- this trigger fires immediately and:
--   • Creates a fresh team UUID for them
--   • Inserts them into team_members as 'owner'
--   • Writes team_id into user_metadata so the app can read it
--
-- This means every self-signup user arrives at the onboarding wizard
-- with an 'owner' role and their own isolated team — they are never
-- silently merged into a shared team.
--
-- add_broker_user() still works for manually adding colleagues to an
-- existing team; the ON CONFLICT DO NOTHING guard prevents it from
-- overwriting the auto-provisioned owner row on the same (user, team).
--
-- To add a user to a SECOND team (without touching their existing owner
-- team), call add_broker_user() with the target team UUID explicitly.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_team_id UUID := gen_random_uuid();
BEGIN
  -- Provision a private team for the new user
  INSERT INTO public.team_members (user_id, team_id, role)
  VALUES (NEW.id, v_team_id, 'owner')
  ON CONFLICT DO NOTHING;

  -- Stamp team_id into user_metadata only if not already set
  -- (e.g. created via add_broker_user before signup, edge case)
  IF (NEW.raw_user_meta_data->>'team_id') IS NULL THEN
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
                             jsonb_build_object('team_id', v_team_id)
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop first in case this migration is re-run
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- ── 1a. user_onboarding_state ─────────────────────────────────

CREATE TABLE IF NOT EXISTS user_onboarding_state (
  user_id           UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  completed_at      TIMESTAMPTZ,
  accounts_imported INTEGER     NOT NULL DEFAULT 0,
  products_imported INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_onboarding_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_own_row"
  ON user_onboarding_state
  FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER set_updated_at_onboarding_state
  BEFORE UPDATE ON user_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── 1b. mark_onboarding_complete ─────────────────────────────

CREATE OR REPLACE FUNCTION mark_onboarding_complete(
  p_accounts_imported INT DEFAULT 0,
  p_products_imported INT DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_completed_at TIMESTAMPTZ;
BEGIN
  -- Read existing completed_at to preserve it on subsequent calls
  SELECT completed_at
    INTO v_existing_completed_at
    FROM user_onboarding_state
   WHERE user_id = auth.uid();

  INSERT INTO user_onboarding_state
    (user_id, completed_at, accounts_imported, products_imported)
  VALUES
    (auth.uid(), NOW(), p_accounts_imported, p_products_imported)
  ON CONFLICT (user_id) DO UPDATE
    SET completed_at      = COALESCE(v_existing_completed_at, NOW()),
        accounts_imported = user_onboarding_state.accounts_imported + p_accounts_imported,
        products_imported = user_onboarding_state.products_imported + p_products_imported,
        updated_at        = NOW();
END;
$$;

REVOKE ALL ON FUNCTION mark_onboarding_complete(INT, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION mark_onboarding_complete(INT, INT) TO authenticated;


-- ── 1c. bulk_import_accounts ──────────────────────────────────
-- Inserts rows into the `accounts` table.
-- CSV header `company_name` maps to the `name` column.
-- `contact_name` is accepted in the payload but not stored
-- (contacts live in the separate `contacts` table).

CREATE OR REPLACE FUNCTION bulk_import_accounts(
  p_rows    JSONB,
  p_team_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row       JSONB;
  v_idx       INT  := 0;
  v_inserted  INT  := 0;
  v_skipped   INT  := 0;
  v_errors    JSONB := '[]'::JSONB;
  v_status    TEXT;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;
    BEGIN
      -- company_name is required; maps to the `name` column
      IF (v_row->>'company_name') IS NULL OR trim(v_row->>'company_name') = '' THEN
        v_errors := v_errors || to_jsonb(format('Row %s: company_name is required', v_idx));
        CONTINUE;
      END IF;

      -- Validate / default status
      v_status := COALESCE(v_row->>'status', 'Active');
      IF v_status NOT IN ('Active', 'Prospective', 'Former') THEN
        v_status := 'Active';
      END IF;

      INSERT INTO accounts (
        team_id,
        name,
        type,
        value_tier,
        phone,
        email,
        address,
        status,
        notes,
        is_active
      ) VALUES (
        p_team_id,
        trim(v_row->>'company_name'),
        NULLIF(trim(v_row->>'type'),       ''),
        NULLIF(trim(v_row->>'value_tier'), ''),
        NULLIF(trim(v_row->>'phone'),      ''),
        NULLIF(trim(v_row->>'email'),      ''),
        NULLIF(trim(v_row->>'address'),    ''),
        v_status,
        NULLIF(trim(v_row->>'notes'),      ''),
        TRUE
      );

      v_inserted := v_inserted + 1;

    EXCEPTION
      WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
      WHEN OTHERS THEN
        v_errors := v_errors || to_jsonb(format('Row %s: %s', v_idx, SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped',  v_skipped,
    'errors',   v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION bulk_import_accounts(JSONB, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION bulk_import_accounts(JSONB, UUID) TO authenticated;


-- ── 1d. bulk_import_products ──────────────────────────────────

CREATE OR REPLACE FUNCTION bulk_import_products(
  p_rows    JSONB,
  p_team_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row           JSONB;
  v_idx           INT   := 0;
  v_inserted      INT   := 0;
  v_skipped       INT   := 0;
  v_errors        JSONB := '[]'::JSONB;
  v_btg_cost      NUMERIC;
  v_frontline     NUMERIC;
BEGIN
  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;
    BEGIN
      -- sku_number and wine_name are required
      IF (v_row->>'sku_number') IS NULL OR trim(v_row->>'sku_number') = '' THEN
        v_errors := v_errors || to_jsonb(format('Row %s: sku_number is required', v_idx));
        CONTINUE;
      END IF;
      IF (v_row->>'wine_name') IS NULL OR trim(v_row->>'wine_name') = '' THEN
        v_errors := v_errors || to_jsonb(format('Row %s: wine_name is required', v_idx));
        CONTINUE;
      END IF;

      -- Cast numeric fields only when they match ^\d+(\.\d+)?$
      v_btg_cost  := CASE
                       WHEN (v_row->>'btg_cost') ~ '^\d+(\.\d+)?$'
                       THEN (v_row->>'btg_cost')::NUMERIC
                       ELSE NULL
                     END;
      v_frontline := CASE
                       WHEN (v_row->>'frontline_cost') ~ '^\d+(\.\d+)?$'
                       THEN (v_row->>'frontline_cost')::NUMERIC
                       ELSE NULL
                     END;

      INSERT INTO products (
        team_id,
        sku_number,
        wine_name,
        type,
        varietal,
        country,
        region,
        appellation,
        vintage,
        distributor,
        btg_cost,
        frontline_cost,
        notes,
        is_active
      ) VALUES (
        p_team_id,
        trim(v_row->>'sku_number'),
        trim(v_row->>'wine_name'),
        NULLIF(trim(v_row->>'type'),        ''),
        NULLIF(trim(v_row->>'varietal'),     ''),
        NULLIF(trim(v_row->>'country'),      ''),
        NULLIF(trim(v_row->>'region'),       ''),
        NULLIF(trim(v_row->>'appellation'),  ''),
        NULLIF(trim(v_row->>'vintage'),      ''),
        NULLIF(trim(v_row->>'distributor'),  ''),
        v_btg_cost,
        v_frontline,
        NULLIF(trim(v_row->>'notes'),        ''),
        TRUE
      )
      ON CONFLICT (sku_number, team_id) DO UPDATE
        SET wine_name      = EXCLUDED.wine_name,
            type           = COALESCE(EXCLUDED.type,        products.type),
            varietal       = COALESCE(EXCLUDED.varietal,    products.varietal),
            country        = COALESCE(EXCLUDED.country,     products.country),
            region         = COALESCE(EXCLUDED.region,      products.region),
            appellation    = COALESCE(EXCLUDED.appellation, products.appellation),
            vintage        = COALESCE(EXCLUDED.vintage,     products.vintage),
            distributor    = COALESCE(EXCLUDED.distributor, products.distributor),
            btg_cost       = COALESCE(EXCLUDED.btg_cost,    products.btg_cost),
            frontline_cost = COALESCE(EXCLUDED.frontline_cost, products.frontline_cost),
            notes          = COALESCE(EXCLUDED.notes,       products.notes),
            updated_at     = NOW();

      v_inserted := v_inserted + 1;

    EXCEPTION
      WHEN unique_violation THEN
        v_skipped := v_skipped + 1;
      WHEN OTHERS THEN
        v_errors := v_errors || to_jsonb(format('Row %s: %s', v_idx, SQLERRM));
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped',  v_skipped,
    'errors',   v_errors
  );
END;
$$;

REVOKE ALL ON FUNCTION bulk_import_products(JSONB, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION bulk_import_products(JSONB, UUID) TO authenticated;
