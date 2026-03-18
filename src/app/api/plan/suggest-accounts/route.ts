// src/app/api/plan/suggest-accounts/route.ts
// POST /api/plan/suggest-accounts
//
// Returns ranked account suggestions for a given set of product ids.
//
// Security: team_id is always resolved server-side via resolveTeamId —
// never trusted from the request body. See SECURITY.md for the
// two-surface protection model.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
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

    let body: { product_ids?: string[] };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const productIds = body.product_ids ?? [];
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'product_ids must be a non-empty array' }, { status: 400 });
    }

    const { data, error } = await sb.rpc('getSuggestedAccountsForProducts', {
      p_team_id:    teamId,
      p_product_ids: productIds,
    });

    if (error) {
      return NextResponse.json({ error: mapDbError(error) }, { status: 500 });
    }

    return NextResponse.json(data ?? []);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: mapDbError(e) }, { status: 500 });
  }
}
