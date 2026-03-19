// src/app/api/plan/save/route.ts
// POST /api/plan/save — creates (or replaces) a daily plan session and sets the plan_session_id cookie.

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { todayLocal } from '@/lib/dateUtils';
import type { PlanningMode } from '@/types';

interface SavePlanBody {
  account_ids:   string[];
  product_ids:   string[];
  planning_mode?: PlanningMode;
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 });
  }

  let body: SavePlanBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'BAD_REQUEST' }, { status: 400 });
  }

  const { account_ids, product_ids } = body;

  if (!Array.isArray(account_ids) || account_ids.length === 0) {
    return NextResponse.json(
      { error: 'account_ids must be a non-empty array', code: 'VALIDATION_ERROR' },
      { status: 422 },
    );
  }

  if (!Array.isArray(product_ids)) {
    return NextResponse.json(
      { error: 'product_ids must be an array', code: 'VALIDATION_ERROR' },
      { status: 422 },
    );
  }

  // Resolve team_id for the current user
  const { data: membership } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'No team found', code: 'NO_TEAM' }, { status: 403 });
  }

  const plan_date = todayLocal();

  // Upsert: one active plan per user per day
  const { data: session, error } = await sb
    .from('daily_plan_sessions')
    .upsert(
      {
        user_id:               user.id,
        team_id:               membership.team_id,
        plan_date,
        account_ids,
        product_ids,
        completed_account_ids: [],
        planning_mode:         body.planning_mode === 'product_first' ? 'product_first' : 'account_first',
        // ^ Coerce any missing or invalid value to 'account_first' (spec: do NOT return a validation error)
      },
      { onConflict: 'user_id,plan_date' },
    )
    .select('id')
    .single();

  if (error || !session) {
    console.error('[plan/save] upsert error:', {
      message: error?.message,
      code:    error?.code,
      details: error?.details,
      hint:    error?.hint,
    });
    return NextResponse.json(
      { error: 'Failed to save plan session', code: error?.code ?? 'DB_ERROR' },
      { status: 500 },
    );
  }

  // Set the plan_session_id cookie so the review page can read it
  const cookieStore = await cookies();
  cookieStore.set('plan_session_id', session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    // No maxAge — session cookie; cleared on all-done or stale-date
  });

  return NextResponse.json({ ok: true, session_id: session.id });
}
