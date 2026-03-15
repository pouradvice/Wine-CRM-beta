// src/app/app/crm/reports/salesperson/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSalespersonStats, getSalespersonWeeklyTrend } from '@/lib/data';
import { SalespersonClient } from '@/components/reports/SalespersonClient';

export const dynamic = 'force-dynamic';

export default async function SalespersonPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [stats, trend] = await Promise.all([
    getSalespersonStats(sb),
    getSalespersonWeeklyTrend(sb),
  ]);

  return <SalespersonClient allStats={stats} allTrend={trend} />;
}
