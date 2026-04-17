-- ============================================================
-- 35_migrate_distributor_text.sql
-- Backfill products.distributor (TEXT) -> product_distributions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS product_distribution_unmatched_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  distributor_text  TEXT NOT NULL,
  team_id           UUID NOT NULL,
  reason            TEXT NOT NULL DEFAULT 'No distributor fuzzy match',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

WITH source_rows AS (
  SELECT
    p.id,
    p.team_id,
    p.region,
    TRIM(p.distributor) AS distributor_text
  FROM products p
  WHERE p.distributor IS NOT NULL
    AND TRIM(p.distributor) <> ''
),
matched_rows AS (
  SELECT
    s.id AS product_id,
    s.team_id,
    s.region,
    s.distributor_text,
    d.id AS distributor_id,
    ROW_NUMBER() OVER (
      PARTITION BY s.id
      ORDER BY similarity(LOWER(d.name), LOWER(s.distributor_text)) DESC, d.name ASC
    ) AS rn
  FROM source_rows s
  JOIN distributors d
    ON LOWER(d.name) % LOWER(s.distributor_text)
    OR LOWER(d.name) LIKE '%' || LOWER(s.distributor_text) || '%'
    OR LOWER(s.distributor_text) LIKE '%' || LOWER(d.name) || '%'
),
best_match AS (
  SELECT *
  FROM matched_rows
  WHERE rn = 1
)
INSERT INTO product_distributions (
  product_id,
  distributor_id,
  territory,
  team_id,
  is_active,
  notes
)
SELECT
  bm.product_id,
  bm.distributor_id,
  COALESCE(NULLIF(TRIM(bm.region), ''), 'Default') AS territory,
  bm.team_id,
  TRUE,
  'Backfilled from products.distributor'
FROM best_match bm
ON CONFLICT (product_id, distributor_id, territory) DO NOTHING;

INSERT INTO product_distribution_unmatched_log (product_id, distributor_text, team_id)
SELECT
  s.id,
  s.distributor_text,
  s.team_id
FROM (
  SELECT
    p.id,
    p.team_id,
    TRIM(p.distributor) AS distributor_text
  FROM products p
  WHERE p.distributor IS NOT NULL
    AND TRIM(p.distributor) <> ''
) s
WHERE NOT EXISTS (
  SELECT 1
  FROM product_distributions pd
  WHERE pd.product_id = s.id
)
AND NOT EXISTS (
  SELECT 1
  FROM product_distribution_unmatched_log l
  WHERE l.product_id = s.id
    AND l.distributor_text = s.distributor_text
);

NOTIFY pgrst, 'reload schema';
