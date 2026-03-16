-- ============================================================
-- scripts/add-beta-user.sql
-- Wine CRM — Broker team onboarding
--
-- Run each block in the Supabase SQL editor as needed.
-- The user must have already signed up via the app before
-- any of these commands will work.
--
-- Requires: 06_team_management.sql to be applied first.
-- ============================================================


-- ── 1. Onboard the first owner of a brand-new team ───────────
--
-- Leave the third argument as NULL — a fresh team UUID is
-- generated automatically.  The returned UUID is the new team_id;
-- copy it for step 2 if you need to add colleagues to the same team.

SELECT add_broker_user(
  'user@example.com',   -- ← replace with the user's email
  'owner',              -- ← role: 'owner' | 'admin' | 'member'
  NULL                  -- ← NULL = create a brand-new team
);


-- ── 2. Add a colleague to an existing team ───────────────────
--
-- Paste the team UUID returned from step 1 (or found in the
-- Supabase table editor under team_members.team_id).

-- SELECT add_broker_user(
--   'colleague@example.com',
--   'member',
--   '00000000-0000-0000-0000-000000000000'  -- ← existing team UUID
-- );


-- ── 3. Switch a user's active team ───────────────────────────
--
-- Use this when a user belongs to more than one team and needs
-- the app to operate on a different one.  Updates user_metadata
-- so the app picks up the new active team on next page load.

-- SELECT set_active_team(
--   'user@example.com',
--   '00000000-0000-0000-0000-000000000000'  -- ← target team UUID
-- );


-- ── 4. Onboard a supplier portal user ────────────────────────
--
-- The supplier record must already exist in the suppliers table.

-- SELECT add_supplier_user(
--   'supplier@example.com',
--   '00000000-0000-0000-0000-000000000000',  -- ← supplier UUID
--   'viewer'                                  -- 'admin' | 'viewer'
-- );
