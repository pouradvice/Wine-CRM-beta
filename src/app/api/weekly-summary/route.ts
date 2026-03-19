// src/app/api/weekly-summary/route.ts
// POST /api/weekly-summary
//
// Generates and persists a weekly summary for a given Mon–Sun period.

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { generateAndSaveWeeklySummary } from '@/lib/data';
import { resolveTeamId } from '@/lib/team';

export async function POST(request: NextRequest) {
  // 1. Auth guard
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: { weekStart?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { weekStart } = body;

  // 3. Validate weekStart
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: 'weekStart must be a date in YYYY-MM-DD format' }, { status: 400 });
  }

  const date = new Date(weekStart + 'T00:00:00Z');
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: 'weekStart is not a valid date' }, { status: 400 });
  }

  // Day 1 = Monday (getUTCDay() returns 0=Sun, 1=Mon, ... 6=Sat)
  if (date.getUTCDay() !== 1) {
    return NextResponse.json({ error: 'weekStart must be a Monday (ISO week starts on Monday)' }, { status: 400 });
  }

  // 4. Resolve team
  let teamId: string | null;
  try {
    teamId = await resolveTeamId(sb, user);
  } catch {
    return NextResponse.json({ error: 'Team not found' }, { status: 403 });
  }
  if (!teamId) {
    return NextResponse.json({ error: 'Team not found' }, { status: 403 });
  }

  // 5. Generate and save using the service client (bypasses RLS for the write)
  const serviceSb = createServiceClient();
  try {
    const summary = await generateAndSaveWeeklySummary(serviceSb, teamId, weekStart, user.id);
    return NextResponse.json({ summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate summary';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
