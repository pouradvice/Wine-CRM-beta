-- 15_fix_plan_sessions_unique.sql
--
-- Adds the unique constraint required by the upsert in /api/plan/save.
-- PostgREST onConflict resolution requires a real UNIQUE constraint, not just
-- a plain index.  The existing idx_daily_plan_sessions_user_date plain index is
-- replaced by a UNIQUE index that doubles as the constraint backing.

-- Step 1: drop the plain (non-unique) composite index added by migration 13
DROP INDEX IF EXISTS idx_daily_plan_sessions_user_date;

-- Step 2: create a unique index (this IS the constraint backing)
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_plan_sessions_user_date
  ON daily_plan_sessions (user_id, plan_date);

-- Step 3: attach it as a named constraint so PostgREST can resolve it
--         Use DO block to guard against re-running
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_daily_plan_sessions_user_date'
      AND conrelid = 'daily_plan_sessions'::regclass
  ) THEN
    ALTER TABLE daily_plan_sessions
      ADD CONSTRAINT uq_daily_plan_sessions_user_date
      UNIQUE USING INDEX uq_daily_plan_sessions_user_date;
  END IF;
END;
$$;
