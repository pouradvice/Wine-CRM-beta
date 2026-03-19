-- 17_add_unplanned_account_support.sql
--
-- Adds unplanned_account_ids column to daily_plan_sessions and a new RPC
-- to atomically append an account to both account_ids and
-- completed_account_ids (and unplanned_account_ids) when a rep logs a
-- recap for an account not in their original plan.

ALTER TABLE daily_plan_sessions
  ADD COLUMN IF NOT EXISTS unplanned_account_ids UUID[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION append_unplanned_account(
  p_session_id UUID,
  p_account_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE daily_plan_sessions
  SET
    account_ids           = array_append(account_ids, p_account_id),
    completed_account_ids = array_append(completed_account_ids, p_account_id),
    unplanned_account_ids = array_append(unplanned_account_ids, p_account_id)
  WHERE id = p_session_id
    AND (SELECT auth.uid()) = user_id
    AND NOT (p_account_id = ANY(account_ids));
    -- ^ Idempotency guard: silently no-ops if the account is already in the plan.
END;
$$;

REVOKE ALL    ON FUNCTION append_unplanned_account(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_unplanned_account(UUID, UUID) TO authenticated;
