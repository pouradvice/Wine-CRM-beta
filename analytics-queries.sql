-- ============================================================
-- Pour Advice Phase 1 — Analytics Queries
-- These run against the Supabase views created in 01_schema.sql
-- ============================================================

-- ── 1. Product Performance Ranking ───────────────────────────
-- Top SKUs by conversion rate (min 3 showings to qualify)
SELECT
  sku_number,
  wine_name,
  brand_name,
  type,
  times_shown,
  orders_placed,
  committed,
  avg_order_probability,
  conversion_rate_pct,
  last_shown_date
FROM v_product_performance
WHERE times_shown >= 3
ORDER BY conversion_rate_pct DESC NULLS LAST, times_shown DESC
LIMIT 20;


-- ── 2. Order / Follow-Up Queue ────────────────────────────────
-- All open Yes Today + Yes Later items, sorted by date
SELECT
  id,
  due_date,
  bill_date,
  client_name,
  buyer_name,
  wine_name,
  sku_number,
  outcome,
  buyer_feedback,
  salesperson,
  is_overdue
FROM v_follow_up_queue
WHERE outcome IN ('Yes Today', 'Yes Later')
ORDER BY due_date ASC NULLS LAST;


-- ── 3. Visits by Supplier ─────────────────────────────────────
-- Products shown per visit, grouped by brand/supplier
SELECT
  b.name                   AS brand,
  b.supplier,
  r.visit_date,
  c.company_name           AS account,
  p.sku_number,
  p.wine_name,
  rp.outcome,
  rp.buyer_feedback,
  rp.order_probability
FROM recap_products rp
JOIN recaps r       ON r.id = rp.recap_id
JOIN products p     ON p.id = rp.product_id
JOIN clients c      ON c.id = r.client_id
LEFT JOIN brands b  ON b.id = p.brand_id
ORDER BY b.name ASC NULLS LAST, r.visit_date DESC;


-- ── 4. Products by Buyer ──────────────────────────────────────
SELECT *
FROM v_products_by_buyer
WHERE buyer_name IS NOT NULL
ORDER BY client_name, buyer_name, times_shown DESC;


-- ── 5. Salesperson Activity Summary ──────────────────────────
SELECT
  r.salesperson,
  COUNT(DISTINCT r.id)                                    AS total_visits,
  COUNT(DISTINCT r.client_id)                             AS unique_accounts,
  COUNT(rp.id)                                            AS products_shown,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')   AS orders,
  ROUND(
    AVG(rp.order_probability) FILTER (WHERE rp.order_probability IS NOT NULL),
    1
  )                                                       AS avg_probability,
  MIN(r.visit_date)                                       AS first_visit,
  MAX(r.visit_date)                                       AS last_visit
FROM recaps r
JOIN recap_products rp ON rp.recap_id = r.id
GROUP BY r.salesperson
ORDER BY total_visits DESC;


-- ── 6. Conversion Funnel per SKU (last 90 days) ──────────────
SELECT
  p.sku_number,
  p.wine_name,
  COUNT(rp.id)                                              AS shown,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today')     AS ordered_immediate,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Later')     AS committed_future,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'Maybe Later')   AS warm_pipeline,
  COUNT(rp.id) FILTER (WHERE rp.outcome = 'No')            AS rejected,
  ROUND(
    100.0 * COUNT(rp.id) FILTER (WHERE rp.outcome IN ('Yes Today', 'Yes Later'))
    / NULLIF(COUNT(rp.id), 0), 1
  )                                                         AS commit_rate_pct
FROM products p
JOIN recap_products rp ON rp.product_id = p.id
JOIN recaps r           ON r.id = rp.recap_id
WHERE r.visit_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY p.id, p.sku_number, p.wine_name
HAVING COUNT(rp.id) > 0
ORDER BY commit_rate_pct DESC NULLS LAST;


-- ── 7. Inactive Account Alert ────────────────────────────────
-- Active clients with no recap in the last 60 days
SELECT
  c.id,
  c.company_name,
  c.account_lead,
  c.value_tier,
  MAX(r.visit_date)   AS last_visit,
  CURRENT_DATE - MAX(r.visit_date) AS days_since_visit
FROM clients c
LEFT JOIN recaps r ON r.client_id = c.id
WHERE c.status = 'Active'
  AND c.is_active = TRUE
GROUP BY c.id, c.company_name, c.account_lead, c.value_tier
HAVING MAX(r.visit_date) < CURRENT_DATE - INTERVAL '60 days'
    OR MAX(r.visit_date) IS NULL
ORDER BY days_since_visit DESC NULLS FIRST;
