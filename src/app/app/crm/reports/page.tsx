// src/app/app/crm/reports/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getProductPerformance,
  getFollowUpQueue,
  getVisitsBySupplier,
  getProductsByContact,
  getDashboardStats,
  getTopSkus,
  getTopAccounts,
  getSalespersonStats,
  getSalespersonWeeklyTrend,
  getInactiveAccounts,
  getPipelineHealth,
  getExpenseRecaps,
} from '@/lib/data';
import { ReportsClient } from '@/components/reports/ReportsClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: memberRow } = await sb
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();
  const teamId = memberRow?.team_id as string | undefined;

  const [
    { data: performance },
    { data: followUps },
    visitsBySupplier,
    productsByContact,
    dashboardStats,
    topSkus,
    topAccounts,
    salespersonStats,
    salespersonTrend,
    inactiveAccounts,
    pipelineHealth,
    expenses,
  ] = await Promise.all([
    getProductPerformance(sb, { page: 0, pageSize: 50 }, teamId),
    getFollowUpQueue(sb, { page: 0, pageSize: 100 }, teamId),
    getVisitsBySupplier(sb, teamId),
    getProductsByContact(sb),
    getDashboardStats(sb, teamId),
    getTopSkus(sb, 5, teamId),
    getTopAccounts(sb, 5, teamId),
    getSalespersonStats(sb, { teamId }),
    getSalespersonWeeklyTrend(sb, { teamId }),
    getInactiveAccounts(sb, 60, teamId),
    getPipelineHealth(sb, teamId),
    getExpenseRecaps(sb, { teamId }),
  ]);

  return (
    <ReportsClient
      performance={performance}
      followUps={followUps}
      visitsBySupplier={visitsBySupplier}
      productsByContact={productsByContact}
      dashboardStats={dashboardStats}
      topSkus={topSkus}
      topAccounts={topAccounts}
      salespersonStats={salespersonStats}
      salespersonTrend={salespersonTrend}
      inactiveAccounts={inactiveAccounts}
      pipelineHealth={pipelineHealth}
      expenses={expenses}
    />
  );
}
