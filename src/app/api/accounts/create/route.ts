// src/app/api/accounts/create/route.ts
// POST /api/accounts/create
// Creates a single account using the service-role client (bypasses RLS).
// User identity is verified with the anon client first; team_id is resolved
// from team_members before the service-role INSERT is executed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { mapDbError } from '@/types';

interface CreateAccountBody {
  name: string;
  type?: string;
  status?: string;
  phone?: string;
  email?: string;
  address?: string;
  value_tier?: string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CreateAccountBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Resolve team_id from team_members (authenticated client).
  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!memberRow) {
    return NextResponse.json({ error: 'User not in any team' }, { status: 403 });
  }

  const team_id = memberRow.team_id;

  // Validate/default status
  let status = String(body.status || 'Active').trim();
  if (!['Active', 'Prospective', 'Former'].includes(status)) {
    status = 'Active';
  }

  // Use service role for the INSERT (bypasses RLS completely).
  const sbService = createServiceClient();

  const { data, error } = await sbService
    .from('accounts')
    .insert({
      team_id,
      name,
      type: body.type ? String(body.type).trim() || null : null,
      value_tier: body.value_tier ? String(body.value_tier).trim() || null : null,
      phone: body.phone ? String(body.phone).trim() || null : null,
      email: body.email ? String(body.email).trim() || null : null,
      address: body.address ? String(body.address).trim() || null : null,
      status,
      notes: body.notes ? String(body.notes).trim() || null : null,
      is_active: true,
    })
    .select('id, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: mapDbError(error) }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
