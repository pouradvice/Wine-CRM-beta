-- ============================================================
-- 24_backfill_supplier_contracts.sql
-- Backfills supplier_contracts rows for every supplier already
-- referenced in a team's brands catalog.
--
-- Problem: brands.supplier_id (and products.supplier_id) link
-- team catalog rows to the shared suppliers table, but
-- getSuppliers(sb, teamId) gates visibility through
-- supplier_contracts. If no contract row exists the supplier
-- is invisible even though the team already uses that supplier.
--
-- Safe to re-run: ON CONFLICT (team_id, supplier_id) DO NOTHING
-- ============================================================

INSERT INTO supplier_contracts (team_id, supplier_id, status)
SELECT DISTINCT
  b.team_id,
  b.supplier_id,
  'active' AS status
FROM   brands b
WHERE  b.supplier_id IS NOT NULL
  AND  NOT EXISTS (
    SELECT 1
    FROM   supplier_contracts sc
    WHERE  sc.team_id     = b.team_id
      AND  sc.supplier_id = b.supplier_id
  )
ON CONFLICT (team_id, supplier_id) DO NOTHING;

-- Also cover any supplier_id that landed on products directly
-- (via the denormalized column) but whose brand may be NULL.
INSERT INTO supplier_contracts (team_id, supplier_id, status)
SELECT DISTINCT
  p.team_id,
  p.supplier_id,
  'active' AS status
FROM   products p
WHERE  p.supplier_id IS NOT NULL
  AND  NOT EXISTS (
    SELECT 1
    FROM   supplier_contracts sc
    WHERE  sc.team_id     = p.team_id
      AND  sc.supplier_id = p.supplier_id
  )
ON CONFLICT (team_id, supplier_id) DO NOTHING;
