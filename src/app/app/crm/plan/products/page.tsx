// src/app/app/crm/plan/products/page.tsx
// Server Component wrapper for the "Start with Products" planning flow.
// Product search is handled client-side via /api/products, so no data fetch needed.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { PlanProductsClient } from '@/components/plan/PlanProductsClient';

export const dynamic = 'force-dynamic';

export default async function PlanProductsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  return <PlanProductsClient teamId={teamId} />;
}
