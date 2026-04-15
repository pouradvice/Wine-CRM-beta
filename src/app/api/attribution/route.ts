import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAttributionMatches } from '@/lib/data';
import { resolveTeamId } from '@/lib/team';
import { mapDbError } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = await resolveTeamId(sb, user);
    const supplierId = request.nextUrl.searchParams.get('supplier_id') ?? undefined;
    const status = request.nextUrl.searchParams.get('status') ?? undefined;

    const limitParam = request.nextUrl.searchParams.get('limit');
    const offsetParam = request.nextUrl.searchParams.get('offset');
    const limit = limitParam ? Number(limitParam) : undefined;
    const offset = offsetParam ? Number(offsetParam) : undefined;

    const matches = await getAttributionMatches(sb, teamId, {
      supplierId,
      status: status as 'matched' | 'disputed' | 'resolved' | 'voided' | undefined,
      limit: Number.isFinite(limit) ? limit : undefined,
      offset: Number.isFinite(offset) ? offset : undefined,
    });

    return NextResponse.json(matches);
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
