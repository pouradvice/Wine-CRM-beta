// src/app/app/crm/plan/review/page.tsx
// Sprint 3 — Plan Review
// Server Component: reads the plan_session_id cookie, validates the session,
// fetches all context in two queries (no N+1), and passes everything to
// PlanReviewClient.
//
// Security: RLS on daily_plan_sessions enforces user_id = auth.uid().
// See SECURITY.md Surface 1 for why no redundant .eq('user_id', ...) is needed.

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { todayLocal } from '@/lib/dateUtils';
import { PlanReviewClient } from '@/components/plan/PlanReviewClient';
import type { DailyPlanSession } from '@/types';

export const dynamic = 'force-dynamic';

export default async function PlanReviewPage() {
  // 1. Read cookie
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('plan_session_id')?.value;
  if (!sessionId) redirect('/app/crm/plan');

  // 2. Auth guard
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  // 3. Fetch session — RLS enforces user_id = auth.uid(), no extra filter needed
  const { data: session } = await sb
    .from('daily_plan_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  // 4. Stale or missing cookie
  if (!session) redirect('/app/crm/plan');

  const typedSession = session as DailyPlanSession;

  // 5. Session is from a different day — delete cookie and redirect
  if (typedSession.plan_date !== todayLocal()) {
    cookieStore.delete('plan_session_id');
    redirect('/app/crm/plan');
  }

  // 6. Fetch account context in ONE query (no N+1)
  const { data: rawAccounts } = await sb
    .from('accounts')
    .select(`
      id,
      name,
      value_tier,
      recaps(visit_date),
      follow_ups!follow_ups_account_id_fkey(id, status)
    `)
    .in('id', typedSession.account_ids)
    .eq('team_id', typedSession.team_id);

  // 7. Fetch session products (skip if bag is empty)
  const sessionProducts =
    typedSession.product_ids.length === 0
      ? []
      : await sb
          .from('products')
          .select('id, wine_name, sku_number, type')
          .in('id', typedSession.product_ids)
          .eq('is_active', true)
          .then(({ data }) => data ?? []);

  // 8. Derive AccountWithContext (max visit_date, count of open/snoozed follow-ups)
  const accountContext = (rawAccounts ?? []).map((a) => {
    const visitDates: string[] = (a.recaps ?? [])
      .map((r: { visit_date: string }) => r.visit_date)
      .filter(Boolean);
    const last_visit_date =
      visitDates.length > 0
        ? visitDates.sort((x, y) => y.localeCompare(x))[0]
        : null;

    const open_follow_ups = (a.follow_ups ?? []).filter(
      (f: { status: string }) => f.status === 'Open' || f.status === 'Snoozed',
    ).length;

    return {
      id:              a.id as string,
      name:            a.name as string,
      value_tier:      a.value_tier as ('A' | 'B' | 'C') | null,
      last_visit_date,
      open_follow_ups,
    };
  });

  // 9. Detect all-done
  const allDone = typedSession.account_ids.every((id) =>
    typedSession.completed_account_ids.includes(id),
  );

  // 10. If all done, clear the cookie
  if (allDone) {
    cookieStore.delete('plan_session_id');
  }

  return (
    <PlanReviewClient
      session={typedSession}
      accountContext={accountContext}
      sessionProducts={sessionProducts}
      allDone={allDone}
    />
  );
}
