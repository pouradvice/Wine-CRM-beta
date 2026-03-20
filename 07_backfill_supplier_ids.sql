-- ============================================================
-- 07_backfill_supplier_ids.sql
-- Backfills supplier_id on products and recap_products for rows
-- where the FK is NULL but resolvable through the brand chain.
-- Safe to re-run (WHERE supplier_id IS NULL guards each step).
-- Run once in the Supabase SQL editor after deploying this PR.
-- ============================================================

-- Step 1: products.supplier_id ← brands.supplier_id
UPDATE products p
SET    supplier_id = b.supplier_id
FROM   brands b
WHERE  p.brand_id    = b.id
  AND  p.supplier_id IS NULL
  AND  b.supplier_id IS NOT NULL;

-- Step 2: recap_products.supplier_id ← products.supplier_id
UPDATE recap_products rp
SET    supplier_id = p.supplier_id
FROM   products p
WHERE  rp.product_id   = p.id
  AND  rp.supplier_id  IS NULL
  AND  p.supplier_id   IS NOT NULL;
