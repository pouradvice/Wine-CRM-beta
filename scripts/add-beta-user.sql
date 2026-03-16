-- ============================================================
-- scripts/add-beta-user.sql
-- Wine CRM — Broker team onboarding
--
-- Run each block in the Supabase SQL editor as needed.
--
-- ── How user provisioning works (read first) ─────────────────
--
-- Since 03_onboarding.sql was applied, every new self-signup user
-- is automatically provisioned as 'owner' of their own private team
-- by the on_auth_user_created trigger.  You no longer need to run
-- step 1 below for fresh signups — they arrive in the app ready to go.
--
-- Use this script ONLY for:
--   • Inviting a colleague into an EXISTING team (step 2)
--   • Switching a user's active team (step 3)
--   • Back-filling users who signed up BEFORE the trigger existed (step 1)
--   • Onboarding supplier portal users (step 4)
--
-- Requires: 06_team_management.sql + 03_onboarding.sql applied first.
-- ============================================================


-- ── 1. Back-fill: promote a pre-trigger user to owner of their own team ──
--
-- Only needed for accounts created BEFORE on_auth_user_created was applied.
-- Leave the third argument as NULL — a fresh team UUID is generated.
-- The returned UUID is the new team_id; copy it for step 2 if needed.

-- SELECT add_broker_user(
--   'user@example.com',   -- ← replace with the user's email
--   'owner',              -- ← role: 'owner' | 'admin' | 'member'
--   NULL                  -- ← NULL = create a brand-new team
-- );


-- ── 2. Add a colleague to an existing team ───────────────────
--
-- IMPORTANT: each user already has their own owner team from signup.
-- This adds them as a MEMBER of a second (shared) team.
-- Paste the team UUID from step 1 or from team_members.team_id.
-- Do NOT pass NULL here — that would create yet another new team.

-- SELECT add_broker_user(
--   'colleague@example.com',
--   'member',
--   '00000000-0000-0000-0000-000000000000'  -- ← existing team UUID (REQUIRED)
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
