// src/app/app/crm/follow-ups/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getFollowUpQueue } from '@/lib/data';
import { FollowUpsClient } from '@/components/follow-ups/FollowUpsClient';

export const dynamic = 'force-dynamic';

export default async function FollowUpsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: followUps, count } = await getFollowUpQueue(sb, { page: 0, pageSize: 50 });

  return <FollowUpsClient initialFollowUps={followUps} totalCount={count} />;
}
