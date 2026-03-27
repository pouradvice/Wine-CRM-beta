// src/app/api/public/brands/route.ts
// Public (no auth) — returns active brands + SKUs for a team.
// Used by the /taste page and can be called by external embeds.
//
// GET /api/public/brands?team=<team_id>

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getActiveBrandsWithProducts, getTeamSettings } from '@/lib/data';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('team');
  if (!teamId) {
    return NextResponse.json({ error: 'Missing team param' }, { status: 400, headers: CORS });
  }

  try {
    const sb = createServiceClient();
    const [brands, settings] = await Promise.all([
      getActiveBrandsWithProducts(teamId, sb),
      getTeamSettings(teamId, sb),
    ]);

    return NextResponse.json({ brands, settings }, { status: 200, headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
