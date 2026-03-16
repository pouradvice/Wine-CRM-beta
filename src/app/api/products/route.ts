// src/app/api/products/route.ts
// GET  /api/products?search=&limit=20&page=0&pageSize=50&includeInactive=false&brandId=
// POST /api/products

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProducts, upsertProduct } from '@/lib/data';
import { mapDbError } from '@/types';
import type { ProductInsert } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient();

    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberRow } = await sb
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .maybeSingle();
    const teamId: string | undefined = memberRow?.team_id ?? undefined;

    const { searchParams } = new URL(request.url);

    const search = searchParams.get('search') ?? undefined;
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const brandId = searchParams.get('brandId') ?? undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 0;
    const pageSize = searchParams.get('pageSize')
      ? Number(searchParams.get('pageSize'))
      : 50;
    const limit = searchParams.get('limit')
      ? Math.min(Number(searchParams.get('limit')), 100)
      : undefined;

    const result = await getProducts(sb, {
      includeInactive,
      brandId,
      search,
      page,
      pageSize,
      limit,
      teamId,
    });

    return NextResponse.json(result);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: mapDbError(e) }, { status: statusFromCode(e.code) });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sb = await createClient();
    const body: ProductInsert = await request.json();
    const product = await upsertProduct(sb, body);
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return NextResponse.json({ error: mapDbError(e) }, { status: statusFromCode(e.code) });
  }
}

function statusFromCode(code: string | undefined): number {
  switch (code) {
    case 'PGRST116': return 404;
    case '23505':    return 409;
    case '23503':    return 422;
    default:         return 500;
  }
}
