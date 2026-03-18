// src/app/app/crm/plan/accounts/page.tsx
// Server Component wrapper for the "Start with Accounts" planning flow.
// Loads the team's active accounts list and passes them to PlanAccountsClient.

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getAccounts } from '@/lib/data';
import { resolveTeamId } from '@/lib/team';
import { PlanAccountsClient } from '@/components/plan/PlanAccountsClient';

export const dynamic = 'force-dynamic';

export default async function PlanAccountsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  const { data: accounts } = await getAccounts(sb, 'Active', { page: 0, pageSize: 200 }, teamId);

  return <PlanAccountsClient accounts={accounts} teamId={teamId} />;
}
