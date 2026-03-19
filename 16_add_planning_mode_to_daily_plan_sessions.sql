-- 16_add_planning_mode_to_daily_plan_sessions.sql
--
-- Adds planning_mode to daily_plan_sessions to record whether the rep
-- planned their day starting from accounts (account_first) or products
-- (product_first).

ALTER TABLE daily_plan_sessions
  ADD COLUMN IF NOT EXISTS planning_mode TEXT
    NOT NULL DEFAULT 'account_first'
    CHECK (planning_mode IN ('product_first', 'account_first'));
