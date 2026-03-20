-- 21_fix_team_members_rls.sql
-- The original "team_members_own_rows" policy covered ALL operations with
-- USING (user_id = auth.uid()), which means a user could only SELECT their
-- own row.  Owners were therefore unable to read the full team member list
-- via the authenticated client — newly-added members appeared briefly
-- (optimistic UI) then vanished on the next page refresh.
--
-- Fix: split into separate policies:
--   • SELECT → any member can see all rows for their team(s)
--   • INSERT / UPDATE / DELETE → own row only (unchanged behaviour)

-- 1. Drop the old catch-all policy
DROP POLICY IF EXISTS "team_members_own_rows" ON team_members;

-- 2. SELECT: a user may read all rows that belong to a team they are in.
--    The sub-select is intentionally simple (WHERE user_id = auth.uid())
--    to avoid a recursive RLS cycle on the same table.
CREATE POLICY "team_members_read"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    team_id IN (
      SELECT tm.team_id
      FROM   team_members tm
      WHERE  tm.user_id = auth.uid()
    )
  );

-- 3. INSERT: a user may only insert their own row (handled by service-role
--    RPCs in practice, but the policy is the safety net).
CREATE POLICY "team_members_insert_own"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 4. UPDATE / DELETE: own row only.
CREATE POLICY "team_members_modify_own"
  ON team_members FOR UPDATE
  TO authenticated
  USING  (user_id = auth.uid());

CREATE POLICY "team_members_delete_own"
  ON team_members FOR DELETE
  TO authenticated
  USING  (user_id = auth.uid());
