// src/app/api/import/clients/route.ts
// POST /api/import/clients
// Accepts { rows: AccountInsert[] }, delegates to bulk_import_accounts() (SECURITY DEFINER),
// returns succeeded/failed counts. Uses the stored function to bypass RLS for all roles.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapDbError } from '@/types';

interface ImportBody {
  rows: Array<Record<string, unknown>>;
}

interface ImportResponse {
  succeeded: number;
  failed: Array<{ index: number; error: string }>;
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  // Resolve team_id from team_members.
  // The handle_new_user() trigger provisions every signup with an owner row,
  // so memberRow should always be present.  Falling back to user.id is a
  // safety net for accounts created before the trigger was applied.
  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const team_id: string = memberRow?.team_id ?? user.id;

  const { data, error } = await sb.rpc('bulk_import_accounts', {
    p_rows: body.rows,
    p_team_id: team_id,
  });

  if (error) {
    return NextResponse.json({ error: mapDbError(error) }, { status: 500 });
  }

  // bulk_import_accounts returns { inserted, skipped, errors: string[] }.
  // Transform to the { succeeded, failed } shape expected by CSVImporter.
  const errors: string[] = (data as { errors?: string[] })?.errors ?? [];
  const failed: Array<{ index: number; error: string }> = errors.map((msg: string) => {
    const match = /^Row (\d+):\s*/.exec(msg);
    // Use -1 when the row number cannot be parsed so callers know the row is unidentified.
    const index = match ? parseInt(match[1], 10) - 1 : -1;
    const errorMsg = match ? msg.slice(match[0].length) : msg;
    return { index, error: errorMsg };
  });

  const response: ImportResponse = {
    succeeded: ((data as { inserted?: number })?.inserted ?? 0) +
               ((data as { skipped?: number })?.skipped ?? 0),
    failed,
  };

  return NextResponse.json(response, { status: 200 });
}
