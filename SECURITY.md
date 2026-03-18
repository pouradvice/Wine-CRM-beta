# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please open a private security advisory on GitHub or email the maintainers directly. Do not open a public issue for security vulnerabilities.

---

## Security Surfaces

### Surface 1 — daily_plan_sessions (Row-Level Security)

**Table:** `daily_plan_sessions`

**RLS policy:** `user_id = auth.uid()`

**Why no additional server-side check is needed:**  
When the review page fetches a session by its `id` (read from the `plan_session_id` cookie), the query runs through Supabase's anon client with the authenticated user's JWT. Postgres enforces the RLS policy at the database layer — a row is only returned if `user_id` matches the requesting user's `auth.uid()`. This means a user who somehow obtains another user's session UUID cannot read that session; the database will return no rows and the page will redirect to `/app/crm/plan` as a stale-cookie fallback.

**Result:** No redundant `eq('user_id', user.id)` filter is needed in application code because the database enforces it unconditionally.

---

### Surface 2 — plan_session_id Cookie

**Cookie name:** `plan_session_id`

**Set by:** `POST /api/plan/save`

**Read by:** `/app/crm/plan/review` (server component) and `/app/crm/new-recap` (future sprint)

**Security properties:**
- `HttpOnly: true` — not accessible to client-side JavaScript
- `SameSite: Lax` — prevents CSRF from cross-site requests
- `Path: /` — scoped to the application root
- `Secure: true` in production (enforced by the Next.js cookie API when the request is HTTPS)

**Session lifetime:** The cookie is deleted by the review page when all accounts in `account_ids` have corresponding entries in `completed_account_ids` (all-done detection). It is also deleted if the `plan_date` does not match today's local date (stale session).

---

### Surface 3 — Account Context Query (no N+1)

The review page fetches all account context in a single PostgREST query using nested selects:

```
sb.from('accounts')
  .select('id, name, value_tier, recaps(visit_date), follow_ups!follow_ups_account_id_fkey(id, status)')
  .in('id', session.account_ids)
  .eq('team_id', session.team_id)
```

The `.eq('team_id', session.team_id)` filter is a defence-in-depth measure: even though RLS on `accounts` already restricts rows to the user's team, the explicit filter prevents the query from accidentally returning accounts from another team if RLS is misconfigured or temporarily disabled during a migration.
