// src/app/api/tasting-requests/[id]/route.ts
// PATCH /api/tasting-requests/[id]
// Updates the status of a tasting request, scoped to the authenticated user's team.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { mapDbError } from '@/types';
import type { TastingRequestStatus } from '@/types';

const VALID_STATUSES: TastingRequestStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sb = await createClient();

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = await resolveTeamId(sb, user);

    const body: { status: TastingRequestStatus } = await request.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    // Scope update to the user's team to prevent cross-team data access
    const { data, error } = await sb
      .from('tasting_requests')
      .update({ status })
      .eq('id', id)
      .eq('team_id', teamId)
      .select('id, status')
      .single();

    if (error) {
      const httpStatus = error.code === 'PGRST116' ? 404 : 500;
      return NextResponse.json({ error: mapDbError(error) }, { status: httpStatus });
    }

    return NextResponse.json({ ok: true, id: data.id, status: data.status });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: mapDbError(e) }, { status: 500 });
  }
}
