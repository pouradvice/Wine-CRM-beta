// src/app/api/contacts/route.ts
// GET /api/contacts?accountId=<uuid>&page=0&pageSize=50

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getContacts } from '@/lib/data';
import { mapDbError } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const sb = await createClient();
    const { searchParams } = new URL(request.url);

    const accountId = searchParams.get('accountId') ?? undefined;
    const page      = searchParams.get('page')     ? Number(searchParams.get('page'))     : 0;
    const pageSize  = searchParams.get('pageSize') ? Number(searchParams.get('pageSize')) : 50;

    const result = await getContacts(sb, accountId, { page, pageSize });
    return NextResponse.json(result);
  } catch (err) {
    const mapped = mapDbError(err as { code?: string; message?: string });
    return NextResponse.json(mapped, { status: 500 });
  }
}
