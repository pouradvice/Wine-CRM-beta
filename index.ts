// supabase/functions/refresh-analytics/index.ts
// Scheduled edge function — refreshes all three materialized views.
// Deploy with: supabase functions deploy refresh-analytics
//
// Schedule via Supabase Dashboard → Database → Cron Jobs:
//   Function: refresh-analytics
//   Schedule: */15 * * * *   (every 15 minutes)
//
// Or add to supabase/config.toml:
//   [functions.refresh-analytics]
//   schedule = "*/15 * * * *"

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VIEWS = [
  'v_product_performance',
  'v_follow_up_queue',
  'v_products_by_buyer',
] as const;

Deno.serve(async (_req) => {
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const results: Record<string, string> = {};

  for (const view of VIEWS) {
    // CONCURRENTLY requires the unique indexes created in 02_migrations.sql.
    // If those indexes don't exist yet, this will fail with a clear error.
    const { error } = await sb.rpc('exec_sql', {
      sql: `REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`,
    });

    results[view] = error ? `ERROR: ${error.message}` : 'OK';
  }

  const allOk = Object.values(results).every((v) => v === 'OK');

  return new Response(
    JSON.stringify({ refreshed_at: new Date().toISOString(), results }),
    {
      status: allOk ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    },
  );
});
