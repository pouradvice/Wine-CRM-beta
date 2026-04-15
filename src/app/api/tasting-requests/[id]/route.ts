// src/app/api/tasting-requests/[id]/route.ts
// GET /api/tasting-requests/[id]
// Returns tasting request details (including items + products) scoped to the
// authenticated user's team.
//
// PATCH /api/tasting-requests/[id]
// Updates tasting request status/linkage scoped to the authenticated user's team.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { mapDbError } from '@/types';
import type { TastingRequestStatus } from '@/types';

const VALID_STATUSES: TastingRequestStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sb = await createClient();

    const { data: { user } } = await sb.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const teamId = await resolveTeamId(sb, user);

    const { data, error } = await sb
      .from('tasting_requests')
      .select(`
        id,
        team_id,
        visitor_email,
        company_name,
        calendly_event_uri,
        status,
        notes,
        recap_id,
        created_at,
        tasting_request_items (
          id,
          request_id,
          product_id,
          buyer_notes,
          created_at,
          product:products (
            id,
            wine_name,
            sku_number,
            type,
            varietal
          )
        )
      `)
      .eq('id', id)
      .eq('team_id', teamId)
      .single();

    if (error) {
      const httpStatus = error.code === 'PGRST116' ? 404 : 500;
      return NextResponse.json({ error: mapDbError(error) }, { status: httpStatus });
    }

    return NextResponse.json({ data });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: mapDbError(e) }, { status: 500 });
  }
}

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

    const body: { status?: TastingRequestStatus; recap_id?: string | null } = await request.json();
    const { status, recap_id } = body;

    if (status && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    if (!status && recap_id === undefined) {
      return NextResponse.json(
        { error: 'Provide at least one field to update (status or recap_id).' },
        { status: 400 },
      );
    }

    const updatePayload: { status?: TastingRequestStatus; recap_id?: string | null } = {};
    if (status) updatePayload.status = status;
    if (recap_id !== undefined) updatePayload.recap_id = recap_id;

    // Scope update to the user's team to prevent cross-team data access
    const { data, error } = await sb
      .from('tasting_requests')
      .update(updatePayload)
      .eq('id', id)
      .eq('team_id', teamId)
      .select('id, status, recap_id')
      .single();

    if (error) {
      const httpStatus = error.code === 'PGRST116' ? 404 : 500;
      return NextResponse.json({ error: mapDbError(error) }, { status: httpStatus });
    }

    return NextResponse.json({ ok: true, id: data.id, status: data.status, recap_id: data.recap_id });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: mapDbError(e) }, { status: 500 });
  }
}
