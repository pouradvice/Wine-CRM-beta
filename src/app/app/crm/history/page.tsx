// src/app/app/crm/history/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRecaps } from '@/lib/data';
import { HistoryClient } from '@/components/history/HistoryClient';
import { resolveTeamId } from '@/lib/team';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);
  const { data: recaps, count } = await getRecaps(sb, { page: 0, pageSize: 25, teamId });

  return <HistoryClient initialRecaps={recaps} totalCount={count} />;
}
