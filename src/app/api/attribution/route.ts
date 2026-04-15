import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAttributionMatches } from '@/lib/data';
import { resolveTeamId } from '@/lib/team';
import { mapDbError } from '@/types';

const VALID_STATUSES = new Set(['matched', 'disputed', 'resolved', 'voided']);

function parseIntegerParam(value: string | null, allowZero = false): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return undefined;
  if (allowZero ? parsed < 0 : parsed <= 0) return undefined;
  return parsed;
}

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = await resolveTeamId(sb, user);
    const supplierId = request.nextUrl.searchParams.get('supplier_id') ?? undefined;
    const statusParam = request.nextUrl.searchParams.get('status');
    const status = statusParam && VALID_STATUSES.has(statusParam) ? statusParam : undefined;

    const limitParam = request.nextUrl.searchParams.get('limit');
    const offsetParam = request.nextUrl.searchParams.get('offset');
    const parsedLimit = parseIntegerParam(limitParam, false);
    const parsedOffset = parseIntegerParam(offsetParam, true);

    const matches = await getAttributionMatches(sb, teamId, {
      supplierId,
      status: status as 'matched' | 'disputed' | 'resolved' | 'voided' | undefined,
      limit: parsedLimit,
      offset: parsedOffset,
    });

    return NextResponse.json(matches);
  } catch (err) {
    const message = err instanceof Error ? err.message : mapDbError({ message: String(err) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
