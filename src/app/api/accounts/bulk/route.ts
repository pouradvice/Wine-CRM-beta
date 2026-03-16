// src/app/api/accounts/bulk/route.ts
// POST /api/accounts/bulk
// Bulk-imports accounts via the bulk_import_accounts() DB function.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapDbError } from '@/types';

// LATENT: team_member role gate — uncomment to activate
// const { data: memberRow } = await sb.from('team_members').select('role').eq('user_id', user.id).single();
// if (memberRow?.role === 'member') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { rows?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rows = body.rows ?? [];

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, errors: [] });
  }

  if (rows.length > 2000) {
    return NextResponse.json(
      { error: 'Maximum 2 000 rows per import.' },
      { status: 422 },
    );
  }

  // Resolve team_id — individual users fall back to user.id
  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const team_id: string = memberRow?.team_id ?? user.id;

  const { data, error } = await sb.rpc('bulk_import_accounts', {
    p_rows: rows,
    p_team_id: team_id,
  });

  if (error) {
    return NextResponse.json({ error: mapDbError(error) }, { status: 500 });
  }

  return NextResponse.json(data);
}
