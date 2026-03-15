// src/app/api/buyers/route.ts
// GET  /api/buyers?clientId=&page=0&pageSize=50
// POST /api/buyers
//
// The GET with clientId is called by RecapForm when a client is selected,
// replacing the pre-loaded buyers prop that was previously passed from the
// server component.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getBuyers, upsertBuyer } from '@/lib/data';
import { mapDbError } from '@/types';
import type { BuyerInsert } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient();
    const { searchParams } = new URL(request.url);

    const clientId = searchParams.get('clientId') ?? undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 0;
    const pageSize = searchParams.get('pageSize')
      ? Number(searchParams.get('pageSize'))
      : 50;

    const result = await getBuyers(sb, clientId, { page, pageSize });
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapDbError(err);
    return NextResponse.json(mapped, { status: statusFromCode(mapped.code) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient();
    const body: BuyerInsert = await request.json();
    const buyer = await upsertBuyer(sb, body);
    return NextResponse.json(buyer, { status: 201 });
  } catch (err) {
    const mapped = mapDbError(err);
    return NextResponse.json(mapped, { status: statusFromCode(mapped.code) });
  }
}

function statusFromCode(code: string): number {
  switch (code) {
    case 'PGRST116': return 404;
    case '23505':    return 409;
    case '23503':    return 422;
    default:         return 500;
  }
}
