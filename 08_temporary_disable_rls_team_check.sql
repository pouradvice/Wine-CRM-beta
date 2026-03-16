-- ══════════════════════════════════════════════════════════════
-- 08_temporary_disable_rls_team_check.sql
-- ══════════════════════════════════════════════════════════════
-- !! WARNING: DO NOT RUN IN PRODUCTION !!
-- This migration removes team-scoped data isolation.  It is
-- intended ONLY for local development and solo testing phases.
--
-- Problem: During solo testing, users cannot see their own imported
-- data because the team_id in RLS policies does not match the
-- team_id stamped on the data (mismatched UUIDs across imports).
--
-- Solution: Replace all team-scoped USING clauses with USING (TRUE)
-- so any authenticated user can read/write all rows.  The table
-- structure, columns, and indexes are NOT changed.
--
-- TODO: Revert this migration before moving to multi-user / production.
-- Re-enable by running 09_enable_rls_team_isolation.sql once the
-- proper team/manager role hierarchy has been designed.
--
-- Tables affected:
--   brands, products, accounts, contacts, recaps,
--   recap_products, follow_ups, supplier_contracts
-- ══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- supplier_contracts
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "supplier_contracts_team_scoped" ON supplier_contracts;
CREATE POLICY "supplier_contracts_all_authenticated" ON supplier_contracts
  FOR ALL TO authenticated
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- brands
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "brands_team_scoped" ON brands;
CREATE POLICY "brands_all_authenticated" ON brands
  FOR ALL TO authenticated
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- products
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "products_team_scoped"   ON products;
DROP POLICY IF EXISTS "products_supplier_read" ON products;
CREATE POLICY "products_all_authenticated" ON products
  FOR ALL TO authenticated
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- accounts
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "accounts_team_scoped"   ON accounts;
DROP POLICY IF EXISTS "accounts_supplier_read" ON accounts;
CREATE POLICY "accounts_all_authenticated" ON accounts
  FOR ALL TO authenticated
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- contacts
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contacts_team_scoped" ON contacts;
CREATE POLICY "contacts_all_authenticated" ON contacts
  FOR ALL TO authenticated
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- recaps
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recaps_team_scoped" ON recaps;
CREATE POLICY "recaps_all_authenticated" ON recaps
  FOR ALL TO authenticated
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- recap_products
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "recap_products_team_scoped"   ON recap_products;
DROP POLICY IF EXISTS "recap_products_supplier_read" ON recap_products;
CREATE POLICY "recap_products_all_authenticated" ON recap_products
  FOR ALL TO authenticated
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- follow_ups
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "follow_ups_team_scoped" ON follow_ups;
CREATE POLICY "follow_ups_all_authenticated" ON follow_ups
  FOR ALL TO authenticated
  USING (TRUE);
