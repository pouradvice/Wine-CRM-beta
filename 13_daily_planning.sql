-- 13_daily_planning.sql
--
-- Adds the daily_plan_sessions table and the three RPCs used by the
-- daily planning feature (getSuggestedProductsForDay,
-- getSuggestedAccountsForProducts, append_completed_account).
--
-- Depends on: 04_schema_rework.sql (accounts, products, recaps,
--             recap_products, follow_ups, team_members tables)
-- Safe to run more than once: CREATE TABLE uses IF NOT EXISTS;
-- functions use CREATE OR REPLACE; policies use DROP IF EXISTS before CREATE.


-- ══════════════════════════════════════════════════════════════
-- 1. daily_plan_sessions table
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_plan_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id               UUID        NOT NULL,
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_date             DATE        NOT NULL DEFAULT CURRENT_DATE,
  account_ids           UUID[]      NOT NULL DEFAULT '{}',
  product_ids           UUID[]      NOT NULL DEFAULT '{}',
  completed_account_ids UUID[]      NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at trigger (reuses the set_updated_at() function already in schema)
DROP TRIGGER IF EXISTS trg_daily_plan_sessions_updated_at ON daily_plan_sessions;
CREATE TRIGGER trg_daily_plan_sessions_updated_at
  BEFORE UPDATE ON daily_plan_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ══════════════════════════════════════════════════════════════
-- 2. Row Level Security
--
-- Daily plans are personal to the rep who created them.
-- User-scoped (NOT team-scoped) — a team member should not be
-- able to read another member's daily bag selection.
-- Matches the supplier_users_own_rows pattern.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE daily_plan_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_plan_sessions_own_rows" ON daily_plan_sessions;
CREATE POLICY "daily_plan_sessions_own_rows"
  ON daily_plan_sessions FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════
-- 3. Indexes
-- ══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_daily_plan_sessions_user_id
  ON daily_plan_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_daily_plan_sessions_user_date
  ON daily_plan_sessions (user_id, plan_date DESC);


-- ══════════════════════════════════════════════════════════════
-- 4. getSuggestedProductsForDay
--
-- Ranks active products for a given set of target accounts.
-- Does NOT use v_product_performance — that view collapses all
-- accounts into a team-level aggregate and has no account_id.
-- Instead, joins recap_products + recaps directly to produce
-- per-account signals.
--
-- Scoring:
--   coverage (accounts_covered)  × 4.0  — primary signal
--   conversion_rate (0–100)      × 0.05 — secondary signal
--   value_tier_weight (1.0–3.0)         — tiebreaker / fallback
--
-- Products with no recap history still appear, scored on
-- value_tier_weight alone (≥ 1.0). New reps always get results.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION getSuggestedProductsForDay(
  p_team_id     UUID,
  p_account_ids UUID[]
)
RETURNS TABLE (
  product_id         UUID,
  wine_name          TEXT,
  sku_number         TEXT,
  brand_name         TEXT,
  type               TEXT,
  accounts_covered   INT,
  conversion_rate    NUMERIC,
  value_tier_weight  NUMERIC,
  score              NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  account_product_history AS (
    SELECT
      rp.product_id,
      r.account_id,
      COUNT(rp.id) FILTER (WHERE rp.outcome = 'Yes Today') AS orders,
      COUNT(rp.id)                                          AS shown
    FROM recap_products rp
    JOIN recaps r ON r.id = rp.recap_id
    WHERE r.team_id    = p_team_id
      AND r.account_id = ANY(p_account_ids)
    GROUP BY rp.product_id, r.account_id
  ),
  product_signals AS (
    SELECT
      p.id                                                      AS product_id,
      p.wine_name,
      p.sku_number,
      b.name                                                    AS brand_name,
      p.type,
      COUNT(DISTINCT aph.account_id)                           AS accounts_covered,
      ROUND(
        100.0 * SUM(aph.orders) / NULLIF(SUM(aph.shown), 0), 1
      )                                                         AS conversion_rate,
      ROUND(
        AVG(CASE a.value_tier
          WHEN 'A' THEN 3.0
          WHEN 'B' THEN 2.0
          WHEN 'C' THEN 1.0
          ELSE 1.0
        END), 2
      )                                                         AS value_tier_weight
    FROM products p
    LEFT JOIN brands b   ON b.id = p.brand_id
    LEFT JOIN account_product_history aph ON aph.product_id = p.id
    LEFT JOIN accounts a
      ON a.id = ANY(p_account_ids)
      AND a.id IN (
        SELECT account_id FROM account_product_history
        WHERE product_id = p.id
      )
    WHERE p.team_id   = p_team_id
      AND p.is_active = TRUE
    GROUP BY p.id, p.wine_name, p.sku_number, b.name, p.type
  )
  SELECT
    product_id,
    wine_name,
    sku_number,
    brand_name,
    type,
    accounts_covered::INT,
    conversion_rate,
    value_tier_weight,
    ROUND(
      (COALESCE(accounts_covered, 0)    * 4.0)
      + (COALESCE(conversion_rate, 0)   * 0.05)
      + COALESCE(value_tier_weight, 1.0)
    , 2) AS score
  FROM product_signals
  ORDER BY score DESC, accounts_covered DESC, wine_name ASC;
$$;


-- ══════════════════════════════════════════════════════════════
-- 5. getSuggestedAccountsForProducts
--
-- Ranks active accounts for a given set of target products.
-- Returns products_matched — the count of the supplied products
-- that have recap history at each account. The UI uses this
-- column directly to render "Matches X selected products".
--
-- Scoring:
--   products_matched             × 3.0  — primary signal
--   recency gap (days since last visit)  — accounts not visited
--                                          recently score higher
--   value_tier                           — A=2.0, B=1.0, else 0.5
--   open follow-up urgency (capped at 2.0)
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION getSuggestedAccountsForProducts(
  p_team_id     UUID,
  p_product_ids UUID[]
)
RETURNS TABLE (
  account_id        UUID,
  account_name      TEXT,
  value_tier        TEXT,
  last_visit_date   DATE,
  open_follow_ups   INT,
  products_matched  INT,
  score             NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  account_product_overlap AS (
    SELECT
      r.account_id,
      COUNT(DISTINCT rp.product_id) AS products_matched
    FROM recap_products rp
    JOIN recaps r ON r.id = rp.recap_id
    WHERE r.team_id     = p_team_id
      AND rp.product_id = ANY(p_product_ids)
    GROUP BY r.account_id
  ),
  account_context AS (
    SELECT
      a.id                AS account_id,
      a.name              AS account_name,
      a.value_tier,
      MAX(r.visit_date)   AS last_visit_date,
      COUNT(fu.id) FILTER (WHERE fu.status IN ('Open','Snoozed')) AS open_follow_ups
    FROM accounts a
    LEFT JOIN recaps     r  ON r.account_id = a.id AND r.team_id = p_team_id
    LEFT JOIN follow_ups fu ON fu.account_id = a.id AND fu.team_id = p_team_id
    WHERE a.team_id   = p_team_id
      AND a.is_active = TRUE
    GROUP BY a.id, a.name, a.value_tier
  )
  SELECT
    ac.account_id,
    ac.account_name,
    ac.value_tier,
    ac.last_visit_date,
    ac.open_follow_ups::INT,
    COALESCE(apo.products_matched, 0)::INT AS products_matched,
    ROUND(
      (COALESCE(apo.products_matched, 0) * 3.0)
      + CASE
          WHEN ac.last_visit_date IS NULL              THEN 3.0
          WHEN ac.last_visit_date < CURRENT_DATE - 14 THEN 2.0
          WHEN ac.last_visit_date < CURRENT_DATE - 7  THEN 1.0
          ELSE 0.0
        END
      + CASE ac.value_tier
          WHEN 'A' THEN 2.0
          WHEN 'B' THEN 1.0
          ELSE 0.5
        END
      + LEAST(ac.open_follow_ups::NUMERIC * 0.5, 2.0)
    , 2) AS score
  FROM account_context ac
  LEFT JOIN account_product_overlap apo ON apo.account_id = ac.account_id
  ORDER BY score DESC, ac.last_visit_date ASC NULLS FIRST, ac.account_name ASC;
$$;


-- ══════════════════════════════════════════════════════════════
-- 6. append_completed_account
--
-- Atomically appends an account_id to completed_account_ids on a
-- plan session. Uses array_append inside an UPDATE so there is no
-- read-modify-write race condition if two requests fire at once.
-- The NOT (p_account_id = ANY(...)) guard makes the call idempotent.
-- RLS (user_id = auth.uid()) is re-enforced in the WHERE clause
-- even though this is SECURITY DEFINER.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION append_completed_account(
  p_session_id UUID,
  p_account_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE daily_plan_sessions
  SET    completed_account_ids = array_append(completed_account_ids, p_account_id),
         updated_at            = NOW()
  WHERE  id      = p_session_id
    AND  user_id = auth.uid()
    AND  NOT (p_account_id = ANY(completed_account_ids));
$$;


-- ══════════════════════════════════════════════════════════════
-- 7. Grants
-- ══════════════════════════════════════════════════════════════

REVOKE ALL    ON FUNCTION getSuggestedProductsForDay(UUID, UUID[])      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION getSuggestedProductsForDay(UUID, UUID[])      TO authenticated;

REVOKE ALL    ON FUNCTION getSuggestedAccountsForProducts(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION getSuggestedAccountsForProducts(UUID, UUID[]) TO authenticated;

REVOKE ALL    ON FUNCTION append_completed_account(UUID, UUID)          FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_completed_account(UUID, UUID)          TO authenticated;
