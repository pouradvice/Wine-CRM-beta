import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
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

  // Get user's team
  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!memberRow) {
    return NextResponse.json({ error: 'User not in any team' }, { status: 403 });
  }

  const team_id = memberRow.team_id;

  // Use service role for inserts (bypasses RLS completely)
  const sbService = createServiceClient();

  let succeeded = 0;
  let skipped = 0;
  const failed: Array<{ index: number; error: string }> = [];

  for (let idx = 0; idx < body.rows.length; idx++) {
    const row = body.rows[idx];

    try {
      // Validate required field
      const companyName = String(row['company_name'] || '').trim();
      if (!companyName) {
        failed.push({
          index: idx,
          error: 'company_name is required',
        });
        continue;
      }

      // Validate/default status
      let status = String(row['status'] || 'Active').trim();
      if (!['Active', 'Prospective', 'Former'].includes(status)) {
        status = 'Active';
      }

      // Insert directly with service role (NO RLS)
      const { error } = await sbService
        .from('accounts')
        .insert({
          team_id,
          name: companyName,
          type: row['type'] ? String(row['type']).trim() || null : null,
          value_tier: row['value_tier'] ? String(row['value_tier']).trim() || null : null,
          phone: row['phone'] ? String(row['phone']).trim() || null : null,
          email: row['email'] ? String(row['email']).trim() || null : null,
          address: row['address'] ? String(row['address']).trim() || null : null,
          status,
          notes: row['notes'] ? String(row['notes']).trim() || null : null,
          is_active: true,
        });

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation
          skipped++;
        } else {
          failed.push({
            index: idx,
            error: mapDbError(error),
          });
        }
      } else {
        succeeded++;
      }
    } catch (e) {
      failed.push({
        index: idx,
        error: String(e),
      });
    }
  }

  return NextResponse.json(
    {
      succeeded,
      failed,
    },
    { status: 200 }
  );
}
