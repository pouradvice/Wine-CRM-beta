// src/app/api/follow-ups/[id]/route.ts
// PATCH /api/follow-ups/[id]

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { updateFollowUpStatus } from '@/lib/data';
import { mapDbError } from '@/types';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const sb = await createClient();
    const body: { status: 'Completed' | 'Snoozed'; snoozed_until?: string } =
      await request.json();

    await updateFollowUpStatus(sb, id, body);
    return NextResponse.json({ success: true });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const status = e.code === 'PGRST116' ? 404 : e.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: mapDbError(e) }, { status });
  }
}
