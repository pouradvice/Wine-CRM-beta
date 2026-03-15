// src/app/app/crm/reports/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getDashboardStats,
  getTopSkus,
  getTopAccounts,
} from '@/lib/data';
import { DashboardClient } from '@/components/reports/DashboardClient';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [stats, topSkus, topAccounts] = await Promise.all([
    getDashboardStats(sb),
    getTopSkus(sb, 5),
    getTopAccounts(sb, 5),
  ]);

  return (
    <DashboardClient
      stats={stats}
      topSkus={topSkus}
      topAccounts={topAccounts}
    />
  );
}
