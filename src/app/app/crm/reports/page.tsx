// src/app/app/crm/reports/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getProductPerformance,
  getFollowUpQueue,
  getVisitsBySupplier,
  getProductsByBuyer,
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

  const [
    { data: performance },
    { data: followUps },
    visitsBySupplier,
    productsByBuyer,
    dashboardStats,
    topSkus,
    topAccounts,
    salespersonStats,
    salespersonTrend,
    inactiveAccounts,
    pipelineHealth,
    expenses,
  ] = await Promise.all([
    getProductPerformance(sb, { page: 0, pageSize: 50 }),
    getFollowUpQueue(sb, { page: 0, pageSize: 100 }),
    getVisitsBySupplier(sb),
    getProductsByBuyer(sb),
    getDashboardStats(sb),
    getTopSkus(sb, 5),
    getTopAccounts(sb, 5),
    getSalespersonStats(sb),
    getSalespersonWeeklyTrend(sb),
    getInactiveAccounts(sb, 60),
    getPipelineHealth(sb),
    getExpenseRecaps(sb),
  ]);

  return (
    <ReportsClient
      performance={performance}
      followUps={followUps}
      visitsBySupplier={visitsBySupplier}
      productsByBuyer={productsByBuyer}
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
