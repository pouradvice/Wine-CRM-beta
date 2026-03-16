// src/app/api/onboarding/complete/route.ts
// POST /api/onboarding/complete
// Marks onboarding as finished for the authenticated user.
// This route must never block the user — errors are silently swallowed.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { accounts_imported?: number; products_imported?: number } = {};
  try {
    body = await request.json();
  } catch {
    // Malformed body is acceptable — defaults will be used
  }

  const accounts_imported = typeof body.accounts_imported === 'number' ? body.accounts_imported : 0;
  const products_imported = typeof body.products_imported === 'number' ? body.products_imported : 0;

  // Fire and forget — result intentionally ignored to never block the user
  await sb.rpc('mark_onboarding_complete', {
    p_accounts_imported: accounts_imported,
    p_products_imported: products_imported,
  });

  return NextResponse.json({ ok: true });
}
