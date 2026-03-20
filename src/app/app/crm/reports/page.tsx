// src/app/app/crm/reports/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getProductPerformance,
  getVisitsBySupplier,
  getDashboardStats,
  getTopSkus,
  getTopAccounts,
  getInactiveAccounts,
  getPipelineHealth,
  getExpenseRecaps,
  getAccountsReport,
  getWeeklySummaries,
} from '@/lib/data';
import { ReportsClient } from '@/components/reports/ReportsClient';
import { resolveTeamId } from '@/lib/team';
import type { DashboardStats } from '@/types';

export const dynamic = 'force-dynamic';

const DEFAULT_STATS: DashboardStats = {
  visits_this_month:         0,
  conversion_rate_pct:       null,
  events_this_month:         0,
  off_site_this_month:       0,
  new_placements_this_month: 0,
};

async function safe<T>(promise: Promise<T>, fallback: T): Promise<T> {
  try { return await promise; } catch { return fallback; }
}

export default async function ReportsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  const [
    performanceResult,
    visitsBySupplier,
    dashboardStats,
    topSkus,
    topAccounts,
    inactiveAccounts,
    pipelineHealth,
    expenses,
    accountsReport,
    weeklySummaries,
  ] = await Promise.all([
    safe(getProductPerformance(sb, { page: 0, pageSize: 50 }, teamId), { data: [], count: 0 }),
    safe(getVisitsBySupplier(sb, teamId), []),
    safe(getDashboardStats(sb, teamId), DEFAULT_STATS),
    safe(getTopSkus(sb, 5, teamId), []),
    safe(getTopAccounts(sb, 5, teamId), []),
    safe(getInactiveAccounts(sb, 60, teamId), []),
    safe(getPipelineHealth(sb, teamId), []),
    safe(getExpenseRecaps(sb, { teamId }), []),
    safe(getAccountsReport(sb, teamId), []),
    safe(getWeeklySummaries(sb, teamId), []),
  ]);

  return (
    <ReportsClient
      teamId={teamId}
      performance={performanceResult.data}
      visitsBySupplier={visitsBySupplier}
      dashboardStats={dashboardStats}
      topSkus={topSkus}
      topAccounts={topAccounts}
      inactiveAccounts={inactiveAccounts}
      pipelineHealth={pipelineHealth}
      expenses={expenses}
      accountsReport={accountsReport}
      weeklySummaries={weeklySummaries}
    />
  );
}
