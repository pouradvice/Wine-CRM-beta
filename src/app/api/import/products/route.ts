// src/app/api/import/products/route.ts
// POST /api/import/products
// Accepts { rows: ProductInsert[] }, imports in batches, returns succeeded/failed counts.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { upsertProduct } from '@/lib/data';
import type { ProductInsert } from '@/types';

interface ImportBody {
  rows: Array<Record<string, unknown>>;
}

interface ImportResponse {
  succeeded: number;
  failed: Array<{ index: number; error: string }>;
}

export async function POST(request: NextRequest) {
  // Auth check with anon client
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamId: string =
    (user.user_metadata?.team_id as string | undefined) ?? user.id;

  let body: ImportBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
  }

  const succeeded: number[] = [];
  const failed: Array<{ index: number; error: string }> = [];

  const results = await Promise.allSettled(
    body.rows.map((row, index) =>
      upsertProduct(sb, {
        ...(row as ProductInsert),
        team_id: teamId,
        is_active: true,
      } as ProductInsert & { id?: string }),
    ),
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      succeeded.push(index);
    } else {
      const err = result.reason as Error | { code?: string; message?: string };
      failed.push({
        index,
        error: 'message' in err ? (err.message ?? 'Unknown error') : 'Unknown error',
      });
    }
  });

  const response: ImportResponse = {
    succeeded: succeeded.length,
    failed,
  };

  return NextResponse.json(response, { status: 200 });
}
