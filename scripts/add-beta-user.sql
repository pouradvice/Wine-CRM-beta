-- ============================================================
-- Pour Advice CRM — Add Beta User
--
-- Run this in the Supabase SQL editor AFTER creating the user's
-- account in Supabase Dashboard → Authentication → Users.
--
-- What this script does:
--   1. Looks up the user by email
--   2. Generates a new team UUID for them
--   3. Inserts a team_members row (owner role)
--   4. Stamps team_id into the user's metadata so the app
--      resolves the correct team on login
-- ============================================================

DO $$
DECLARE
  v_email   TEXT    := 'joshtiensivu@gmail.com';
  v_user_id UUID;
  v_team_id UUID    := gen_random_uuid();
BEGIN
  -- Find the user created in the Supabase dashboard
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = v_email;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION
      'User "%" not found. Create the account in Supabase Dashboard → Authentication → Users first.',
      v_email;
  END IF;

  -- Create a team_members row giving this user ownership of their team
  INSERT INTO team_members (user_id, team_id, role)
  VALUES (v_user_id, v_team_id, 'owner')
  ON CONFLICT (user_id, team_id) DO NOTHING;

  -- Stamp team_id into user metadata so the app reads it on login
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'),
    '{team_id}',
    to_jsonb(v_team_id::text)
  )
  WHERE id = v_user_id;

  RAISE NOTICE 'Done. user_id=%, team_id=%', v_user_id, v_team_id;
END;
$$;
