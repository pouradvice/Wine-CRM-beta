// src/app/api/products/create/route.ts
// POST /api/products/create
// Creates a single product using the service-role client (bypasses RLS).
// User identity is verified with the anon client first; team_id is resolved
// from team_members before the service-role INSERT is executed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { mapDbError } from '@/types';

interface CreateProductBody {
  sku_number: string;
  wine_name: string;
  type?: string;
  varietal?: string;
  country?: string;
  region?: string;
  appellation?: string;
  vintage?: string;
  distributor?: string;
  btg_cost?: number | string;
  frontline_cost?: number | string;
  notes?: string;
}

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CreateProductBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const skuNumber = String(body.sku_number || '').trim();
  if (!skuNumber) {
    return NextResponse.json({ error: 'sku_number is required' }, { status: 400 });
  }

  const wineName = String(body.wine_name || '').trim();
  if (!wineName) {
    return NextResponse.json({ error: 'wine_name is required' }, { status: 400 });
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

  // Parse numeric fields safely
  const btgCost = body.btg_cost != null
    ? /^\d+(\.\d+)?$/.test(String(body.btg_cost))
      ? parseFloat(String(body.btg_cost))
      : null
    : null;

  const frontlineCost = body.frontline_cost != null
    ? /^\d+(\.\d+)?$/.test(String(body.frontline_cost))
      ? parseFloat(String(body.frontline_cost))
      : null
    : null;

  // Use service role for the INSERT (bypasses RLS completely).
  const sbService = createServiceClient();

  const { data, error } = await sbService
    .from('products')
    .upsert(
      {
        team_id,
        sku_number: skuNumber,
        wine_name: wineName,
        type: body.type ? String(body.type).trim() || null : null,
        varietal: body.varietal ? String(body.varietal).trim() || null : null,
        country: body.country ? String(body.country).trim() || null : null,
        region: body.region ? String(body.region).trim() || null : null,
        appellation: body.appellation ? String(body.appellation).trim() || null : null,
        vintage: body.vintage ? String(body.vintage).trim() || null : null,
        distributor: body.distributor ? String(body.distributor).trim() || null : null,
        btg_cost: btgCost,
        frontline_cost: frontlineCost,
        notes: body.notes ? String(body.notes).trim() || null : null,
        is_active: true,
      },
      { onConflict: 'sku_number,team_id' }
    )
    .select('id, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: mapDbError(error) }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
