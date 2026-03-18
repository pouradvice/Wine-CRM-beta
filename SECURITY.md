# SECURITY.md

## Two-Surface Protection Model

The daily planning feature enforces authorization at two distinct surfaces.
This document explains why each surface uses a different mechanism.

---

### Surface 1 — Server Component reads

**Affected routes:** `new-recap/page.tsx`, `plan/review/page.tsx`

Server Components that read a user's own session use the **anon Supabase client**.
The `daily_plan_sessions` table has an RLS policy:

```sql
CREATE POLICY "daily_plan_sessions_own_rows"
  ON daily_plan_sessions FOR ALL
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

Postgres rejects any read or write whose `user_id` does not match `auth.uid()`.
**No additional application-layer team check is needed on reads** because
protection is on row identity (a session UUID that the calling user must own).

---

### Surface 2 — Route Handler writes/queries

**Affected routes:** `/api/plan/suggest-products`, `/api/plan/suggest-accounts`, `/api/plan/save`

Route Handlers that query or write by **team identity** call
`resolveTeamId(sb, user)` before passing `p_team_id` to any scoring RPC or
inserting into `daily_plan_sessions`.

Without server-side resolution a client could POST an arbitrary `team_id` and
receive suggestions scoped to a team they don't belong to.
The RPCs are `SECURITY DEFINER`, so the caller's RLS context is not applied
inside them. `resolveTeamId` derives `team_id` from
`team_members WHERE user_id = auth.uid()` — itself an RLS-protected table — so
the team can never be spoofed from the client payload.

> **Rule:** `team_id` is **always** resolved server-side in Route Handlers.
> Never read `team_id` from the request body.

---

### Why the approaches differ

| Surface | What is being protected | Mechanism |
|---------|------------------------|-----------|
| Server Component reads | Row ownership (session UUID belongs to caller) | RLS `user_id = auth.uid()` |
| Route Handler writes / RPC calls | Team membership (team UUID must belong to caller) | `resolveTeamId` server-side resolution |

Server Components query by **row identity**: the caller must own the row.
Route Handlers query by **team identity**: the caller must be a member of the team.

Do not move either pattern to the client.
