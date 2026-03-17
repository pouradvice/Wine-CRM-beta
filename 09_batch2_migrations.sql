-- ══════════════════════════════════════════════════════════════
-- 09_batch2_migrations.sql
-- ══════════════════════════════════════════════════════════════
-- Run this in the Supabase SQL editor (or via psql).
-- Three operations:
--   1. Recreate v_products_by_contact — adds r.team_id so the app
--      can filter the view by team.
--   2. Create client_management table — mirrors accounts schema
--      including the 5 fields being dropped from accounts, plus
--      an optional account_id FK → accounts.id for linkage.
--   3. Drop 5 columns from accounts — commission_pct, billback_pct,
--      contract_length, date_active_from, date_active_to.
-- ══════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────
-- 1. Recreate v_products_by_contact with team_id
-- ──────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS v_products_by_contact CASCADE;

CREATE VIEW v_products_by_contact AS
SELECT
  r.team_id,
  COALESCE(c.id, '00000000-0000-0000-0000-000000000000'::UUID)           AS contact_id,
  TRIM(COALESCE(c.first_name || ' ' || COALESCE(c.last_name, ''), 'Walk-in')) AS contact_name,
  a.name                                                                  AS account_name,
  p.sku_number,
  p.wine_name,
  p.type,
  COUNT(rp.id)                                                            AS times_shown,
  MAX(r.visit_date)                                                       AS last_shown,
  STRING_AGG(rp.outcome, ', ' ORDER BY r.visit_date)                     AS outcome_history,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')                   AS orders
FROM recap_products  rp
JOIN recaps          r   ON r.id  = rp.recap_id
JOIN products        p   ON p.id  = rp.product_id
JOIN accounts        a   ON a.id  = r.account_id
LEFT JOIN contacts   c   ON c.id  = r.contact_id
GROUP BY r.team_id, c.id, contact_name, a.name, p.sku_number, p.wine_name, p.type
ORDER BY a.name, contact_name, times_shown DESC;


-- ──────────────────────────────────────────────────────────────
-- 2. Create client_management table
--    Full mirror of accounts schema (all current columns), plus
--    the 5 fields being dropped from accounts, plus account_id FK.
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_management (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        REFERENCES accounts(id) ON DELETE SET NULL,
  team_id          UUID        NOT NULL,
  name             TEXT        NOT NULL,
  type             TEXT,
  value_tier       TEXT,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  city             TEXT,
  state            TEXT,
  country          TEXT,
  -- Fields being removed from accounts but preserved here:
  commission_pct   NUMERIC(6,3),
  billback_pct     NUMERIC(6,3),
  contract_length  TEXT,
  date_active_from DATE,
  date_active_to   DATE,
  account_lead     TEXT,
  status           TEXT        NOT NULL DEFAULT 'Active',
  notes            TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (open policy for authenticated users — mirrors migration 08 approach)
ALTER TABLE client_management ENABLE ROW LEVEL SECURITY;
CREATE POLICY "client_management_all_authenticated" ON client_management
  FOR ALL TO authenticated
  USING (TRUE);


-- ──────────────────────────────────────────────────────────────
-- 3. Drop 5 columns from accounts
-- ──────────────────────────────────────────────────────────────

-- CASCADE drops any views that reference these columns (e.g. a legacy "clients" view).
-- Re-create any needed views after this migration if applicable.
ALTER TABLE accounts
  DROP COLUMN IF EXISTS commission_pct CASCADE,
  DROP COLUMN IF EXISTS billback_pct CASCADE,
  DROP COLUMN IF EXISTS contract_length CASCADE,
  DROP COLUMN IF EXISTS date_active_from CASCADE,
  DROP COLUMN IF EXISTS date_active_to CASCADE;
