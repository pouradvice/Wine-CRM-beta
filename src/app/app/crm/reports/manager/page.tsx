// src/app/app/crm/reports/manager/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getSalespersonStats,
  getInactiveAccounts,
  getPipelineHealth,
} from '@/lib/data';
import { ManagerClient } from '@/components/reports/ManagerClient';

export const dynamic = 'force-dynamic';

export default async function ManagerPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [teamStats, inactiveAccounts, pipelineHealth] = await Promise.all([
    getSalespersonStats(sb),
    getInactiveAccounts(sb, 60),
    getPipelineHealth(sb),
  ]);

  return (
    <ManagerClient
      teamStats={teamStats}
      inactiveAccounts={inactiveAccounts}
      pipelineHealth={pipelineHealth}
    />
  );
}
