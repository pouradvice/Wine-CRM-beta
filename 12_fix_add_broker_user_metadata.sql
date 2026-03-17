-- 12_fix_add_broker_user_metadata.sql
--
-- Problem: when a new user signs up, handle_new_user() creates their own
-- private team and writes its team_id into user_metadata.  When an owner
-- then invites them via add_broker_user(), the old code skipped the metadata
-- update (IF v_existing_team_id IS NULL guard), so the member's
-- user_metadata.team_id still pointed to their private team — not the shared
-- one.  Every app page used that metadata value as the team_id, so members
-- could never see the owner's accounts or products.
--
-- Fix: always update user_metadata.team_id to the target team when adding
-- a member.

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
  v_user_id  UUID;
  v_team_id  UUID;
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

  -- Always update user_metadata.team_id to the target team so the app
  -- immediately resolves to the correct shared team on the member's next load.
  UPDATE auth.users
  SET    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) ||
           jsonb_build_object('team_id', v_team_id)
  WHERE  id = v_user_id;

  RETURN v_team_id;
END;
$$;

REVOKE ALL    ON FUNCTION add_broker_user(TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION add_broker_user(TEXT, TEXT, UUID) TO service_role;
