// src/app/api/public/subscribe/route.ts
// Public (no auth) — handles opt-in form submissions from the tasting page.
//
// POST /api/public/subscribe
// Body: { team_id, name, email, company?, role? }

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createEmailSubscriber } from '@/lib/data';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS });
  }

  const { team_id, name, email, company, role } = body as Record<string, string | undefined>;

  if (!team_id || !name || !email) {
    return NextResponse.json(
      { error: 'team_id, name, and email are required' },
      { status: 400, headers: CORS },
    );
  }

  // Basic email format guard
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400, headers: CORS });
  }

  try {
    const sb  = createServiceClient();
    const sub = await createEmailSubscriber(
      { team_id, name, email, company: company ?? null, role: role ?? null, active: true },
      sb,
    );
    return NextResponse.json({ subscriber: sub }, { status: 201, headers: CORS });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Treat duplicate email as a success (idempotent opt-in)
    if (msg.includes('already exists')) {
      return NextResponse.json({ message: 'Already subscribed' }, { status: 200, headers: CORS });
    }
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
