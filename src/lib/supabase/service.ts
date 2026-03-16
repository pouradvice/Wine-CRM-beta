// src/lib/supabase/service.ts
// Service-role Supabase client — bypasses RLS entirely.
// Use ONLY in server-side Route Handlers after the caller's identity has
// already been verified with the anon client and the correct team_id has
// been resolved from team_members.  Do NOT import in Client Components.

import { createClient } from '@supabase/supabase-js';

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
