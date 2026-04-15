import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { updateAttributionMatch } from '@/lib/data';
import { mapDbError } from '@/types';
import type { AttributionMatchStatus } from '@/types';

const VALID_STATUSES: AttributionMatchStatus[] = ['matched', 'disputed', 'resolved', 'voided'];

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
    const body: { status?: AttributionMatchStatus; notes?: string } = await request.json();

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const updates: {
      status?: AttributionMatchStatus;
      notes?: string;
      resolved_by?: string | null;
      resolved_at?: string | null;
    } = {};

    if (typeof body.status === 'string') {
      updates.status = body.status;
      if (body.status === 'resolved') {
        updates.resolved_by = user.id;
        updates.resolved_at = new Date().toISOString();
      }
    }

    if (typeof body.notes === 'string') {
      updates.notes = body.notes;
    }

    const updated = await updateAttributionMatch(sb, id, teamId, updates);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
