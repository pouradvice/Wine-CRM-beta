// src/app/api/recap/save/route.ts
// POST /api/recap/save
//
// Replaces the direct saveRecap() call from RecapForm.
// Saves a recap via the save_recap RPC, optionally marks the account as
// completed in the active daily plan session (plan_session_id cookie), and
// returns a redirect hint so RecapForm knows where to navigate.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { todayLocal } from '@/lib/dateUtils';
import { mapDbError } from '@/types';

export async function POST(request: NextRequest) {
  // 1. Auth guard
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: { recap: Record<string, unknown>; products: Record<string, unknown>[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 3. Call save_recap RPC (same payload shape as data.ts saveRecap)
  const { data: recapId, error: rpcError } = await sb.rpc('save_recap', {
    p_recap:    body.recap,
    p_products: body.products,
  });

  // 4. If RPC error → return { error } with status 500
  if (rpcError) {
    return NextResponse.json({ error: mapDbError(rpcError) }, { status: 500 });
  }

  // 5–6. Read plan_session_id cookie and conditionally mark account completed
  let redirectToPlan = false;
  const sessionId = request.cookies.get('plan_session_id')?.value;
  const accountId = body.recap.account_id as string | undefined;

  if (sessionId && accountId) {
    // 6a. Fetch session — RLS enforces ownership
    const { data: session } = await sb
      .from('daily_plan_sessions')
      .select('id, account_ids, completed_account_ids, unplanned_account_ids, plan_date')
      .eq('id', sessionId)
      .maybeSingle();

    // 6b. Only act when session exists and belongs to today
    if (session && session.plan_date === todayLocal()) {
      const isInPlan    = (session.account_ids as string[]).includes(accountId);
      const alreadyDone = (session.completed_account_ids as string[]).includes(accountId);

      if (!alreadyDone) {
        if (isInPlan) {
          // Planned account — mark complete via existing RPC
          await sb.rpc('append_completed_account', {
            p_session_id: sessionId,
            p_account_id: accountId,
          });
        } else {
          // Unplanned stop — append to account_ids, completed_account_ids,
          // and unplanned_account_ids atomically via new RPC
          await sb.rpc('append_unplanned_account', {
            p_session_id: sessionId,
            p_account_id: accountId,
          });
        }
      }
      redirectToPlan = true;
    }
  }

  // 7. Build and return response
  // 8. Do NOT clear the plan_session_id cookie here — the review page handles that
  return NextResponse.json({
    ok:              true,
    recap_id:        recapId as string,
    redirect_to_plan: redirectToPlan,
  });
}
