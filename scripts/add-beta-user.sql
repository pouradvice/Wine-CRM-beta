-- ============================================================
-- scripts/add-beta-user.sql
-- Wine CRM — Onboard a broker team user
--
-- Run in the Supabase SQL editor AFTER creating the user's
-- account in Supabase Dashboard → Authentication → Users.
--
-- For the first user on a new team: leave v_team_id as NULL
--   → a new team UUID is generated automatically.
-- For additional users joining an existing team: paste the
--   existing team UUID into v_team_id.
--
-- Uses the add_broker_user() function defined in 04_schema_rework.sql.
-- ============================================================

SELECT add_broker_user(
  'user@example.com',   -- ← replace with the user's email
  'owner',              -- ← role: 'owner' | 'admin' | 'member'
  NULL                  -- ← team UUID to join, or NULL to create a new team
);

-- ── Onboard a supplier portal user ───────────────────────────
-- Uncomment and fill in to give a supplier rep portal access.
-- The supplier record must already exist in the suppliers table.

-- SELECT add_supplier_user(
--   'supplier@example.com',                  -- user's email
--   '00000000-0000-0000-0000-000000000000',  -- supplier UUID
--   'viewer'                                 -- 'admin' | 'viewer'
-- );
