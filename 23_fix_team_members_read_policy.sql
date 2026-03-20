-- 23_fix_team_members_read_policy.sql
-- The policy added in 21_fix_team_members_rls.sql used a self-referencing
-- subquery on team_members which causes "infinite recursion detected in policy"
-- in PostgreSQL / Supabase.  Fix: replace the recursive USING clause with a
-- SECURITY DEFINER function so the inner lookup bypasses RLS.

-- 1. Helper function: returns the set of team_ids the current user belongs to.
--    SECURITY DEFINER + search_path lock prevents privilege escalation.
CREATE OR REPLACE FUNCTION get_auth_user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM team_members WHERE user_id = auth.uid();
$$;

-- 2. Replace the recursive SELECT policy with one that calls the helper.
DROP POLICY IF EXISTS "team_members_read" ON team_members;

CREATE POLICY "team_members_read"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    team_id IN (SELECT get_auth_user_team_ids())
  );
