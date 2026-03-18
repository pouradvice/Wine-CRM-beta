// src/app/api/plan/save/route.ts
// POST /api/plan/save
//
// Inserts a daily_plan_sessions row and sets a plan_session_id cookie
// so subsequent Server Components (plan/review) can load the session
// without a query-param.
//
// Security: team_id is always resolved server-side via resolveTeamId —
// never trusted from the request body. See SECURITY.md for the
// two-surface protection model.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { todayLocal } from '@/lib/dateUtils';
import { mapDbError } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // team_id resolved server-side via resolveTeamId — not trusted from client payload.
    // See SECURITY.md for the two-surface protection model.
    const teamId = await resolveTeamId(sb, user);

    let body: { account_ids?: string[]; product_ids?: string[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const accountIds = body.account_ids ?? [];
    const productIds = body.product_ids ?? [];

    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return NextResponse.json({ error: 'account_ids must be a non-empty array' }, { status: 400 });
    }
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'product_ids must be a non-empty array' }, { status: 400 });
    }

    const { data, error } = await sb
      .from('daily_plan_sessions')
      .insert({
        team_id:     teamId,
        user_id:     user.id,
        plan_date:   todayLocal(),
        account_ids: accountIds,
        product_ids: productIds,
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: mapDbError(error) }, { status: 500 });
    }

    const sessionId: string = data.id;

    const response = NextResponse.json({ ok: true, session_id: sessionId });
    response.cookies.set('plan_session_id', sessionId, {
      path:     '/app',
      httpOnly: true,
      sameSite: 'lax',
      maxAge:   60 * 60 * 20,
    });

    return response;
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: mapDbError(e) }, { status: 500 });
  }
}
