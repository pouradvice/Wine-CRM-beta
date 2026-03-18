// src/app/app/crm/plan/page.tsx
// Plan builder — lets the user pick accounts and products for today's route,
// then POSTs to /api/plan/save and redirects to /app/crm/plan/review.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveTeamId } from '@/lib/team';
import { PlanBuilderClient } from '@/components/plan/PlanBuilderClient';
import { getAccounts } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function PlanPage() {
  const sb = await createClient();

  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  const { data: accounts } = await getAccounts(sb, 'Active', { page: 0, pageSize: 200 }, teamId);

  return <PlanBuilderClient accounts={accounts} />;
}
