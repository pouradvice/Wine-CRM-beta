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

COMMIT;
