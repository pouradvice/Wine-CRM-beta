// src/app/app/crm/follow-ups/page.tsx
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getFollowUpQueue } from '@/lib/data';
import { resolveTeamId } from '@/lib/team';
import { FollowUpsClient } from '@/components/follow-ups/FollowUpsClient';

export const dynamic = 'force-dynamic';

export default async function FollowUpsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const teamId = await resolveTeamId(sb, user);

  const { data: followUps, count } = await getFollowUpQueue(sb, { page: 0, pageSize: 50 }, teamId);

  return <FollowUpsClient initialFollowUps={followUps} totalCount={count} />;
}
