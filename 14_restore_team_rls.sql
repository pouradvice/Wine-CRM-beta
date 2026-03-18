-- ══════════════════════════════════════════════════════════════
-- 14_restore_team_rls.sql
-- Restores team-scoped RLS policies that were disabled by
-- 08_temporary_disable_rls_team_check.sql.
-- Run this before any multi-user or production deployment.
-- ══════════════════════════════════════════════════════════════

-- ── supplier_contracts ───────────────────────────────────────
DROP POLICY IF EXISTS "supplier_contracts_all_authenticated" ON supplier_contracts;
CREATE POLICY "supplier_contracts_team_scoped" ON supplier_contracts
  FOR ALL TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

-- ── brands ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "brands_all_authenticated" ON brands;
CREATE POLICY "brands_team_scoped" ON brands
  FOR ALL TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

-- ── products ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "products_all_authenticated" ON products;
CREATE POLICY "products_team_scoped" ON products
  FOR ALL TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));
DROP POLICY IF EXISTS "products_supplier_read" ON products;
CREATE POLICY "products_supplier_read" ON products
  FOR SELECT TO authenticated
  USING (supplier_id IN (
    SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
  ));

-- ── accounts ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "accounts_all_authenticated" ON accounts;
CREATE POLICY "accounts_team_scoped" ON accounts
  FOR ALL TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));
DROP POLICY IF EXISTS "accounts_supplier_read" ON accounts;
CREATE POLICY "accounts_supplier_read" ON accounts
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT r.account_id
    FROM recaps r
    JOIN recap_products rp ON rp.recap_id = r.id
    WHERE rp.supplier_id IN (
      SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
    )
  ));

-- ── contacts ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "contacts_all_authenticated" ON contacts;
CREATE POLICY "contacts_team_scoped" ON contacts
  FOR ALL TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

-- ── recaps ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "recaps_all_authenticated" ON recaps;
CREATE POLICY "recaps_team_scoped" ON recaps
  FOR ALL TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));

-- ── recap_products ───────────────────────────────────────────
DROP POLICY IF EXISTS "recap_products_all_authenticated" ON recap_products;
CREATE POLICY "recap_products_team_scoped" ON recap_products
  FOR ALL TO authenticated
  USING (recap_id IN (
    SELECT id FROM recaps
    WHERE team_id IN (
      SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
  ));
DROP POLICY IF EXISTS "recap_products_supplier_read" ON recap_products;
CREATE POLICY "recap_products_supplier_read" ON recap_products
  FOR SELECT TO authenticated
  USING (supplier_id IN (
    SELECT supplier_id FROM supplier_users WHERE user_id = auth.uid()
  ));

-- ── follow_ups ───────────────────────────────────────────────
DROP POLICY IF EXISTS "follow_ups_all_authenticated" ON follow_ups;
CREATE POLICY "follow_ups_team_scoped" ON follow_ups
  FOR ALL TO authenticated
  USING (team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid()
  ));
