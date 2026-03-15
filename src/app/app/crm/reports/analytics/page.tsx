// src/app/app/crm/reports/analytics/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getProductPerformance,
  getFollowUpQueue,
  getVisitsBySupplier,
  getProductsByBuyer,
} from '@/lib/data';
import { ReportsClient } from '@/components/reports/ReportsClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [
    { data: performance },
    { data: followUps },
    visitsBySupplier,
    productsByBuyer,
  ] = await Promise.all([
    getProductPerformance(sb, { page: 0, pageSize: 50 }),
    getFollowUpQueue(sb, { page: 0, pageSize: 100 }),
    getVisitsBySupplier(sb),
    getProductsByBuyer(sb),
  ]);

  return (
    <ReportsClient
      performance={performance}
      followUps={followUps}
      visitsBySupplier={visitsBySupplier}
      productsByBuyer={productsByBuyer}
    />
  );
}
